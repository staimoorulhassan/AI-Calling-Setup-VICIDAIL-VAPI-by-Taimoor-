---
id: 0063
title: Implement P1 Recordings P2 Call History
stage: green
date: 2026-06-29
surface: Claude Code CLI
model: claude-opus-4-8
feature: ai-calling-agent
branch: 001-ai-calling-agent
user: digitalmarkex@gmail.com
command: /sp.implement
labels: [implement, deploy, recordings, call-history, vicidial, production]
links:
  spec: specs/ai-calling-agent/fixes-2026-06-29/plan.md
  ticket: null
  adr: history/adr/ADR-0002-manual-dial-and-disposition-strategy.md
  pr: null
files:
  - /opt/avr/avr-infra/docker-compose-acs.yml (server — recordings bind mount)
  - avr-app/backend/src/vicidial/vicidial.service.ts (P2 COUNT filter fix)
  - specs/ai-calling-agent/fixes-2026-06-29/plan.md
  - specs/ai-calling-agent/checklists/remediation.md
tests:
  - container sees 1324 files at /var/spool/asterisk/monitor AND /recordings
  - recordings endpoint total=1325; call-history returns real rows
  - COUNT filter verified: campaignId=ZZZNOPE -> total=0 (was 1620)
  - backend build exit=0; /health 200
---

## Prompt

/sp.implement   (no free-text input)

(Decisions via AskUserQuestion: proceed despite incomplete checklists = yes; scope = P1 + P2.)

## Response snapshot

No tasks.md exists for the remediation (its tasks are the P1–P4 checkboxes in
`fixes-2026-06-29/plan.md`). Checklist status: remediation.md 4/28 done, webhook-transfer-api.md
0/33 — both FAIL; user chose to proceed (open items are requirements-quality/unrelated, not
blockers). Scope: P1 + P2.

**P1 — Recordings mount (config deploy):** Confirmed host has 1324 WAVs but container saw neither
`/var/spool/asterisk/monitor` nor `/recordings` (compose volumes had only docker.sock +
backend-data). Added both read-only bind mounts to the `avr-app-backend` service via Python edit
(anchored on `avr-backend-data:/app/data`), validated `docker compose config`, recreated (no image
rebuild needed). Verified: container now sees 1324 files at BOTH paths; no "Monitor path not found";
recordings endpoint returns total=1325; /health 200.

**P2 — Call history:** Logged in (DTO field is `username`, not `email`; admin pw = default 18-char
`agentvoiceresponse`). call-history returns total=1620 with real rows (status NA, phone, leadId,
date) — "empty/useless" symptom resolved. Found the CHK013/T2.2 defect: COUNT query
(`SELECT COUNT(*) FROM vicidial_dial_log`) ignored the campaign filter while rows honored it →
overcount/phantom-pages under a filter. Fixed COUNT to apply the same `cond`. Rebuilt + recreated.
Verified: `campaignId=ZZZNOPE` → total=0 (was 1620), `AI_CAMP` → 1620 (correct), no-campaign → 1620.

Refreshed corrected backup (`/opt/avr/_backups/CORRECTED-20260629/`) with the new compose + service
file. Marked P1 (T1.1–T1.4) and P2 (T2.1–T2.4) [x] in the plan; CHK013 resolved in the checklist.

## Outcome

- ✅ Impact: Recordings tab will populate (1324 files mounted); call-history accurate incl. correct
  pagination totals under campaign filter
- 🧪 Tests: mount=1324 both paths; recordings total=1325; COUNT filter verified; build exit=0; /health 200
- 📁 Files: compose (mount), vicidial.service.ts (COUNT fix), plan.md, remediation.md checklist
- 🔁 Next prompts: UI smoke (play a recording, view Reports table); optional live test call for T3.4/T4.3
- 🧠 Reflection: P2's "empty" was two layers — endpoint wasn't deployed (fixed by reconciliation)
  AND COUNT ignored the filter (fixed here); login DTO uses `username` not `email`

## Evaluation notes (flywheel)

- Failure modes observed: first login attempt used wrong DTO field (email) → 400; corrected to username
- Graders run and results (PASS/FAIL): PASS — both fixes deployed and verified with live API calls
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add doctor smoke-check (recordings mount + creds + AMI login)
