# Tasks: 3-Way Transfer

**Branch**: `002-three-way-transfer`
**Input**: spec.md, plan.md, contracts/
**Prerequisites**: Asterisk 18 running, AVR stack up, `/etc/ai_agent/config.yaml` present

---

## Phase 1: Setup

**Purpose**: Config extension, dialplan skeleton, webhook server process

- [ ] T001 Add `transfer` section to `config/config.yaml.example`: `verifier_number`, `whisper_sound`, `conf_bridge_timeout`
- [ ] T002 Add same `transfer` section to `/etc/ai_agent/config.yaml` on VPS with real verifier number
- [ ] T003 [P] Create `dialplan/ai-transfer.conf` skeleton with `[ai-transfer-verifier]` context (s + verifier + h extensions, stubs only)
- [ ] T004 [P] Add `#include "ai-transfer.conf"` to `/etc/asterisk/extensions.conf` and reload: `asterisk -rx "dialplan reload"`
- [ ] T005 Create `agi/transfer_webhook.py` — Flask app skeleton: `POST /webhooks/vapi/tool-call` returns 200 stub
- [ ] T006 Install Flask on VPS: `python3.11 -m pip install flask`
- [ ] T007 Create systemd unit `/etc/systemd/system/acs-webhook.service` running `transfer_webhook.py` on port 8088; enable + start
- [ ] T008 Smoke test: `curl -X POST http://161.97.184.140:8088/webhooks/vapi/tool-call -d '{}'` → 200

**Checkpoint**: Webhook endpoint live, dialplan skeleton loaded, config extended

---

## Phase 2: AMI Bridge Orchestration (US1 core) 🎯

**Purpose**: The actual 3-way bridge — Redirect lead + Originate verifier + ConfBridge + VAPI hangup

- [ ] T009 Create `agi/transfer_bridge.py` — `do_transfer(call_id, lead_channel, lead_uniqueid, verifier_num, conf_id)` using `panoramisk`
- [ ] T010 [US1] In `transfer_bridge.py`: AMI `Redirect` action — move lead channel to `[ai-transfer-verifier]` exten `s`
- [ ] T011 [US1] In `transfer_bridge.py`: AMI `Originate` — dial `SIP/SignalWire/+{verifier_num}` into `[ai-transfer-verifier]` exten `verifier`, pass `CONF_BRIDGE_ID={conf_id}` variable
- [ ] T012 [US1] In `transfer_bridge.py`: poll AMI `ConfbridgeList` every 500 ms (up to 30 s) to confirm verifier joined bridge
- [ ] T013 [US1] In `transfer_bridge.py`: once verifier confirmed in bridge, AMI `Hangup` on VAPI SIP channel
- [ ] T014 [US1] Fill `[ai-transfer-verifier]` dialplan: `exten => s,1,ConfBridge(XFER-${UNIQUEID},default_bridge,default_user)` for lead; `exten => verifier,1,ConfBridge(XFER-${CONF_BRIDGE_ID},default_bridge,default_user)` for verifier
- [ ] T015 [US1] Wire `transfer_webhook.py` to call `transfer_bridge.do_transfer()` — extract `call_id`, look up active channel via AMI `CoreShowChannels`
- [ ] T016 [US1] Test end-to-end: run campaign, answer call as lead, wait for `request_transfer` tool call (or manually POST webhook), verify verifier phone rings and both parties bridge

**Checkpoint**: Full US1 transfer flow working — AI → webhook → bridge → VAPI hangup

---

## Phase 3: Disposition Write-back

**Purpose**: Write SCHDL status to ViciDial after transfer completes

- [ ] T017 [US1] Add `h` extension to `[ai-transfer-verifier]`: `AGI(disposition.py,${LEAD_ID},SCHDL,transfer-completed)`
- [ ] T018 [US1] Pass `LEAD_ID` as Asterisk variable in the AMI `Originate`/`Redirect` call so `h` extension has it
- [ ] T019 [US1] Handle verifier no-answer (30 s timeout): in `transfer_bridge.py`, if verifier never joins bridge — keep VAPI leg alive, call `disposition.py` with `CALLBK`, log `transfer_failed` event
- [ ] T020 Verify: after successful transfer + all parties hang up, check `SELECT status FROM vicidial_list WHERE lead_id=<id>` → `SCHDL`

