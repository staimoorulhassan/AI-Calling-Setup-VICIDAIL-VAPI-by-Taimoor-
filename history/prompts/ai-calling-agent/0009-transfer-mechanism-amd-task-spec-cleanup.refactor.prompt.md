---
id: "0009"
title: Transfer mechanism AMD task spec cleanup
stage: refactor
date: 2026-06-09
surface: project
model: claude-sonnet-4-6
feature: ai-calling-agent
branch: fix/vercel-static-deploy
user: preyespdrcarpentry@gmail.com
command: manual
labels: [refactor, 3-way-transfer, conf_newcall, AMD, spec-cleanup, i5, c2, d1]
links:
  spec: specs/ai-calling-agent/spec.md
  ticket: ""
  adr: ""
  pr: ""
files:
  - specs/ai-calling-agent/spec.md
  - specs/ai-calling-agent/plan.md
  - specs/ai-calling-agent/tasks.md
tests:
  - n/a (documentation only)
---

## Prompt

Document the actual 3-way transfer mechanism (ViciDial conf_newcall API) in spec §5.4 and plan
AD-4. The design docs say one thing (AMI ConfBridge), the code does another (ViciDial HTTP API).
C2 — Add backend AMD sensitivity passthrough task for FR-21.
D1 — Remove spec.md §8 task list (superseded by tasks.md).

## Response snapshot

### I5 — 3-way transfer mechanism corrected

**spec.md §5.3 step 6** updated: describes VAPI `transferCall` tool call → `avr-sts-vapi` →
`non_agent_api.php` (get session ID) → `agc/api.php?action=conf_newcall` (dial verifier).

**spec.md §5.4** rewritten with:
- Full 5-step transfer sequence documenting the actual ViciDial HTTP API calls
- Rationale section explaining why `conf_newcall` was chosen over AMI ConfBridge (ViciDial
  already owns the conference slot; single HTTP call vs. multi-step AMI orchestration)

**plan.md AD-4** rewritten:
- Old: "Create Asterisk ConfBridge room; redirect prospect + originate verifier into it"
- New: ViciDial `conf_newcall` API via `non_agent_api.php` + `agc/api.php`; explicit rejection
  of AMI ConfBridge with rationale; rejection of SIP REFER retained

**plan.md OQ-5** resolution updated: "AMI ConfBridge dials it" → "ViciDial `conf_newcall` API
dials it into the existing ViciDial-managed conference"

**plan.md Follow-ups risk 1** updated: ConfBridge AMI validation → `conf_newcall` API validation
requirement (Agent API Access: 1 in ViciDial admin)

**plan.md Source Code tree** replaced: removed Prisma/Express/Vite paths; replaced with actual
`avr-app/backend/` (NestJS), `avr-app/frontend/` (Next.js App Router), and `avr-sts-vapi/` tree

### C2 — AMD sensitivity passthrough task added

**tasks.md T085** added in Phase 5 (US3) after T044 (renumbered from T045 to avoid collision with existing Phase 6 T045):
- Backend task: read `campaign.amd_sensitivity` from DB and pass it to ViciDial's
  `non_agent_api.php` campaign update call when dialing starts
- Accepted values: `disabled | conservative | normal | aggressive`; default `conservative`
- File: `avr-app/backend/src/agents/agents.service.ts`

### D1 — spec.md §8 task list removed

Replaced ~76 lines of duplicate task list (T-1.1 through T-6.5) with a single redirect:
> "This section is superseded by `specs/ai-calling-agent/tasks.md`"
`tasks.md` is the authoritative, dependency-ordered task list.

## Outcome

- ✅ Impact: sp.analyze findings I5 (transfer mechanism mismatch), C2 (missing AMD task), and D1
  (duplicate task list) all resolved; spec, plan, and tasks now agree with the actual code in
  `avr-sts-vapi/index.js`
- 🧪 Tests: n/a (documentation refactor)
- 📁 Files: specs/ai-calling-agent/spec.md (§5.3 step 6, §5.4, §8), specs/ai-calling-agent/plan.md
  (AD-4, OQ-5, risk 1, source code tree), specs/ai-calling-agent/tasks.md (T045 added)
- 🔁 Next prompts: Fix remaining sp.analyze findings — I3 (plan.md branch field → main), I4
  (task statuses ⬜ → ✅), I6 (spec §9 OQ statuses — mark resolved); commit to acs remote
- 🧠 Reflection: The ConfBridge design was specced before the decision to route transfer through
  `avr-sts-vapi`'s WebSocket handler. ViciDial's `conf_newcall` API is strictly simpler: it
  treats the existing agent session as the conference anchor and adds participants via HTTP, so
  ACS needs no AMI session, no channel redirect, and no ConfBridge room lifecycle management.

## Evaluation notes (flywheel)

- Failure modes observed: plan.md Source Code tree was also stale (Prisma/Express paths) —
  caught and fixed in the same pass; worth checking source trees when fixing stack mismatches
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment: run /sp.analyze again after I3/I4/I6 fixes to confirm clean report
