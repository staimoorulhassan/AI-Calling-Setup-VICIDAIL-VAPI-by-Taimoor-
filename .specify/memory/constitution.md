<!--
SYNC IMPACT REPORT
==================
Version change: [template] → 1.0.0
Modified principles: all (template placeholders → concrete ACS principles)
Added sections: Core Principles (6), Security Requirements, Performance Standards,
                Development Workflow, Governance
Removed sections: none
Templates requiring updates:
  ✅ .specify/templates/plan-template.md — Constitution Check gates now
     have concrete rules to validate against
  ✅ .specify/templates/spec-template.md — no structural change needed;
     NFR categories align with principle headings
  ✅ .specify/templates/tasks-template.md — no structural change needed;
     observability + secret-scan task types now have principle backing
Follow-up TODOs:
  - TODO(RATIFICATION_DATE): Exact project start date unknown;
    set to 2026-06-09 (first spec date found in artifacts).
  - Update spec.md §5.6, plan.md Technical Context, tasks.md stack header
    to reflect actual tech stack (NestJS + SQLite + Next.js, not Express +
    PostgreSQL + Vite) — flagged as finding I1 in sp.analyze report.
  - Fill open questions OQ-1 through OQ-7 status in spec.md §9 (finding I6).
-->

# ACS — Agentic Calling System Constitution

## Core Principles

### I. Outbound-Only Audio (NON-NEGOTIABLE)

The system processes and stores audio and transcript data from **outbound calls only**.

- Inbound call audio MUST NOT be received, processed, or stored under any circumstance.
- Every call insert MUST enforce `direction = 'outbound'`; any inbound channel signal
  MUST be rejected and logged without touching storage.
- This constraint derives from regulatory compliance (NFR-7) and is non-waivable without
  a formal legal review documented in an ADR.

### II. Secrets in Environment

All credentials and API keys MUST be sourced exclusively from environment variables.

- VAPI API key, ViciDial credentials, DB connection strings, JWT secrets, and webhook
  secrets MUST reside in `.env` files and MUST NOT be hardcoded anywhere in source.
- `.env.example` MUST define every required key with a placeholder value.
- A secret scan (e.g., `grep -r "VAPI_API_KEY\|password\|secret" src/`) MUST pass
  (zero hardcoded values) before any release or PR merge to `main`.
- `.env` files MUST be listed in `.gitignore` and MUST NOT be committed.

### III. AMD and IVR Detection Before AI Engagement

Voicemail and IVR detection MUST be resolved before the VAPI AI agent speaks.

- **AMD** (Answering Machine Detection): MUST fire at the ViciDial/Asterisk dialplan
  level. When AMD result is `MACHINE` or `NOTSURE`, the call MUST be hung up
  immediately via AMI; disposition = `voicemail`. No AI audio frame shall be sent.
- **IVR detection**: MUST be applied to the first VAPI transcript turn using a
  regex/keyword classifier. If matched, AMI hang-up fires; disposition = `ivr`.
  No subsequent AI turn shall be processed.
- Rationale: prevents wasted VAPI credit, avoids leaving AI audio on voicemail
  boxes, and fulfils FR-4, FR-5.

### IV. Structured Observability for Every Call Event

Every call lifecycle event MUST be emitted as structured JSON.

- Required fields: `timestamp` (ISO 8601), `call_id` (UUID), `event_type` (string),
  and relevant metadata (channel, disposition, duration where applicable).
- Event types MUST include at minimum:
  `initiated`, `answered`, `voicemail_hangup`, `ivr_hangup`,
  `transfer_initiated`, `transfer_failed`, `ended`, `failed`.
- Events MUST be persisted to the `events` DB table AND emitted via Socket.io to
  connected webapp clients in real time.
- Backend logs MUST use structured JSON (pino or equivalent); `call_id` MUST be
  bound to every log line within a call's lifecycle.

### V. Minimal AVR Surface

Only AVR repository components directly required for the ViciDial ↔ VAPI ↔ webapp
integration path MUST be included.

