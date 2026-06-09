---
id: "0004"
title: ACS Constitution v1.0.0
stage: constitution
date: 2026-06-09
surface: project
model: claude-sonnet-4-6
feature: ""
branch: fix/vercel-static-deploy
user: preyespdrcarpentry@gmail.com
command: /sp.constitution
labels: [constitution, governance, principles, acs]
links:
  spec: ""
  ticket: ""
  adr: ""
  pr: ""
files:
  - .specify/memory/constitution.md
  - .specify/templates/plan-template.md
tests:
  - n/a (governance document)
---

## Prompt

/sp.constitution — fill in the project constitution template at
`.specify/memory/constitution.md` with concrete ACS-specific principles
derived from the spec, plan, CLAUDE.md, and codebase context.

## Response snapshot

Created constitution v1.0.0 with six core principles:

I. **Outbound-Only Audio** (NON-NEGOTIABLE) — inbound call audio must never be
   stored; enforced at DB insert level with `direction='outbound'`.

II. **Secrets in Environment** — all credentials in `.env` only; secret scan
   must pass before every merge to main.

III. **AMD/IVR Detection Before AI Engagement** — AMD at ViciDial/Asterisk
   dialplan level; IVR on first VAPI transcript turn; no AI audio to voicemail.

IV. **Structured Observability for Every Call Event** — JSON events with
   call_id, timestamp, event_type for all lifecycle events; persisted to DB
   and emitted via Socket.io.

V. **Minimal AVR Surface** — only avr-ami, avr-asterisk, avr-core,
   avr-sts-vapi in scope; additions require ADR.

VI. **Testable Requirements with Traceability** — every FR has a TC; every
   task references a FR or TC; performance NFRs have measurement tasks.

Added Security Requirements section, Performance Standards table (6 metrics
with thresholds), Development Workflow section, and Governance section with
amendment versioning rules.

Updated `.specify/templates/plan-template.md` Constitution Check section to
reference the six concrete gates with ⬜ checkboxes.

Version: 1.0.0 | Ratified: 2026-06-09

## Outcome

- ✅ Impact: Constitution fully filled; plan-template Constitution Check now
  has concrete, enforceable gates; sp.analyze C1 (critical) resolved.
- 🧪 Tests: n/a
- 📁 Files: .specify/memory/constitution.md (created), .specify/templates/plan-template.md (updated)
- 🔁 Next prompts: Re-run /sp.analyze to confirm C1 resolved; update spec.md
  and plan.md Constitution Check table to reference v1.0.0 gates; fix I1 (stack
  mismatch) across spec/plan/tasks.
- 🧠 Reflection: The six principles map directly to the spec's non-negotiable
  requirements (FR-4, FR-5, FR-6, NFR-5, NFR-7, NFR-8, NFR-9). Deriving them
  from existing artifacts rather than inventing new rules keeps the constitution
  authoritative without being aspirational.

## Evaluation notes (flywheel)

- Failure modes observed: none — template placeholders were clear; project
  context was rich enough to derive concrete principles without ambiguity.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment: validate that plan.md's existing Constitution Check table
  maps cleanly to the six new gates; update plan.md if needed.
