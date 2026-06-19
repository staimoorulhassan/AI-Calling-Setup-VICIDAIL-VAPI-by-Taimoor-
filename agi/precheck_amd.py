#!/usr/bin/env python3
"""
Precheck AGI: runs Asterisk's built-in AMD app, classifies the answer,
and signals the dialplan whether to hand off to the AI agent (VAPI bridge)
or short-circuit with a ViciDial disposition.

Dialplan vars set on exit:
    AI_HANDOFF   = "yes" | "no"
    AI_STATUS    = "A" (answering machine) | "DAIR" (dead air) | "" (handoff)

Arguments (passed positionally in the dialplan):
    lead_id  campaign_id  user
"""
import sys

try:
    from asterisk.agi import AGI
except ImportError:
    sys.stderr.write("pyst2 not installed: pip3 install pyst2\n")
    sys.exit(1)


AMD_TIMEOUT = "8000"
AMD_INITIAL_SILENCE = "2500"
AMD_GREETING = "1500"
AMD_AFTER_GREETING_SILENCE = "800"
AMD_TOTAL_ANALYSIS_TIME = "5000"
AMD_MIN_WORD_LENGTH = "100"
AMD_BETWEEN_WORDS_SILENCE = "50"
AMD_MAX_NUMBER_OF_WORDS = "3"
AMD_SILENCE_THRESHOLD = "256"


def main():
    agi = AGI()
    agi.verbose("precheck_amd: start")
    lead_id = sys.argv[1] if len(sys.argv) > 1 else ""
    campaign_id = sys.argv[2] if len(sys.argv) > 2 else ""
    user = sys.argv[3] if len(sys.argv) > 3 else ""
    agi.verbose(f"precheck_amd: lead={lead_id} campaign={campaign_id} user={user}")

    amd_args = ",".join([
        AMD_INITIAL_SILENCE, AMD_GREETING, AMD_AFTER_GREETING_SILENCE,
        AMD_TOTAL_ANALYSIS_TIME, AMD_MIN_WORD_LENGTH, AMD_BETWEEN_WORDS_SILENCE,
        AMD_MAX_NUMBER_OF_WORDS, AMD_SILENCE_THRESHOLD, AMD_TIMEOUT,
    ])
    agi.execute("AMD", amd_args)

    status = agi.get_variable("AMDSTATUS") or ""
    cause = agi.get_variable("AMDCAUSE") or ""
    agi.verbose(f"precheck_amd: AMDSTATUS={status} AMDCAUSE={cause}")

    if status == "MACHINE":
        agi.set_variable("AI_HANDOFF", "no")
        agi.set_variable("AI_STATUS", "A")
    elif status == "NOTSURE":
        agi.set_variable("AI_HANDOFF", "yes")
        agi.set_variable("AI_STATUS", "")
    elif status in ("", "HANGUP"):
        agi.set_variable("AI_HANDOFF", "no")
        agi.set_variable("AI_STATUS", "DAIR")
    else:
        agi.set_variable("AI_HANDOFF", "yes")
        agi.set_variable("AI_STATUS", "")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        sys.stderr.write(f"precheck_amd: fatal: {exc}\n")
        try:
            AGI().set_variable("AI_HANDOFF", "yes")
        except Exception:
            pass