- Currently in scope: `avr-ami` (AMI call control), `avr-asterisk` (Asterisk PBX
  container), `avr-core` (AudioSocket bridge), `avr-sts-vapi` (VAPI Speech-to-Speech
  bridge).
- Any addition of an AVR repo MUST be justified in an ADR citing the gap it fills.
- Unused AVR repos MUST NOT be bundled, imported, or referenced in any Dockerfile,
  `docker-compose` file, or `package.json`.

### VI. Testable Requirements with Traceability

Every functional requirement MUST have at least one corresponding test case.

- Each test case in `spec.md` §7 MUST reference the FR(s) it validates.
- Each implementation task in `tasks.md` MUST reference at least one test case ID
  or FR ID in its description.
- A task with no requirement or test traceability MUST NOT be merged.
- Performance NFRs (NFR-1: ≤1,500ms voice latency p95; NFR-2: ≤300ms API p95)
  MUST have at least one measurement task before marking the feature complete.

---

## Security Requirements

- JWT tokens MUST expire after 8 hours (NFR-6). Sessions revoked on logout via
  `sessions.revoked_at` DB column; middleware MUST check revocation on every
  authenticated request.
- CORS MUST be restricted to `FRONTEND_URL` (env-configured); wildcard `*` origins
  are forbidden in production.
- Rate limiting MUST be applied at ≥100 req/min per IP on all backend routes.
- HTTP security headers (Helmet or equivalent) MUST be applied to all responses.
- Webhook signature validation (VAPI `x-vapi-secret`) MUST be enforced before
  processing any webhook payload.

---

## Performance Standards

| Metric | Threshold | Measurement Method |
|--------|-----------|--------------------|
| AI voice turn latency | ≤1,500 ms p95 | TC-31: 10 test utterances, time from end of speech to first AI audio byte |
| Webapp API response | ≤300 ms p95 | TC-33 variant: 20 concurrent API clients, median endpoint |
| Concurrent AI calls | 10 simultaneous | TC-33: 10 parallel VAPI sessions, no call drops |
| Live board update delay | ≤2 s | TC-15: status change → board update via Socket.io |
| AMI reconnect | ≤5 s | NFR-3: avr-ami auto-reconnect on AMI TCP drop |
| DB query at scale | No degradation at 1M rows | NFR-10: indexes on `calls(created_at, campaign_id)` and `transcripts(call_id)` |

---

## Development Workflow

1. **Spec → Plan → Tasks → Implement** — features MUST go through all three
   SDD artifacts before implementation tasks are created.
2. **Constitution Check in every plan** — `plan.md` MUST include a Constitution Check
   table validating against these six principles before Phase 0 research begins.
   A failing gate MUST block the feature until resolved.
3. **Small, traceable diffs** — each commit SHOULD touch the smallest viable surface.
   Refactoring unrelated code in a feature PR is forbidden.
4. **No inbound recording** — any code path that could capture inbound audio MUST
   have a code review sign-off confirming it is unreachable in production config.
5. **Secret scan before merge** — run `npm run lint` + secret grep before every
   PR to `main`. Failing scan = blocked merge.
6. **PHR after every significant prompt** — Prompt History Records MUST be created
   in `history/prompts/` for all implementation, planning, and debugging sessions.

---

## Governance

This constitution supersedes all other development practices and inline comments for
the ACS project. Amendments require:

1. A documented rationale in an ADR (`history/adr/`) or inline amendment note.
2. Version increment per semantic versioning:
   - **MAJOR**: Removal or redefinition of an existing principle (backward incompatible).
   - **MINOR**: New principle, new section, or materially expanded guidance.
   - **PATCH**: Clarification, wording fix, typo correction.
3. All active `plan.md` files MUST have their Constitution Check tables re-validated
   against the new version before the next `/sp.plan` or `/sp.analyze` run.
4. ADR suggestions MUST be made for any architectural decision that creates a
   principle exception; silent exceptions are forbidden.

**Version**: 1.0.0 | **Ratified**: 2026-06-09 | **Last Amended**: 2026-06-09
