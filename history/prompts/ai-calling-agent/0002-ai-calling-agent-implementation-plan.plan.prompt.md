---
id: "0002"
title: AI Calling Agent Implementation Plan
stage: plan
date: 2026-06-09
surface: agent
model: claude-sonnet-4-6
feature: ai-calling-agent
branch: fix/vercel-static-deploy
user: preyespdrcarpentry@gmail.com
command: /sp.plan
labels: ["vapi","vicidial","avr-ami","sip-trunk","architecture","plan","calling"]
links:
  spec: specs/ai-calling-agent/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/ai-calling-agent/plan.md
  - specs/ai-calling-agent/research.md
  - specs/ai-calling-agent/data-model.md
  - specs/ai-calling-agent/quickstart.md
  - specs/ai-calling-agent/contracts/openapi.yaml
  - specs/ai-calling-agent/contracts/websocket.md
  - .specify/memory/agent-claude.md
tests:
  - TC-1 through TC-35 (defined in spec.md, not yet run)
---

## Prompt

/sp.plan

(No additional input — execute planning workflow for the ai-calling-agent feature based on spec.md)

## Response snapshot

Completed full /sp.plan workflow in two phases:

**Phase 0 — Research (all OQs resolved):**
- OQ-1: `avr-ami` only for AMI control; SIP Trunk for audio (not AudioSocket). `avr-infra` not needed.
- OQ-2: ViciDial native AMD at Asterisk dialplan level.
- OQ-3: IVR detection via regex/keyword classifier on first VAPI transcript turn → AMI hang-up.
- OQ-5: Verifier = PSTN phone number in campaign config; AMI ConfBridge dials it.

**Phase 1 — Design (all artifacts produced):**
- `plan.md`: full implementation plan with tech context, project structure, architecture decisions
- `research.md`: sourced findings from GitHub (avr-ami, avr-infra), VAPI docs, ViciDial Agent API, Asterisk AMD docs
- `data-model.md`: 6 entities (users, campaigns, calls, transcripts, events, sessions) with indexes, state machines
- `contracts/openapi.yaml`: full OpenAPI 3.1 spec (auth, campaigns, calls, metrics, health, webhooks)
- `contracts/websocket.md`: WS message formats for live board + transcript + VAPI tool call contract
- `quickstart.md`: step-by-step setup for ViciDial AMI, VAPI SIP trunk, DB, local dev

**Key Architecture Decision:** SIP Trunk chosen over AudioSocket for audio path (NFR-9, documented; no codec bridging needed).

## Outcome

- ✅ Impact: Full implementation plan ready; all 7 open questions from spec resolved; 6 artifacts produced
- 🧪 Tests: No new tests; existing TC-1 to TC-35 from spec.md cover implementation
- 📁 Files: 7 files created (plan.md, research.md, data-model.md, quickstart.md, openapi.yaml, websocket.md, agent-claude.md)
- 🔁 Next prompts: `/sp.tasks` to generate dependency-ordered tasks.md; `/sp.adr sip-trunk-vs-audiosocket` for key architecture decision
- 🧠 Reflection: Research revealed VAPI has no built-in IVR detection and no official Asterisk AudioSocket integration; SIP trunk is the correct production path. avr-ami (not avr-infra) is the only needed AVR repo.

## Evaluation notes (flywheel)

- Failure modes observed: setup-plan.ps1 resolved wrong path (used branch name as feature name); worked around by using correct spec path manually
- Graders run and results (PASS/FAIL): constitution check passed (6/6 gates); post-design check passed (6/6 gates)
- Prompt variant (if applicable): /sp.plan with no additional args
- Next experiment: run /sp.tasks; test SIP trunk connection to VAPI in T-5.1