**Checkpoint**: ViciDial disposition correct for both success (SCHDL) and timeout (CALLBK)

---

## Phase 4: Idempotency & Error Handling

**Purpose**: Prevent double-originates; handle AMI down, dead channel

- [ ] T021 [US1] Add in-memory `_in_flight: dict[call_id → timestamp]` with 60 s TTL in `transfer_webhook.py`; return `{"status":"already_in_progress"}` on duplicate
- [ ] T022 [US1] Before redirect: AMI `GetVar` on lead channel — if channel missing return 410 response
- [ ] T023 [US1] Wrap AMI calls in try/except; if AMI connection fails return 503 and log `transfer_failed` structured event
- [ ] T024 [US1] Log structured JSON event `{"event":"transfer_initiated","call_id","verifier","timestamp"}` on every webhook call (FR-010)
- [ ] T025 [US1] Log `{"event":"transfer_bridged",...}` when verifier joins, `{"event":"transfer_ended",...}` on h-extension

**Checkpoint**: All FR-007, FR-010, FR-011, FR-012 satisfied; US1 complete

---

## Phase 5: Whisper Announcement (US3)

**Purpose**: Verifier hears lead info before being bridged

- [ ] T026 [US3] Create `agi/whisper.py` — reads `lead_name` and `product_name` from AGI args, plays `/var/lib/asterisk/sounds/custom/acs-transfer.gsm` (or uses `Festival TTS` / `Playback` with dynamic file)
- [ ] T027 [US3] Record or generate whisper sound file: "Connecting you to [name] who is interested in [product]" — save as `/var/lib/asterisk/sounds/custom/acs-transfer.gsm`
- [ ] T028 [US3] Update `[ai-transfer-verifier] exten => verifier` to run `AGI(whisper.py,${LEAD_NAME},${PRODUCT_NAME})` BEFORE `ConfBridge(...)` 
- [ ] T029 [US3] Pass `LEAD_NAME` and `PRODUCT_NAME` variables in the AMI Originate from `transfer_bridge.py` (from VAPI webhook payload)
- [ ] T030 [US3] Test: verifier answers → hears whisper → lead is muted during whisper → bridge opens after whisper ends

**Checkpoint**: US3 complete — verifier gets context before talking to lead

---

## Phase 6: Operator Manual Transfer API (US2)

**Purpose**: Dashboard button triggers same bridge flow

- [ ] T031 [US2] Add `POST /api/calls/{call_id}/transfer` endpoint in NestJS `backend/src/calls/calls.controller.ts`
- [ ] T032 [US2] Add `CallsService.initiateTransfer(call_id, verifier_number, initiated_by='operator')` in `backend/src/calls/calls.service.ts`
- [ ] T033 [US2] `CallsService.initiateTransfer` calls `transfer_bridge.do_transfer()` via HTTP to webhook server OR duplicates AMI logic in Node.js using `ami2` npm package
- [ ] T034 [US2] Return 409 if call is already in `transfer_state: pending|bridged`
- [ ] T035 [US2] Add `transfer_state` column to `calls` table (migration): `none|pending|bridged|completed`
- [ ] T036 [US2] Test: `curl -X POST http://161.97.184.140:3001/api/calls/{id}/transfer -H 'Authorization: Bearer ...' -d '{"verifier_number":"+1..."}'`

**Checkpoint**: US2 complete — operator can trigger transfer from dashboard

---

## Phase 7: WebSocket Push (US2/US3)

**Purpose**: Dashboard shows live transfer status

- [ ] T037 [US2] In `transfer_bridge.py` (or NestJS service): POST to NestJS internal endpoint `POST /internal/ws/broadcast` after bridge established
- [ ] T038 [US2] NestJS `CallsGateway`: handle broadcast call and emit `call.transferred` to all connected clients (FR-008)
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
