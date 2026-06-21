#!/usr/bin/env python3
"""
ACS Whisper AGI — plays a lead-context announcement to the verifier
before they are bridged into the ConfBridge with the lead.

Called from [ai-transfer-verifier] exten => verifier:
    AGI(whisper.py,${LEAD_NAME},${PRODUCT_NAME})

The lead is already in the bridge but AGI runs on the verifier's channel
before ConfBridge() executes, so the lead cannot hear this.
"""

import os
import sys

sys.stdout.reconfigure(line_buffering=True)


def agi_send(line: str):
    print(line, flush=True)


def agi_recv() -> str:
    return sys.stdin.readline().strip()


def agi_command(cmd: str) -> str:
    agi_send(cmd)
    return agi_recv()


def main():
    env = {}
    while True:
        line = sys.stdin.readline().strip()
        if not line:
            break
        if ':' in line:
            key, _, val = line.partition(':')
            env[key.strip()] = val.strip()

    lead_name = env.get('agi_arg_1', '').strip() or 'a potential customer'
    product_name = env.get('agi_arg_2', '').strip()

    custom_sound = '/var/lib/asterisk/sounds/custom/acs-transfer'
    if os.path.exists(f"{custom_sound}.wav") or os.path.exists(f"{custom_sound}.gsm"):
        agi_command(f'EXEC Playback "{custom_sound}"')
    else:
        if product_name:
            text = f"Connecting you to {lead_name}, who expressed interest in {product_name}."
        else:
            text = f"Connecting you to {lead_name}."
        safe = text.replace('"', "'")
        agi_command(f'EXEC Festival "{safe}"')

    return 0


if __name__ == '__main__':
    sys.exit(main())
