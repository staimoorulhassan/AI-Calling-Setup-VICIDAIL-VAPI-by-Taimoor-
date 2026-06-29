# ADR-0002: Manual Dial & Disposition Strategy — AI-Headless ViciDial Control

> **Scope**: Decision cluster covering how operator-initiated outbound calls are placed AND how every AI call is dispositioned — both deliberately bypassing ViciDial APIs that assume a logged-in human agent session.

- **Status:** Accepted
- **Date:** 2026-06-29
- **Feature:** ai-calling-agent
- **Context:** ACS runs ViciDial in an **AI-headless** mode: there are no human ViciDial agents logged into a session — VAPI handles the conversation and `avr-sts-vapi` handles call control. Two operational regressions on the production server (`161.97.184.140`, 2026-06-29) exposed a shared root assumption baked into the original implementation: it reused ViciDial APIs that require a live agent session.
>
> (1) **Manual dial** routed through `manualDialViaApi` → ViciDial `preview_dial_action`, which needs a preview/agent session and fails in a headless setup (vicidial.controller.ts:66-80). (2) **Dispositions** were never written: connected AI calls stayed `NEW`/`NA` because the disposition path either lacked credentials or assumed agent-session disposition flows. Both are about controlling the outbound call lifecycle **without** a human agent — so they cluster as one decision: use ViciDial's session-independent control interfaces (AMI Originate inbound; non-agent API outbound disposition). Root causes in `specs/ai-calling-agent/fixes-2026-06-29/research.md` (P3, P4).

## Decision

Standardize all AI-headless outbound call control on ViciDial interfaces that do **not** require a logged-in agent session:

- **Manual dial → AMI Originate** (`manualDialViaAmi`, vicidial.service.ts:455): `Originate Channel=Local/70841<10digit>@default, Context=default, Exten=138502` — the exact pattern the live auto-dialer uses. The `preview_dial_action` API path is no longer the primary route; the controller routes manual dial through AMI regardless of whether `campaignId` is supplied (API path may remain only as a fallback). DNC gating and `direction=outbound` semantics are preserved on this path.
- **AMI session robustness**: `sendAmiAction` must use a confirmed AMI login (capture an Originate `Response: Success`). If the persistent `AmiClientService` is reconnect-looping, fall back to a short-lived AMI login or the `avr-ami` bridge (`http://avr-ami:6006`).
- **Disposition → ViciDial non-agent API** (`non_agent_api.php?function=update_lead`) from `avr-sts-vapi/notifyVicidialCallEnd`, authenticated with `VICIDIAL_USER`/`VICIDIAL_PASS` (an API user with `vdc_agent_api_access=1`, `modify_leads`, `user_level>7`) supplied via `.env`/compose — never hardcoded.
- **Mandatory disposition mapping**: every call-end path maps to a concrete status — `AMD→AMD`, voicemail keywords→`IVR`, `transferCall`→`XFER`, human-handled→`HANDLED`/`SALE`, otherwise→`DROP`. No connected call is left `NEW`. The fallback/default code is env-configurable.
- **Durability**: the corrected compose mounts and `avr-sts-vapi` env (including the VICIDIAL creds) are captured into the backup set so a future config revert is recoverable.

## Consequences

### Positive

- **Works without a human agent session**: AMI Originate and `non_agent_api.php` are both session-independent, matching the AI-headless reality. Eliminates the class of failures caused by reusing agent-session APIs.
- **Reuses a proven path**: manual dial now uses the identical Originate pattern as the working auto-dialer, so it inherits the verified AudioSocket→VAPI audio path.
- **Reportable outcomes**: mandatory disposition mapping means the Call History / disposition funnel reflects real statuses (AMD/IVR/XFER/HANDLED/DROP) instead of blank/`NEW`, fixing the "empty call history" symptom downstream.
- **Constitution-aligned**: dispositions flow through ViciDial's API (no direct mutation of append-only audit tables); DNC + `outbound` semantics preserved on manual dial; secrets stay in `.env`.

### Negative

- **Two control surfaces to operate**: AMI (TCP 5038) for origination and HTTP non-agent API for disposition — each has its own auth/credential failure mode to monitor (the exact two things that broke here).
- **Credential dependency**: disposition silently no-ops if `VICIDIAL_USER`/`VICIDIAL_PASS` are missing/invalid — needs a smoke check (doctor diagnostics) to catch regressions early.
- **Manual dial = live outbound calls**: routing through the proven dialer path makes it easy to place real calls; must keep DNC gating and single-number testing discipline.
- **Disposition mapping is heuristic**: voicemail/IVR detection relies on transcript keywords; mis-maps are possible and the `DROP` default may over-count.

## Alternatives Considered

### Alternative A: Keep `preview_dial_action` for manual dial (Rejected)
Reuse ViciDial's preview-dial API. **Rejected** because it requires a live preview/agent session, which does not exist in the AI-headless setup — this was the actual P3 failure. The API branch fails for headless callers.

### Alternative B: Direct DB write for dispositions (Rejected)
`UPDATE vicidial_list SET status=...` directly from the backend. **Rejected** because it bypasses ViciDial's own bookkeeping (`called_since_last_reset`, list cascade, audit) and risks corrupting dialer state; the non-agent API performs the update the "ViciDial way." Also conflicts with the append-only/audit posture in the constitution.

### Alternative C: Add a hangup/originate-by-channel endpoint to `avr-ami` (Deferred)
Extend the `avr-ami` bridge to own all call control. **Deferred** — viable as the AMI fallback for origination, but a full migration requires `avr-ami` code changes + redeploy; out of scope for this remediation. Retained as the documented fallback when the persistent AMI client loops (see Decision).

### Alternative D: Campaign-level disposition enforcement only (Partially adopted, secondary)
Rely on ViciDial campaign "disposition required" settings instead of code-level mapping. **Not sufficient alone** because the AI bridge, not a human, ends the call — enforcement must live in `avr-sts-vapi`. Campaign-level settings remain an optional belt-and-suspenders layer.

## References

- Feature Spec: `specs/ai-calling-agent/spec.md`
- Implementation Plan: `specs/ai-calling-agent/fixes-2026-06-29/plan.md` (P3 Manual dial, P4 Mandatory disposition)
- Root-Cause Research: `specs/ai-calling-agent/fixes-2026-06-29/research.md` (Problem 3, Problem 4)
- Code: `avr-app/backend/src/vicidial/vicidial.service.ts` (`manualDialViaAmi` :455, `getCallHistory` :918, `sendAmiAction`), `vicidial.controller.ts:66-80`; `avr-sts-vapi/index.js` (`notifyVicidialCallEnd`)
- Related ADRs: ADR-0001 (AVR surface — SIP trunk audio path; this ADR uses the same `avr-ami`/`avr-sts-vapi` surface for control)
- Evaluator Evidence: `specs/ai-calling-agent/fixes-2026-06-29/` remediation plan + verification/acceptance section
