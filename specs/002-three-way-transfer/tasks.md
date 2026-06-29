# Tasks: 3-Way Transfer

**Branch**: `002-three-way-transfer`
**Input**: spec.md, plan.md, contracts/
**Prerequisites**: Asterisk 18 running, AVR stack up, `/etc/ai_agent/config.yaml` present

---

## Phase 1: Setup

**Purpose**: Config extension, dialplan skeleton, webhook server process

- [X] T001 Add `transfer` section to `config/config.yaml.example`: `verifier_number`, `whisper_sound`, `conf_bridge_timeout`
- [ ] T002 Add same `transfer` section to `/etc/ai_agent/config.yaml` on VPS with real verifier number — run `bash deploy/deploy-transfer.sh`, then edit manually
- [X] T003 [P] Create `dialplan/ai-transfer.conf` skeleton with `[ai-transfer-verifier]` context (s + verifier + h extensions, stubs only)
- [ ] T004 [P] Add `#include "ai-transfer.conf"` to `/etc/asterisk/extensions.conf` and reload — automated in `deploy/deploy-transfer.sh`
- [X] T005 Create `agi/transfer_webhook.py` — Flask webhook server: `POST /webhooks/vapi/tool-call`
- [ ] T006 Install Flask on VPS: `python3.11 -m pip install flask` — automated in `deploy/deploy-transfer.sh`
- [ ] T007 Create systemd unit `/etc/systemd/system/acs-webhook.service` — file at `deploy/acs-webhook.service`; automated in `deploy/deploy-transfer.sh`
- [ ] T008 Smoke test: `curl -X POST http://161.97.184.140:8088/webhooks/vapi/tool-call -H 'Content-Type: application/json' -d '{"message":{"type":"tool-call","toolCallList":[{"id":"t1","name":"request_transfer","parameters":{}}],"call":{"id":"test-smoke-123"}}}'` → 200

**Checkpoint**: Webhook endpoint live, dialplan skeleton loaded, config extended

---

## Phase 2: AMI Bridge Orchestration (US1 core) 🎯

**Purpose**: The actual 3-way bridge — Redirect lead + Originate verifier + ConfBridge + VAPI hangup

- [X] T009 Create `agi/transfer_bridge.py` — `do_transfer(cfg, vapi_call_id, verifier_num, ...)` using `panoramisk`
- [X] T010 [US1] In `transfer_bridge.py`: AMI `Redirect` action — move lead channel to `[ai-transfer-verifier]` exten `s`
- [X] T011 [US1] In `transfer_bridge.py`: AMI `Originate` — dial `SIP/{verifier}@SignalWire` into `[ai-transfer-verifier]` exten `verifier`, pass `CONF_BRIDGE_ID` + `LEAD_NAME` + `PRODUCT_NAME` variables
- [X] T012 [US1] In `transfer_bridge.py`: poll AMI `ConfbridgeList` every 500 ms (up to 30 s) to confirm verifier joined bridge
- [X] T013 [US1] In `transfer_bridge.py`: once verifier confirmed in bridge, AMI `Hangup` on VAPI SIP channel
- [X] T014 [US1] Fill `[ai-transfer-verifier]` dialplan: lead exten `s` → ConfBridge; verifier exten → AGI(whisper.py) → ConfBridge; h exten → disposition
- [X] T015 [US1] Wire `transfer_webhook.py` to call `transfer_bridge.do_transfer()` — channel lookup via AMI `CoreShowChannels` + `Getvar VAPI_CALL_ID`
- [ ] T016 [US1] Test end-to-end: run campaign, answer call as lead, POST webhook manually, verify verifier phone rings and both parties bridge

**Checkpoint**: Full US1 transfer flow working — AI → webhook → bridge → VAPI hangup

---

## Phase 3: Disposition Write-back

**Purpose**: Write SCHDL status to ViciDial after transfer completes

- [X] T017 [US1] Add `h` extension to `[ai-transfer-verifier]`: `AGI(disposition.py,${LEAD_ID},${TRANSFER_RESULT},...)` — TRANSFER_RESULT set to SCHDL or CALLBK by bridge code
- [X] T018 [US1] Pass `LEAD_ID` + `TRANSFER_RESULT` as Asterisk variables via AMI Setvar before Redirect/Originate
- [X] T019 [US1] Handle verifier no-answer (30 s timeout): `transfer_bridge.py` sets `TRANSFER_RESULT=CALLBK` on lead channel before returning "timeout"; h-extension writes CALLBK
- [ ] T020 Verify: after successful transfer + all parties hang up, `SELECT status FROM vicidial_list WHERE lead_id=<id>` → `SCHDL`

**Checkpoint**: ViciDial disposition correct for both success (SCHDL) and timeout (CALLBK)

---

## Phase 4: Idempotency & Error Handling

**Purpose**: Prevent double-originates; handle AMI down, dead channel

