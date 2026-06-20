# Implementation Plan: 3-Way Transfer

**Branch**: `002-three-way-transfer` | **Date**: 2026-06-20 | **Spec**: [spec.md](spec.md)

## Summary

When the VAPI AI agent determines a lead is interested, it fires a `request_transfer` tool call. The ACS backend receives the webhook, uses Asterisk AMI to create a `ConfBridge`, originates an outbound call to the human verifier, moves the lead into the bridge, and hangs up the VAPI SIP leg. The result: Verifier ↔ Lead in a private two-way call. Disposition `SCHDL` is written to ViciDial. The dashboard receives a live WebSocket push.

---

## Technical Context

**Language/Version**: Python 3.11 (AGI/runner side) + Node.js 20 / NestJS 11 (backend webhook + WS)
**Primary Dependencies**: `panoramisk` (AMI), `requests` (ViciDial API), NestJS WebSocket Gateway, `asterisk-ari-client` or raw AMI for ConfBridge
**Storage**: MySQL (`vicidial_list` status update) + NestJS SQLite/PostgreSQL (`transfers` table)
**Testing**: Manual AMI originate dry-run + curl webhook simulation
**Target Platform**: VPS AlmaLinux 8 · Asterisk 18.x-vici · chan_sip
**Performance Goals**: Transfer bridge established < 3 s p95
**Constraints**: Lead audio must never drop; VAPI leg hangup only AFTER verifier joins bridge
**Scale/Scope**: Single-tenant, 1–10 concurrent transfers

---

## Constitution Check

| Gate | Principle | Status | Notes |
|------|-----------|--------|-------|
| Outbound-only enforced | C1 | ✅ | Transfer originates outbound to verifier only; lead inbound already active |
| Secrets in env only | C2 | ✅ | Verifier number from config/env; no hardcoded keys |
| AMD/IVR Before AI | C3 | ✅ | This feature runs AFTER AMD+AI path — no change to detection order |
| Structured events logged | C4 | ✅ | `transfer_initiated`, `transfer_bridged`, `transfer_ended` JSON events required (FR-010) |
| Minimal AVR surface | C5 | ✅ | No new AVR repos — uses existing `avr-ami` + `avr-sts-vapi` |
| Testable requirements | C6 | ✅ | All FRs mapped to TCs in spec.md |

---

## Architecture Decisions

### AD-1: ConfBridge over MeetMe
Use Asterisk `ConfBridge` (not `MeetMe`). ConfBridge is the modern app, supports whisper via `ConfBridgeStartRecord`/`ConfKick`, and works correctly on Asterisk 18. MeetMe requires `dahdi` which is not installed.

### AD-2: AMI for Bridge Control (not ARI)
The existing AVR stack already uses AMI (`avr-ami` container + `panoramisk` in the runner). Adding ARI would require enabling `http.conf` and `ari.conf` on Asterisk. We stay with AMI: `Redirect` action moves existing channels into the bridge context; `Originate` dials verifier into it.

### AD-3: Webhook Entry Point in Python AGI (not NestJS)
For the MVP (US1), the VAPI tool-call webhook is handled by a new lightweight Python Flask/FastCGI endpoint (`/opt/acs/webhook_server.py`) running on the VPS. It calls AMI directly using `panoramisk`. This avoids spinning up the full NestJS backend and unblocks US1 immediately. The NestJS `/api/calls/{id}/transfer` endpoint (US2) and WebSocket push (US2/US3) come in later phases.

### AD-4: Verifier Number Source
Verifier number read from `/etc/ai_agent/config.yaml` under `transfer.verifier_number`. Operator can override per-call via the API (US2). VAPI tool call payload may optionally include `verifier_number`; if absent, fall back to config.

### AD-5: Whisper via ConfBridge Announcement
Whisper (US3) implemented using Asterisk `ConfBridge` `answer_channel` and a pre-join `AGI` that plays a sound file to the verifier's channel before executing `ConfBridge(XFER-{uid})`. Lead is in the bridge already but muted until whisper AGI completes. Total whisper gap < 2 s.

---

## Project Structure

