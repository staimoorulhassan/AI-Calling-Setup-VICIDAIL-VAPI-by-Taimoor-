#!/usr/bin/env python3
"""
Disposition AGI: writes a lead status back to ViciDial via non_agent_api.php.

Arguments:
    lead_id  status  [comments]

Status values typically used:
    A      Answering machine (set by precheck)
    DAIR   Dead air (set by precheck)
    NI     Not interested (AI intent classification)
    SCHDL  Scheduled appointment (AI tool-call result)
    UNWK   Unworkable / bad number
    DROP   Caller dropped before agent responded

Reads ViciDial API credentials from /etc/ai_agent/config.yaml.
"""
import sys
import os

try:
    from asterisk.agi import AGI
except ImportError:
    sys.stderr.write("pyst2 not installed: pip3 install pyst2\n")
    sys.exit(1)

try:
    import yaml
    import requests
except ImportError as exc:
    sys.stderr.write(f"missing dep: {exc}; pip3 install pyyaml requests\n")
    sys.exit(1)


CONFIG_PATH = os.environ.get("AI_AGENT_CONFIG", "/etc/ai_agent/config.yaml")


def main():
    agi = AGI()
    if len(sys.argv) < 3:
        agi.verbose("disposition: usage: disposition.py <lead_id> <status> [comments]")
        sys.exit(2)

    lead_id = sys.argv[1]
    status = sys.argv[2]
    comments = sys.argv[3] if len(sys.argv) > 3 else ""

    try:
        with open(CONFIG_PATH) as fh:
            cfg = yaml.safe_load(fh) or {}
    except FileNotFoundError:
        agi.verbose(f"disposition: config missing: {CONFIG_PATH}")
        sys.exit(2)
    except yaml.YAMLError as exc:
        agi.verbose(f"disposition: invalid YAML in {CONFIG_PATH}: {exc}")
        sys.exit(2)

    vic = cfg.get("vicidial", {})
    api_url = vic.get("api_url")
    if not api_url:
        agi.verbose("disposition: vicidial.api_url not set in config")
        sys.exit(2)

    params = {
        "source": vic.get("source", "AIAgent"),
        "user": vic.get("api_user", ""),
        "pass": vic.get("api_pass", ""),
        "function": "update_lead",
        "lead_id": lead_id,
        "status": status,
    }
    if comments:
        params["comments"] = comments

    try:
        import urllib3
        urllib3.disable_warnings()
        resp = requests.get(api_url, params=params, timeout=5.0,
                            verify=vic.get("verify_tls", False))
        agi.verbose(
            f"disposition: lead={lead_id} status={status} "
            f"http={resp.status_code} body={resp.text.strip()[:200]}"
        )
    except requests.RequestException as exc:
        agi.verbose(f"disposition: ViciDial API error: {exc}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        sys.stderr.write(f"disposition: fatal: {exc}\n")
