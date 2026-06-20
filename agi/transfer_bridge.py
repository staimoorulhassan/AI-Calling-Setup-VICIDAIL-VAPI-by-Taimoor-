"""
ACS 3-Way Transfer — AMI bridge orchestration.

Handles the actual Asterisk AMI calls to:
1. Find the lead's active channel by VAPI call_id
2. Redirect the lead into [ai-transfer-verifier] context (ConfBridge waiting)
3. Originate an outbound call to the verifier
4. Poll until verifier joins the ConfBridge
5. Hang up the VAPI SIP leg
6. On timeout: set CALLBK disposition

Used by transfer_webhook.py (US1 AI-triggered).
"""

import asyncio
import json
import logging
import time
import uuid

import panoramisk

log = logging.getLogger(__name__)


class AMIConnectionError(Exception):
    pass


class ChannelGoneError(Exception):
    pass


def _ami_creds(cfg: dict) -> tuple:
    """
    Extract AMI connection parameters from configuration.
    
    Parameters:
    	cfg (dict): Configuration dictionary containing an optional 'ami' key with connection parameters.
    
    Returns:
    	tuple: (host, port, username, secret) where host defaults to '127.0.0.1', port to 5038, and username/secret to empty strings.
    """
    ami = cfg.get('ami', {})
    return (
        ami.get('host', '127.0.0.1'),
        int(ami.get('port', 5038)),
        ami.get('username', ''),
        ami.get('secret', ''),
    )


def do_transfer(
    cfg: dict,
    vapi_call_id: str,
    verifier_number: str,
    lead_name: str = '',
    product_name: str = '',
    conf_timeout: int = 30,
) -> str:
    """
    Transfer a lead into a ConfBridge-based verifier flow.
    
    Parameters:
        vapi_call_id (str): The VAPI call identifier for locating the lead channel.
        verifier_number (str): The phone number to call for the verifier.
        conf_timeout (int): Maximum seconds to wait for the verifier to join the bridge.
    
    Returns:
        str: `"bridged"` if the verifier successfully joins the bridge within the timeout, `"timeout"` otherwise.
    
    Raises:
        AMIConnectionError: If the connection to the Asterisk AMI server fails.
        ChannelGoneError: If no active channel is found for the given `vapi_call_id`.
    """
    return asyncio.run(_do_transfer_async(
        cfg=cfg,
        vapi_call_id=vapi_call_id,
        verifier_number=verifier_number,
        lead_name=lead_name,
        product_name=product_name,
        conf_timeout=conf_timeout,
    ))