```
agi/
  transfer_webhook.py          # NEW: Flask webhook server (POST /webhooks/vapi/tool-call)
  transfer_bridge.py           # NEW: AMI ConfBridge orchestration logic
  whisper.py                   # NEW: AGI — plays whisper announcement to verifier channel

dialplan/
  ai-transfer.conf             # NEW: [ai-transfer-verifier] context for whisper + ConfBridge join

config/
  config.yaml.example          # UPDATED: add transfer.verifier_number, transfer.whisper_sound

specs/002-three-way-transfer/
  spec.md                      # This spec
  plan.md                      # This file
  data-model.md                # Transfer entity + call state extension
  contracts/
    openapi.yaml               # POST /webhooks/vapi/tool-call + POST /api/calls/{id}/transfer
    websocket.md               # call.transferred WS event
  quickstart.md                # How to test the transfer end-to-end
  tasks.md                     # Implementation tasks (created by /sp.tasks)
```

---

## Transfer Flow (Step by Step)

```
VAPI fires request_transfer tool call
  → POST /webhooks/vapi/tool-call  (transfer_webhook.py)
       ├─ validate call_id exists + channel is active  (AMI GetVar or channel lookup)
       ├─ idempotency check (in-memory or DB: call_id already transferring?)
       ├─ log event: transfer_initiated
       └─ call transfer_bridge.do_transfer(call_id, channel, verifier_num)
            ├─ AMI: Redirect lead channel → Context: ai-transfer-verifier, Exten: s
            │       (lead is now in [ai-transfer-verifier] dialplan, waiting)
            ├─ AMI: Originate SIP/SignalWire/+{verifier} → Context: ai-transfer-verifier, Exten: verifier
            │       (verifier answers → runs whisper.py AGI → joins ConfBridge XFER-{uid})
            ├─ [ai-transfer-verifier] s,1: ConfBridge(XFER-{uid})  ← lead joins here
            ├─ After verifier joins: AMI Hangup on VAPI SIP channel
            ├─ log event: transfer_bridged
            └─ POST /vicidial/non_agent_api.php?function=update_lead&status=SCHDL

[ai-transfer.conf]
[ai-transfer-verifier]
exten => s,1,NoOp(Lead waiting in bridge)
 same => n,ConfBridge(XFER-${UNIQUEID_ROOT},default_bridge,default_user)
 same => n,Hangup()

exten => verifier,1,NoOp(Verifier joining)
 same => n,AGI(whisper.py,${LEAD_NAME},${PRODUCT_NAME})
 same => n,ConfBridge(XFER-${CONF_BRIDGE_ID},default_bridge,default_user)
 same => n,Hangup()

exten => h,1,AGI(disposition.py,${LEAD_ID},SCHDL,transfer-completed)
```

---

## Phase Breakdown

| Phase | Scope | Output |
|---|---|---|
| 1 — Setup | Config, dialplan skeleton, systemd service for webhook server | `ai-transfer.conf`, `config.yaml` updated, `transfer_webhook.py` skeleton |
| 2 — AMI Bridge | `transfer_bridge.py` — AMI Redirect + Originate + ConfBridge + VAPI hangup | Working transfer flow (no whisper yet) |
| 3 — Disposition | `disposition.py` call after h-exten fires with `SCHDL` | ViciDial status written correctly |
| 4 — Idempotency | In-memory dict + TTL to block duplicate webhook calls | Duplicate protection |
| 5 — Whisper | `whisper.py` AGI + `[ai-transfer-verifier] verifier` exten | Verifier hears announcement |
| 6 — Manual API | `POST /api/calls/{id}/transfer` in NestJS backend | Operator-initiated transfers |
| 7 — WS Push | NestJS WebSocket `call.transferred` event | Dashboard live update |

---

## Verification

```bash
# 1. Dry-run: simulate VAPI webhook
curl -X POST http://161.97.184.140:8088/webhooks/vapi/tool-call \
  -H 'Content-Type: application/json' \
  -d '{"call_id":"test-123","function":"request_transfer","parameters":{}}'
# Expected: 200 {"status":"initiated"}

# 2. Live test: run campaign, answer call, say "I'm interested"
# Expected: verifier phone rings within 3 s, whisper plays, lead and verifier talk

# 3. ViciDial check
mysql -ucron -p'...' asterisk -e "SELECT status FROM vicidial_list WHERE lead_id=<id>;"
# Expected: SCHDL

# 4. Duplicate idempotency
curl (same webhook twice) → second returns {"status":"already_in_progress"}

# 5. No-answer timeout
# Don't answer verifier phone → after 30 s VAPI leg stays alive, status = CALLBK
```
