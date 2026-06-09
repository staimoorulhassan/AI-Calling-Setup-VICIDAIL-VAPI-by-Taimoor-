---
id: "0012"
title: Rewrite complete README
stage: general
date: 2026-06-09
surface: project
model: claude-sonnet-4-6
feature: ""
branch: fix/vercel-static-deploy
user: preyespdrcarpentry@gmail.com
command: manual
labels: [readme, documentation, setup, architecture]
links:
  spec: ""
  ticket: ""
  adr: ""
  pr: ""
files:
  - README.md
tests:
  - n/a (documentation)
---

## Prompt

rewrite whole readme

## Response snapshot

Replaced the existing 629-line README.md with a full rewrite covering:

**Structure (16 sections):**
1. Architecture — ASCII diagram showing full call flow (ViciDial → ngrok → avr-asterisk → avr-core → avr-sts-vapi → VAPI)
2. What it does — feature table (AI calls, AMD, IVR detection, 3-way transfer, AMD sensitivity control, agent management, trunk/number routing, browser softphone, recordings)
3. Tech stack — complete table (ViciDial, Asterisk 23, avr-ami, avr-sts-vapi, VAPI, NestJS 11, Next.js 16, Docker, ngrok)
4. Quick start (one script) — `setup.ps1` as primary path; 11 steps the script performs listed
5. Manual setup — prerequisites table, clone/install, all 3 .env files (with every variable and example values), Docker run commands for avr-asterisk + avr-ami, avr-sts-vapi build/run, avr-app start commands
6. VAPI configuration — API keys, assistant creation, transferCall tool JSON definition, SIP trunk setup
7. ViciDial configuration — agent user creation (with "Agent API Access = 1" note), ngrok setup, SIP carrier creation, campaign config, Remote Agents mode
8. In-app setup — 5-step flow: Provider → Agent (with AMD sensitivity) → Start → Trunk → Number
9. End-to-end call flow — 12-step numbered sequence with branching at AMD decision and IVR detection
10. 3-way transfer deep-dive — correct ViciDial conf_newcall sequence (not AMI ConfBridge); requirements checklist; failure handling
11. AMD sensitivity — value table, how-it's-applied sequence (4 steps from UI to ViciDial API call)
12. Webapp pages — table of all 10 protected pages + login
13. API reference — curl examples for login + token usage; full endpoint table (Auth, Agents, Providers, Trunks, Numbers, Phones, Calls, Recordings, Users, Health, Webhooks)
14. Environment variable reference — all 3 .env files with Required/Default/Description for every var
15. Project structure — annotated directory tree
16. Development commands — all dev/lint/test/build commands for backend + frontend + avr-sts-vapi; CI quality gates table
17. Troubleshooting — 8 common issues with diagnosis + fix (Docker daemon, frontend blank page, ARI refused, avr-ami not healthy, agent stuck, ViciDial can't reach AVR, 3-way transfer checklist, ngrok authtoken, CRLF Prettier errors)

**Key improvements over old README:**
- setup.ps1 is the primary quick-start, not manual steps
- 3-way transfer uses correct ViciDial conf_newcall API (not AMI ConfBridge)
- AMD sensitivity section added
- All 10 webapp pages documented (old README omitted dockers/calls/recordings)
- transferCall tool JSON definition included in VAPI section
- "Agent API Access = 1" requirement surfaced prominently
- CRLF Windows fix documented
- TypeORM synchronize:true and auto-seeding behavior documented

## Outcome

- ✅ Impact: README fully replaced with accurate, comprehensive documentation; setup.ps1 is the hero path; all known config requirements and gotchas documented
- 🧪 Tests: n/a (documentation)
- 📁 Files: README.md (full replacement)
- 🔁 Next prompts: Fix 3 merge conflict markers in providers.service.spec.ts; fix CRLF issue; push all changes to acs remote
- 🧠 Reflection: The old README documented AMI ConfBridge for 3-way transfer (incorrect) and omitted several webapp pages. The new README is sourced from the actual code and tested implementation paths.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment: add a CHANGELOG.md; add badges (CI, license, version)
