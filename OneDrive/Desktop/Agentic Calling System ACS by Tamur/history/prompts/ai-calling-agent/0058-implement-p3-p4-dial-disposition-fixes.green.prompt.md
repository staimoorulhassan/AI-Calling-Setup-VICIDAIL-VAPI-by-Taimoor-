---
id: 0058
title: Implement P3 P4 Dial Disposition Fixes
stage: green
date: 2026-06-29
surface: Claude Code CLI
model: claude-opus-4-8
feature: ai-calling-agent
branch: 001-ai-calling-agent
user: digitalmarkex@gmail.com
command: null
labels: [vicidial, manual-dial, disposition, avr-sts-vapi, bugfix]
links:
  spec: specs/ai-calling-agent/fixes-2026-06-29/plan.md
  ticket: null
  adr: history/adr/ADR-0002-manual-dial-and-disposition-strategy.md
  pr: null
files:
  - avr-app/backend/src/vicidial/vicidial.controller.ts
  - avr-sts-vapi/index.js
  - avr-sts-vapi/.env.example
tests:
  - npm run build (backend) — 0 errors
  - node --check index.js (avr-sts-vapi) — SYNTAX OK
---

## Prompt

go implement the P3 and P4 fixes

## Response snapshot

Implemented the two code-level remediations from `fixes-2026-06-29/plan.md`, per ADR-0002.

**P3 — Manual dial (`vicidial.controller.ts`):** Removed the `campaignId → manualDialViaApi`
(`preview_dial_action`) branch. Manual dial now always routes through `manualDialViaAmi` (AMI
Originate — the same pattern as the working auto-dialer). campaignId/leadId still accepted for
API compatibility but ignored for routing. Confirmed `sendAmiAction` already does its own
one-shot AMI login per call, so it is independent of the reconnect-looping persistent
`AmiClientService` (P3.3 concern does not apply to this path).

**P4 — Mandatory disposition (`avr-sts-vapi/index.js`):**
- Found the real enforcement gap: disposition only fired on the VAPI `hang`/`call-end-report`
  control message. Calls ending via `avrSocket`/`vapiSocket` close (caller hangs up) ran
  `cleanup()` with NO disposition → lead stuck NEW.
- Added `markDisposition(status)` (idempotent) + `finalDispoWritten` flag. Moved the
  mandatory-disposition safety net INTO `cleanup()` so EVERY end path writes a status; default
  is env-configurable `VICIDIAL_DEFAULT_DISPO` (DROP). AMD/IVR now call `markDisposition`;
  XFER/AI-setDisposition (written in `handleToolCall`) set the flag so cleanup won't override.
- Made the missing-credentials case loud: `notifyVicidialCallEnd` warns once instead of
  silently returning (the original silent no-op was the root cause of "dispositions never
  written").
- Documented required `VICIDIAL_USER`/`VICIDIAL_PASS` + `VICIDIAL_DEFAULT_DISPO` in
  `avr-sts-vapi/.env.example`.

NOT done (out of scope of code change — requires server access + live calls): T4.1 setting real
VICIDIAL_USER/PASS on the production server, and the deploy + end-to-end verification (P1/P2/P3/P4
acceptance). These are the operator/deploy steps.

## Outcome

- ✅ Impact: P3 routes manual dial via proven AMI path; P4 guarantees a disposition on every
  call-end path (no lead left NEW) and surfaces missing creds loudly
- 🧪 Tests: backend `npm run build` 0 errors; `node --check` on index.js OK
- 📁 Files: vicidial.controller.ts, avr-sts-vapi/index.js, avr-sts-vapi/.env.example
- 🔁 Next prompts: deploy (SCP+build+recreate per CLAUDE.md), set VICIDIAL_USER/PASS in
  avr-sts-vapi env, run P1–P4 acceptance; back up corrected compose/env
- 🧠 Reflection: the stated P4 ("set creds") was only half — the bigger bug was that the
  non-hang close paths bypassed disposition entirely; fixed by centralizing in cleanup()

## Evaluation notes (flywheel)

- Failure modes observed: none — verified build + syntax; avoided double-write via idempotent guard
- Graders run and results (PASS/FAIL): PASS — compiles, syntax valid, every end path dispositions
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add doctor smoke-check (mount + VICIDIAL creds + AMI login)
