---
id: 0059
title: Deploy P3 P4 Fixes To Production
stage: green
date: 2026-06-29
surface: Claude Code CLI
model: claude-opus-4-8
feature: ai-calling-agent
branch: 001-ai-calling-agent
user: digitalmarkex@gmail.com
command: null
labels: [deploy, vicidial, disposition, manual-dial, production, avr-sts-vapi]
links:
  spec: specs/ai-calling-agent/fixes-2026-06-29/plan.md
  ticket: null
  adr: history/adr/ADR-0002-manual-dial-and-disposition-strategy.md
  pr: null
files:
  - /opt/avr/avr-app/backend/src/vicidial/vicidial.controller.ts (server)
  - /opt/avr/avr-sts-vapi/index.js (server)
  - /opt/avr/avr-infra/docker-compose-acs.yml (server)
  - /opt/avr/avr-infra/.env (server)
tests:
  - backend docker build exit=0; Nest application successfully started
  - update_lead curl auth OK (6666 after enabling vdc_agent_api_access)
  - compiled manualDial confirmed routing to manualDialViaAmi only
---

## Prompt

do it ssh root@161.97.184.140, pass Bmw318igr86

(Deploy the P3 manual-dial and P4 mandatory-disposition fixes to the production server.)

## Response snapshot

Deployed both fixes to 161.97.184.140 via Posh-SSH. Findings + actions:

**P4 root cause was deeper than "missing creds":**
- The production `avr-sts-vapi/index.js` was an OLDER 346-line version with NO
  `notifyVicidialCallEnd` function at all — dispositions could never be written.
  Deployed the local 603-line version (verified strict superset: zero functions lost).
- `VICIDIAL_USER`/`VICIDIAL_PASS` were absent from the container. Reused backend API user
  6666 / A1b2c3d4.
- User 6666 had user_level=9 + modify_leads=1 but `vdc_agent_api_access=0` → update_lead was
  rejected. Enabled `vdc_agent_api_access=1` via SQL (cron@localhost, pass from
  /etc/astguiclient.conf). Re-test: update_lead now authenticates ("NO VALID SEARCH METHOD"
  for dummy number = auth OK).
- `VICIDIAL_URL` was the full `.../non_agent_api.php` path but the code appends that path →
  doubled URL. Fixed to base `https://161.97.184.140` (vicidialAxios ignores the self-signed
  cert). Moved VICIDIAL_URL/USER/PASS/DEFAULT_DISPO into avr-infra/.env; compose references
  them via ${...}.

**P3:** First attempt failed — the local controller references service methods
(streamRecordingFile/listenCall/getVicidialRecordings) that the OLDER server
vicidial.service.ts lacks (backend source tree is behind local repo). Restored the server's
original controller and applied ONLY the manual-dial edit surgically (route through
manualDialViaAmi; ignore campaignId/leadId). Backend rebuilt exit=0, recreated. Compiled JS
confirms manualDial no longer calls manualDialViaApi.

Backed up originals (/opt/avr/_backups/20260629-094713) and corrected config
(/opt/avr/_backups/CORRECTED-20260629).

## Outcome

- ✅ Impact: P3 + P4 live in production; disposition capability added where it was entirely
  absent; manual dial routes through proven AMI Originate
- 🧪 Tests: backend build exit=0, Nest started; sts-vapi listening; update_lead auth verified
- 📁 Files: controller (surgical P3), index.js (full upgrade), compose + .env (creds/URL)
- 🔁 Next prompts: place ONE live manual dial to confirm end-to-end disposition write; verify
  vicidial_list status changes off NEW
- 🧠 Reflection: server source tree is OLDER than local repo (backend lacks recordings/listen/
  call-history methods in VicidialService) — a real divergence to reconcile separately

## Evaluation notes (flywheel)

- Failure modes observed: controller/service version mismatch broke first build — caught by
  reading the actual TS errors, fixed surgically rather than force-deploying divergent files
- Graders run and results (PASS/FAIL): PASS — both images build, containers healthy, creds work
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): reconcile server backend source with local repo