async def _do_transfer_async(cfg, vapi_call_id, verifier_number, lead_name, product_name, conf_timeout):
    """
    Orchestrate the transfer of a VAPI lead into a verifier conference bridge via AMI.
    
    Connects to the Asterisk AMI server, locates the lead's active channel, redirects
    it into the verifier context, originates an outbound call to the verifier, and
    polls until the verifier joins the bridge or the timeout expires.
    
    Parameters:
    	vapi_call_id (str): Identifier for the VAPI SIP leg to transfer.
    	verifier_number (str): Phone number to originate the verifier call to.
    	lead_name (str): Name of the lead passed to the verifier context.
    	product_name (str): Product name passed to the verifier context.
    	conf_timeout (int): Maximum seconds to wait for the verifier to join.
    
    Returns:
    	str: "bridged" if the verifier joins the bridge, "timeout" if the verifier
    	     does not join within the timeout period.
    
    Raises:
    	AMIConnectionError: If connection to the AMI server fails.
    	ChannelGoneError: If no active Asterisk channel is found for vapi_call_id.
    """
    host, port, username, secret = _ami_creds(cfg)

    manager = panoramisk.Manager(host=host, port=port, username=username, secret=secret)

    try:
        await manager.connect()
    except Exception as exc:
        raise AMIConnectionError(f"AMI connect failed: {exc}") from exc

    try:
        lead_channel, lead_uniqueid, lead_id = await _find_lead_channel(manager, vapi_call_id)
    except ChannelGoneError:
        manager.close()
        raise

    conf_id = lead_uniqueid.replace('.', '-')
    outbound_cfg = cfg.get('outbound', {})
    caller_id = outbound_cfg.get('caller_id_num', '')
    caller_name = outbound_cfg.get('caller_id_name', 'ACS Transfer')

    await _ami_redirect_lead(manager, lead_channel, conf_id, lead_id)

    await _ami_originate_verifier(
        manager=manager,
        verifier_number=verifier_number,
        conf_id=conf_id,
        lead_name=lead_name,
        product_name=product_name,
        lead_id=lead_id,
        caller_id=caller_id,
        caller_name=caller_name,
        timeout_sec=conf_timeout,
    )

    verifier_joined = await _poll_for_verifier(manager, conf_id, conf_timeout)

    if not verifier_joined:
        try:
            await manager.send_action({
                'Action': 'Setvar',
                'Channel': lead_channel,
                'Variable': 'TRANSFER_RESULT',
                'Value': 'CALLBK',
            })
        except Exception:
            pass
        manager.close()
        _log_event("transfer_timeout_callbk", vapi_call_id=vapi_call_id, conf_id=conf_id)
        return "timeout"

    try:
        await manager.send_action({
            'Action': 'Setvar',
            'Channel': lead_channel,
            'Variable': 'TRANSFER_RESULT',
            'Value': 'SCHDL',
        })
    except Exception:
        pass

    await _hangup_vapi_channel(manager, vapi_call_id)
    manager.close()
    return "bridged"


async def _find_lead_channel(manager, vapi_call_id: str) -> tuple:
    """
    Locate the active Asterisk channel associated with the given VAPI call ID.
    
    Queries AMI to find a channel whose VAPI_CALL_ID variable matches the input,
    then retrieves the corresponding lead ID.
    
    Returns:
        tuple: A tuple containing (channel_name, uniqueid, lead_id), where channel_name
            is the matched Asterisk channel name, uniqueid is the channel's unique identifier,
            and lead_id is the LEAD_ID variable value for that channel.
    
    Raises:
        ChannelGoneError: If no active channel is found with the given VAPI call ID.
    """
    resp = await manager.send_action({'Action': 'CoreShowChannels'})
    channels = resp if isinstance(resp, list) else []

    for chan in channels:
        ch_name = chan.get('Channel', '')
        if not ch_name:
            continue
        var_resp = await manager.send_action({
            'Action': 'Getvar', 'Channel': ch_name, 'Variable': 'VAPI_CALL_ID',
        })
        val = var_resp.get('Value', '') if isinstance(var_resp, dict) else ''
        if val == vapi_call_id:
            uniqueid = chan.get('Uniqueid', ch_name)
            lead_var = await manager.send_action({
                'Action': 'Getvar', 'Channel': ch_name, 'Variable': 'LEAD_ID',
            })
            lead_id = lead_var.get('Value', '') if isinstance(lead_var, dict) else ''
            log.info(json.dumps({
                "event": "lead_channel_found",
                "channel": ch_name,
                "uniqueid": uniqueid,
                "lead_id": lead_id,
            }))
            return ch_name, uniqueid, lead_id

    raise ChannelGoneError(f"No active channel for VAPI call_id={vapi_call_id}")


async def _ami_redirect_lead(manager, channel: str, conf_id: str, lead_id: str):
    """
    Redirect the lead channel into the ai-transfer-verifier dialplan context.
    
    Sets channel variables for the conference bridge ID, lead ID, and transfer result
    before redirecting the channel to extension s of the ai-transfer-verifier context.
    """
    for var, val in [('CONF_BRIDGE_ID', conf_id), ('LEAD_ID', lead_id), ('TRANSFER_RESULT', 'CALLBK')]:
        await manager.send_action({'Action': 'Setvar', 'Channel': channel, 'Variable': var, 'Value': val})

    resp = await manager.send_action({
        'Action': 'Redirect',
        'Channel': channel,
        'Context': 'ai-transfer-verifier',
        'Exten': 's',
        'Priority': '1',
    })
    log.info(json.dumps({"event": "ami_redirect_sent", "channel": channel, "conf_id": conf_id, "resp": str(resp)}))