- [X] T021 [US1] Add in-memory `_in_flight: dict[call_id → timestamp]` with 60 s TTL in `transfer_webhook.py`; return `already_in_progress` on duplicate
- [X] T022 [US1] Before redirect: `_find_lead_channel` raises `ChannelGoneError` if no channel found → webhook returns 410
- [X] T023 [US1] Wrap AMI calls in try/except `AMIConnectionError`; if AMI connection fails return 503 and log `transfer_failed` structured event
- [X] T024 [US1] Log structured JSON event `{"event":"transfer_initiated","call_id","verifier","timestamp"}` on every webhook call
- [X] T025 [US1] Log `{"event":"transfer_bridged",...}` when verifier joins, `{"event":"transfer_ended",...}` on h-extension (via TRANSFER_RESULT variable)

**Checkpoint**: All FR-007, FR-010, FR-011, FR-012 satisfied; US1 complete ✅

---

## Phase 5: Whisper Announcement (US3)

**Purpose**: Verifier hears lead info before being bridged

- [X] T026 [US3] Create `agi/whisper.py` — AGI reads `LEAD_NAME` and `PRODUCT_NAME` from args, plays custom sound or Festival TTS fallback
- [ ] T027 [US3] Generate whisper sound file — run `bash deploy/generate-whisper-sound.sh` on VPS to create `/var/lib/asterisk/sounds/custom/acs-transfer.wav`
- [X] T028 [US3] `[ai-transfer-verifier] exten => verifier` calls `AGI(whisper.py,${LEAD_NAME},${PRODUCT_NAME})` BEFORE `ConfBridge(...)` in `dialplan/ai-transfer.conf`
- [X] T029 [US3] `LEAD_NAME` and `PRODUCT_NAME` passed via AMI Originate `Variable` list in `transfer_bridge.py`
- [ ] T030 [US3] Test: verifier answers → hears whisper → lead is muted during whisper → bridge opens after whisper ends

**Checkpoint**: US3 complete — verifier gets context before talking to lead

---

## Phase 6: Operator Manual Transfer API (US2)

**Purpose**: Dashboard button triggers same bridge flow

- [ ] T031 [US2] Add `POST /api/calls/{call_id}/transfer` endpoint in NestJS `backend/src/calls/calls.controller.ts`
- [ ] T032 [US2] Add `CallsService.initiateTransfer(call_id, verifier_number, initiated_by='operator')` in `backend/src/calls/calls.service.ts`
- [ ] T033 [US2] `CallsService.initiateTransfer` calls `POST http://localhost:8088/webhooks/vapi/tool-call` with operator-constructed payload
- [ ] T034 [US2] Return 409 if call is already in `transfer_state: pending|bridged`
- [ ] T035 [US2] Add `transfer_state` column to `calls` table (migration): `none|pending|bridged|completed`
- [ ] T036 [US2] Test: `curl -X POST http://161.97.184.140:3001/api/calls/{id}/transfer -H 'Authorization: Bearer ...' -d '{"verifier_number":"+1..."}'`

**Checkpoint**: US2 complete — operator can trigger transfer from dashboard

---

## Phase 7: WebSocket Push (US2/US3)

**Purpose**: Dashboard shows live transfer status

- [ ] T037 [US2] `transfer_bridge.py`: after bridge established, POST to NestJS `POST /internal/ws/broadcast` with `call.transferred` payload
- [ ] T038 [US2] NestJS `CallsGateway`: handle `/internal/ws/broadcast` and emit `call.transferred` to all connected clients
- [ ] T039 [US2] NestJS `CallsGateway`: emit `call.transfer_failed` on failed transfers
- [ ] T040 [US2] Update call status in DB to `transfer_state: bridged` on success, `failed` on error
- [ ] T041 [US2] Test: open dashboard, trigger transfer via webhook, confirm status updates within 500 ms

**Checkpoint**: All 3 user stories complete

---

## Phase 8: VAPI Tool Registration

**Purpose**: Register `request_transfer` tool on VAPI assistant so AI can call it

- [ ] T042 In VAPI dashboard → Assistant `ann` → Tools → Add Function:
  - Name: `request_transfer`
  - Description: "Transfer the lead to a human verifier when they express clear interest in moving forward."
  - Parameters: `lead_name` (string), `product_name` (string) — both optional
  - Server URL: `http://161.97.184.140:8088/webhooks/vapi/tool-call`
- [ ] T043 Test VAPI tool call end-to-end: say "Yes I want to proceed" → AI calls `request_transfer` → webhook fires → bridge established

---

## Dependencies

- Phase 1 → Phase 2 → Phase 3 → Phase 4 (sequential — each builds on prior)
- Phase 5 (Whisper) can start after Phase 2 T014 is done (dialplan exists)
- Phase 6 (Manual API) can start after Phase 4 is done (US1 complete)
- Phase 7 (WS Push) requires Phase 6
- Phase 8 (VAPI Tool) can be done any time after Phase 1 (just VAPI dashboard config)

## Parallel Tasks

Within Phase 1: T003, T004, T005 are independent — can run in parallel
Within Phase 2: T009, T010, T011 are independent files — can run in parallel
Within Phase 3: T017, T018 can be developed in parallel
