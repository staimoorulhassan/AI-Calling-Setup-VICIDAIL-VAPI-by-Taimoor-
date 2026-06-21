"""
ACS 3-Way Transfer — VAPI webhook server.

Runs as a Flask HTTP server (systemd: acs-webhook.service) on the VPS.
Receives VAPI tool-call webhooks for `request_transfer` and orchestrates
an Asterisk ConfBridge between the lead and a human verifier.

Start: python3.11 transfer_webhook.py
"""

import json
import logging
import time
import yaml
from flask import Flask, request, jsonify
from transfer_bridge import do_transfer, AMIConnectionError, ChannelGoneError, InvalidVerifierError

app = Flask(__name__)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
)
log = logging.getLogger(__name__)

_CONFIG = None
# call_id -> unix timestamp of when transfer was initiated (60 s TTL)
_in_flight: dict = {}
_IN_FLIGHT_TTL = 60


def _load_config():
    """Load and cache /etc/ai_agent/config.yaml. Returns the parsed dict."""
    global _CONFIG
    if _CONFIG is None:
        with open('/etc/ai_agent/config.yaml', 'r') as f:
            _CONFIG = yaml.safe_load(f)
    return _CONFIG


def _structured(event: str, **kwargs):
    """Emit a structured JSON log line with an ISO-8601 UTC timestamp."""
    record = {"event": event, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **kwargs}
    log.info(json.dumps(record))


def _purge_in_flight():
    """Remove stale in-flight entries older than _IN_FLIGHT_TTL seconds."""
    cutoff = time.time() - _IN_FLIGHT_TTL
    stale = [k for k, v in _in_flight.items() if v < cutoff]
    for k in stale:
        del _in_flight[k]


@app.route('/health', methods=['GET'])
def health():
    """Liveness probe — returns 200 OK if the server is running."""
    return jsonify({"status": "ok"})


@app.route('/webhooks/vapi/tool-call', methods=['POST'])
def vapi_tool_call():
    """Handle VAPI tool-call webhook for the request_transfer tool.

    Expects JSON body: {message: {call: {id}, toolCallList: [{id, name, parameters}]}}
    Validates x-vapi-secret header, deduplicates in-flight transfers (FR-007),
    and orchestrates a 3-way ConfBridge via transfer_bridge.do_transfer().
    """
    cfg = _load_config()
    transfer_cfg = cfg.get('transfer', {})

    # Validate webhook secret (FR security)
    expected_secret = transfer_cfg.get('webhook_secret', '')
    if not expected_secret:
        log.error(json.dumps({"event": "webhook_secret_not_configured"}))
        return jsonify({"error": "server misconfiguration: webhook_secret not set"}), 500
    incoming = request.headers.get('x-vapi-secret', '')
    if incoming != expected_secret:
        log.warning(json.dumps({"event": "webhook_auth_failed", "ip": request.remote_addr}))
        return jsonify({"error": "unauthorized"}), 401

    body = request.get_json(silent=True) or {}

    # VAPI sends nested: body.message.toolCallList[0]
    message = body.get('message', body)
    tool_calls = message.get('toolCallList', [])
    call_meta = message.get('call', {})
    vapi_call_id = call_meta.get('id') or body.get('call_id', '')

    # Find the request_transfer tool call
    tc = next((t for t in tool_calls if t.get('name') == 'request_transfer'), None)
    if tc is None:
        return jsonify({"results": []}), 200

    tool_call_id = tc.get('id', '')
    params = tc.get('parameters', {})

    if not vapi_call_id:
        return jsonify({"error": "missing call_id"}), 400

    _purge_in_flight()

    # FR-007 Idempotency
    if vapi_call_id in _in_flight:
        _structured("transfer_already_in_progress", call_id=vapi_call_id)
        return jsonify({
            "results": [{"toolCallId": tool_call_id, "result": "Transfer already in progress."}],
            "status": "already_in_progress",
        }), 200

    verifier_number = params.get('verifier_number') or transfer_cfg.get('verifier_number', '')
    lead_name = params.get('lead_name', '')
    product_name = params.get('product_name', '')
    timeout = int(transfer_cfg.get('conf_bridge_timeout', 30))

    _structured(
        "transfer_initiated",
        call_id=vapi_call_id,
        verifier=verifier_number,
        lead_name=lead_name,
        product_name=product_name,
    )

    _in_flight[vapi_call_id] = time.time()

    try:
        result = do_transfer(
            cfg=cfg,
            vapi_call_id=vapi_call_id,
            verifier_number=verifier_number,
            lead_name=lead_name,
            product_name=product_name,
            conf_timeout=timeout,
        )
    except InvalidVerifierError as exc:
        del _in_flight[vapi_call_id]
        _structured("transfer_failed", call_id=vapi_call_id, reason="invalid_verifier", detail=str(exc))
        return jsonify({
            "results": [{"toolCallId": tool_call_id, "result": "Transfer failed — verifier number not configured."}],
        }), 422
    except AMIConnectionError as exc:
        del _in_flight[vapi_call_id]
        _structured("transfer_failed", call_id=vapi_call_id, reason="ami_unavailable", detail=str(exc))
        return jsonify({
            "results": [{"toolCallId": tool_call_id, "result": "Transfer failed — system issue. Continuing conversation."}],
        }), 503
    except ChannelGoneError:
        del _in_flight[vapi_call_id]
        _structured("transfer_failed", call_id=vapi_call_id, reason="channel_gone")
        return jsonify({
            "results": [{"toolCallId": tool_call_id, "result": "Transfer failed — call already ended."}],
        }), 410
    except Exception as exc:
        del _in_flight[vapi_call_id]
        _structured("transfer_failed", call_id=vapi_call_id, reason="unexpected", detail=str(exc))
        log.exception("Unexpected error in do_transfer")
        return jsonify({
            "results": [{"toolCallId": tool_call_id, "result": "Transfer failed — unexpected error."}],
        }), 500

    if result == "bridged":
        _structured("transfer_bridged", call_id=vapi_call_id, verifier=verifier_number)
        vapi_response = "Transfer initiated. Connecting you to our specialist now."
        status = "initiated"
    else:
        _structured("transfer_timeout", call_id=vapi_call_id)
        vapi_response = "I was unable to connect a specialist right now. Someone will follow up with you shortly."
        status = "timeout"

    return jsonify({
        "results": [{"toolCallId": tool_call_id, "result": vapi_response}],
        "status": status,
    }), 200


if __name__ == '__main__':
    cfg = _load_config()
    port = int(cfg.get('transfer', {}).get('webhook_port', 8088))
    log.info(json.dumps({"event": "webhook_server_start", "port": port}))
    app.run(host='0.0.0.0', port=port)