async def _ami_originate_verifier(manager, verifier_number, conf_id, lead_name, product_name,
                                   lead_id, caller_id, caller_name, timeout_sec):
    """
                                   Initiates an outbound verifier call via AMI Originate action.
                                   
                                   Returns:
                                       str: The generated AMI action ID.
                                   """
                                   action_id = str(uuid.uuid4())
    endpoint = f"SIP/{verifier_number}@SignalWire"
    variable = ','.join([
        f'CONF_BRIDGE_ID={conf_id}',
        f'LEAD_NAME={lead_name}',
        f'PRODUCT_NAME={product_name}',
        f'LEAD_ID={lead_id}',
        'TRANSFER_RESULT=CALLBK',
    ])
    resp = await manager.send_action({
        'Action': 'Originate',
        'ActionID': action_id,
        'Channel': endpoint,
        'Context': 'ai-transfer-verifier',
        'Exten': 'verifier',
        'Priority': '1',
        'Timeout': str(timeout_sec * 1000),
        'CallerID': f'"{caller_name}" <{caller_id}>',
        'Async': 'true',
        'Variable': variable,
    })
    log.info(json.dumps({
        "event": "ami_originate_verifier",
        "endpoint": endpoint,
        "conf_id": conf_id,
        "resp": str(resp),
    }))
    return action_id


async def _poll_for_verifier(manager, conf_id: str, timeout_sec: int) -> bool:
    """
    Wait for the verifier to join the conference bridge.
    
    Returns:
    	`True` if the verifier joins within `timeout_sec`, `False` otherwise.
    """
    bridge_name = f"XFER-{conf_id}"
    deadline = time.time() + timeout_sec

    while time.time() < deadline:
        try:
            resp = await manager.send_action({'Action': 'ConfbridgeList', 'Conference': bridge_name})
            members = resp if isinstance(resp, list) else []
            if len(members) >= 2:
                log.info(json.dumps({"event": "verifier_joined_bridge", "bridge": bridge_name, "members": len(members)}))
                return True
        except Exception as exc:
            log.warning(json.dumps({"event": "confbridge_poll_error", "detail": str(exc)}))
        await asyncio.sleep(0.5)

    log.warning(json.dumps({"event": "verifier_no_answer", "bridge": bridge_name, "timeout": timeout_sec}))
    return False


async def _hangup_vapi_channel(manager, vapi_call_id: str):
    """
    Terminates the VAPI SIP channel associated with the given call ID.
    
    Parameters:
    	vapi_call_id (str): The VAPI call ID to match and disconnect.
    """
    resp = await manager.send_action({'Action': 'CoreShowChannels'})
    channels = resp if isinstance(resp, list) else []

    for chan in channels:
        ch_name = chan.get('Channel', '')
        if not ch_name:
            continue
        var_resp = await manager.send_action({
            'Action': 'Getvar', 'Channel': ch_name, 'Variable': 'VAPI_CALL_ID',
        })
        val = var_resp.get('Value', '') if isinstance(var_resp, dict) else ''
        if val == vapi_call_id:
            await manager.send_action({'Action': 'Hangup', 'Channel': ch_name, 'Cause': '16'})
            log.info(json.dumps({"event": "vapi_channel_hungup", "channel": ch_name}))
            return

    log.warning(json.dumps({"event": "vapi_channel_not_found_for_hangup", "call_id": vapi_call_id}))


def _log_event(event: str, **kwargs):
    """
    Emit a structured JSON log record containing the event name, UTC timestamp, and additional fields.
    """
    record = {"event": event, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **kwargs}
    log.info(json.dumps(record))
