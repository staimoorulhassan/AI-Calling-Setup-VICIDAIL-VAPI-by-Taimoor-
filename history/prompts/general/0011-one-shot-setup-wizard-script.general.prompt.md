---
id: "0011"
title: One-shot setup wizard script
stage: general
date: 2026-06-09
surface: project
model: claude-sonnet-4-6
feature: ""
branch: fix/vercel-static-deploy
user: preyespdrcarpentry@gmail.com
command: manual
labels: [setup, powershell, wizard, onboarding, prerequisites]
links:
  spec: ""
  ticket: ""
  adr: ""
  pr: ""
files:
  - setup.ps1
tests:
  - n/a (setup script; requires live environment to test)
---

## Prompt

Write an easy-setup script that asks for APIs, guides through ViciDial/VAPI/AVR setup with
step-by-step instructions waiting for Enter between each, installs prerequisites, and handles
the full setup from one PS1 script.

## Response snapshot

Created `setup.ps1` (repo root) — an 11-step interactive PowerShell wizard:

STEP 1  — Prerequisite check & install (Node 20, Docker, Git, ngrok via winget)
STEP 2  — VAPI account + assistant creation guide (API keys, assistant config, transferCall tool,
           SIP trunk setup in VAPI dashboard)
STEP 3  — ViciDial configuration guide (agent user 9001, SIP carrier, campaign AMD, remote agents)
STEP 4  — Credential collection (all inputs masked with Read-Host -AsSecureString; JWT + webhook
           secrets auto-generated; AMD sensitivity validated)
STEP 5  — Write .env files (avr-sts-vapi/.env, backend/.env, frontend/.env.local) with
           overwrite confirmation if files already exist
STEP 6  — npm install (backend, frontend, avr-sts-vapi)
STEP 7  — NestJS backend build (npm run build)
STEP 8  — Docker: create avr network, start avr-asterisk + avr-ami, build + run avr-sts-vapi
STEP 9  — Start NestJS backend (port 3001) + Next.js frontend (port 3000) as background processes
STEP 10 — Start ngrok TCP tunnel on port 5060; auto-reads public address from ngrok API at
           localhost:4040; prompts for manual entry if API fails
STEP 11 — In-app configuration guide: create Provider → Agent → Trunk → Number in webapp;
           update ViciDial carrier + VAPI SIP trunk with ngrok host:port
DONE    — Summary banner with all URLs, login, log commands, PIDs

Design choices:
- Color-coded output: Green=ok, Yellow=warn/prompt, Red=error, Cyan=info, DarkGray=guide text
- Box-drawing borders for step headers
- Idempotent: .env files ask before overwrite; Docker containers use rm -f before recreate
- Non-blocking on Docker failures (logs warning, continues)
- AMD sensitivity validated against allowed enum values; falls back to conservative

## Outcome

- ✅ Impact: Full setup from zero to running stack in one script; guides operator through every
  external service requirement
- 🧪 Tests: n/a (needs live environment)
- 📁 Files: setup.ps1 (created, 320 lines)
- 🔁 Next prompts: Commit all changes and push to acs remote; fix remaining sp.analyze findings
- 🧠 Reflection: ngrok TCP tunnels require a free account + authtoken; the script handles the
  auth prompt gracefully and reads the public URL from ngrok's local API after startup

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment: add a --reconfigure flag to skip install/build steps and only re-write .env
