# Feature Specification: 3-Way Transfer

**Feature Branch**: `002-three-way-transfer`
**Created**: 2026-06-20
**Status**: Draft
**Input**: User description: "3 way transfer — AI is talking to lead, lead is interested, bridge in human verifier via ConfBridge, AI drops off"

---

## User Scenarios & Testing

### User Story 1 — AI-Triggered Transfer via Tool Call (Priority: P1)

The AI agent (VAPI) is mid-conversation with a lead. The lead expresses interest (e.g., "Yes I'd like to know more"). The AI calls a `request_transfer` tool which hits our webhook. The backend originates a call to the human verifier, creates a ConfBridge conference, moves the lead into it, and hangs up the VAPI SIP leg — leaving Verifier ↔ Lead talking.

**Why this priority**: Core revenue action. Every booked appointment goes through this path.

**Independent Test**: Simulate a VAPI tool-call webhook POST to `POST /webhooks/vapi/tool-call` with `function: request_transfer`. Verify AMI originates a call to the verifier number, ConfBridge is created, lead call is redirected, VAPI leg is hung up, and ViciDial disposition is set to `SCHDL`.

**Acceptance Scenarios**:

1. **Given** AI is on active call with lead (Asterisk channel exists, VAPI WebSocket open), **When** VAPI fires `request_transfer` tool call, **Then** backend POSTs to webhook, AMI creates ConfBridge `XFER-{call_id}`, originates verifier, redirects lead into bridge, hangs up VAPI leg — all within 3 s.
2. **Given** verifier does not answer within 30 s, **When** dial timeout fires, **Then** lead is NOT dropped — VAPI leg is kept alive and AI informs lead of delay; ViciDial status set to `CALLBK`.
3. **Given** transfer completes successfully, **When** verifier and lead both hang up, **Then** h-extension AGI writes `SCHDL` disposition to ViciDial and logs structured event.
4. **Given** backend receives duplicate `request_transfer` for same `call_id`, **When** second webhook fires, **Then** idempotency check prevents double-originate; returns 200 with `already_in_progress`.

---

### User Story 2 — Operator Manual Transfer Button (Priority: P2)

A human supervisor watching the Live Call Board sees an interesting call and clicks "Transfer to Verifier" on the dashboard. This fires the same transfer API as the AI path but is human-initiated.

**Why this priority**: Fallback for cases where AI doesn't auto-trigger (e.g., lead is interested but AI misses the cue).

**Independent Test**: Authenticate as admin, GET `/api/calls` to find an active call, POST to `POST /api/calls/{call_id}/transfer` with `{ "verifier_number": "+1XXXXXXXXXX" }`. Verify same ConfBridge flow is triggered and WebSocket event `call.transferred` is pushed to dashboard.

**Acceptance Scenarios**:

1. **Given** supervisor is on dashboard viewing active calls, **When** supervisor clicks Transfer and selects verifier, **Then** `POST /api/calls/{id}/transfer` triggers same ConfBridge flow and dashboard updates call status to `transferred`.
2. **Given** call is already in transfer state, **When** supervisor clicks Transfer again, **Then** API returns 409 Conflict and button is disabled.

---

### User Story 3 — Verifier Receives Call & Can Whisper (Priority: P3)

Before the verifier is bridged to the lead, they hear a whisper announcement: "Connecting you to [Lead Name] who expressed interest in [Product]." After whisper, verifier and lead are in full two-way audio. The lead does not hear the whisper.

**Why this priority**: Quality-of-life for verifiers — reduces cold-connect awkwardness.

**Independent Test**: Trigger a transfer with a verifier number. Monitor the verifier's audio — verify they hear the whisper playback before the lead is joined. Confirm lead audio track has no whisper.

**Acceptance Scenarios**:

1. **Given** verifier answers the originate call, **When** ConfBridge join sequence runs, **Then** verifier hears "Connecting you to [name]..." played once before lead is bridged in.
2. **Given** verifier hangs up during whisper, **When** channel drops, **Then** lead is not left in an empty conference — VAPI leg is kept alive and AI continues conversation.

---

### Edge Cases

- What if the Asterisk channel for the lead has already hung up when the webhook fires? → Return 410 Gone, no originate.
- What if AMI connection is down? → Return 503, VAPI tool call response says "transfer failed, continuing conversation".
- What if verifier number is busy/unavailable? → Retry once after 5 s, then fall back to CALLBK disposition + VAPI informs lead.
- What if VAPI WebSocket closes mid-transfer? → Lead is already in ConfBridge with verifier; transfer is unaffected.
- What if ConfBridge name collides? → Use `XFER-{uniqueid}` (Asterisk Uniqueid) — globally unique per channel.

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST accept a VAPI tool-call webhook `POST /webhooks/vapi/tool-call` with `function: request_transfer` and trigger a 3-way bridge within 3 s.
- **FR-002**: System MUST originate an outbound SIP call to the configured verifier number via AMI `Originate`.
- **FR-003**: System MUST create an Asterisk `ConfBridge` named `XFER-{channel_uniqueid}` and move both lead and verifier into it.
- **FR-004**: System MUST hang up the VAPI SIP leg after both parties are confirmed in the bridge.
- **FR-005**: System MUST write `SCHDL` disposition to ViciDial via `disposition.py` AGI (or direct API call) after successful transfer.
- **FR-006**: System MUST expose `POST /api/calls/{call_id}/transfer` for manual operator-initiated transfers with JWT auth.
- **FR-007**: System MUST be idempotent — duplicate `request_transfer` for same `call_id` returns 200 without re-originating.
- **FR-008**: System MUST push `call.transferred` WebSocket event to connected dashboard clients when transfer state changes.
- **FR-009**: System MUST play a whisper announcement to the verifier before bridging in the lead (US3, C3-compliant — lead does not hear it).
- **FR-010**: System MUST log a structured JSON event `{ "event": "transfer_initiated", "call_id", "verifier", "timestamp" }` for every transfer attempt.
- **FR-011**: System MUST handle verifier no-answer within 30 s by keeping VAPI leg alive and setting disposition `CALLBK`.
- **FR-012**: System MUST reject transfer if the lead's Asterisk channel is no longer active (return 410 to webhook caller).

### Key Entities

- **Transfer**: `{ id, call_id, verifier_number, state (pending|bridged|failed|completed), initiated_by (ai|operator), initiated_at, bridged_at, ended_at }`
- **Call** (existing, extended): add `transfer_state` field (`none|pending|bridged|completed`)
- **ConfBridge**: ephemeral Asterisk resource, named `XFER-{uniqueid}`, destroyed on all-parties-leave

---

## Success Criteria

- **SC-001**: Transfer completes (verifier joins bridge) within 3 s of webhook receipt on a warmed connection, p95.
- **SC-002**: Zero lead drops during transfer — lead stays in audio path at all times.
- **SC-003**: Disposition `SCHDL` written to ViciDial within 2 s of all-parties-hangup.
- **SC-004**: Dashboard shows `transferred` status within 500 ms of bridge creation (WebSocket push).
- **SC-005**: Idempotency: 100% of duplicate webhook calls for same `call_id` return 200 without side effects.
