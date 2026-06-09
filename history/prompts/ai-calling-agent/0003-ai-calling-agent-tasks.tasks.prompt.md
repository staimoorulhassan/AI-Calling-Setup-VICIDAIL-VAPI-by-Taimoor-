---
id: "0003"
title: AI Calling Agent Task List Generation
stage: tasks
date: 2026-06-09
surface: agent
model: claude-sonnet-4-6
feature: ai-calling-agent
branch: fix/vercel-static-deploy
user: preyespdrcarpentry@gmail.com
command: /sp.tasks
labels: ["vapi","vicidial","avr-ami","tasks","implementation","calling","react","node"]
links:
  spec: specs/ai-calling-agent/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/ai-calling-agent/tasks.md
tests:
  - TC-1 through TC-35 (all tasks linked to test cases from spec.md)
---

## Prompt

/sp.tasks

(No additional input — generate dependency-ordered tasks.md from all design artifacts in specs/ai-calling-agent/)

## Response snapshot

Generated `specs/ai-calling-agent/tasks.md` with:

- **84 total tasks** across 11 phases
- **48 parallelizable tasks** marked with [P]
- **8 user stories** (US1–US8) all mapped from spec.md FRs
- Format validated: all tasks have checkbox, ID (T001–T084), optional [P], optional [US*], description with file path

**Phase structure:**
- Phase 1 (Setup, 8 tasks): monorepo bootstrap, TypeScript config, env validation, Pino logger
- Phase 2 (Foundational, 14 tasks): Prisma schema + migration, Express skeleton, auth middleware, AMI + VAPI clients, Socket.io, React shell, Axios client — BLOCKS all stories
- Phase 3 (US1, 10 tasks): AMI service, VAPI service, IVR classifier, call state machine, webhook handler, AMD/IVR wiring, health route
- Phase 4 (US2, 6 tasks): auth endpoints (login/logout/me), session revocation, Login page, auth hooks
- Phase 5 (US3, 6 tasks): campaign CRUD endpoints, status patch, Campaign list + editor pages
- Phase 6 (US4, 11 tasks): call log endpoints, live board endpoint, WS /ws/calls, Dashboard + CallLogs + CallDetail pages
- Phase 7 (US5, 6 tasks): transfer service (ConfBridge), POST /calls/:id/transfer, VAPI tool call handler, failure path, UI button + verifier panel
- Phase 8 (US6, 6 tasks): POST /calls/test, WS /ws/transcript/:id, TranscriptPane, AgentTest page
- Phase 9 (US7, 5 tasks): metrics aggregation endpoint, CSV export, Metrics page with Recharts
- Phase 10 (US8, 3 tasks): StatusIndicator component, Health page with auto-refresh
- Phase 11 (Polish, 9 tasks): DB indexes, cron cleanup job, rate-limit/Helmet, integration + unit tests, secret scan, ViciDial dialplan doc

**MVP scope** = Phases 1–4 (US1 + US2): first working demo — ViciDial call → VAPI AI agent → voicemail hang-up → login to webapp → calls in log.

## Outcome

- ✅ Impact: 84 executable tasks ready for /sp.implement; MVP scope identified (Phases 1–4)
- 🧪 Tests: integration + unit tests in Phase 11; all tasks linked to spec.md TC-1 through TC-35
- 📁 Files: specs/ai-calling-agent/tasks.md
- 🔁 Next prompts: /sp.implement to execute tasks; /sp.adr sip-trunk-vs-audiosocket to document key architecture decision
- 🧠 Reflection: 84 tasks for Large complexity (target 30–60) is slightly over — justified by 8 distinct user stories, full-stack monorepo (backend + frontend + integration layer), and no pre-existing codebase to extend from

## Evaluation notes (flywheel)

- Failure modes observed: check-prerequisites.ps1 pointed to wrong feature dir (branch name used as feature); worked around with correct path
- Graders run and results (PASS/FAIL): format validation — all 84 tasks have checkbox + ID + description with file path; all US phases have [US*] labels; all [P] tasks touch different files
- Prompt variant (if applicable): /sp.tasks with no args
- Next experiment: run /sp.implement for Phase 1 tasks to validate task clarity and file-path specificity
