---
id: 0057
title: Manual Dial and Disposition ADR
stage: misc
date: 2026-06-29
surface: Claude Code CLI
model: claude-opus-4-8
feature: ai-calling-agent
branch: 001-ai-calling-agent
user: digitalmarkex@gmail.com
command: /sp.adr manual-dial-and-disposition-strategy
labels: [adr, vicidial, disposition, manual-dial]
links:
  spec: specs/ai-calling-agent/spec.md
  ticket: null
  adr: history/adr/ADR-0002-manual-dial-and-disposition-strategy.md
  pr: null
files:
  - history/adr/ADR-0002-manual-dial-and-disposition-strategy.md
tests:
  - none (documentation artifact)
---

## Prompt

/sp.adr manual-dial-and-disposition-strategy

(Run the ADR workflow: load planning context, extract architecturally significant decision
clusters, check existing ADRs, apply the significance test, and create ADRs for qualifying
decisions. User-supplied focus: manual-dial-and-disposition-strategy.)

## Response snapshot

Loaded the remediation planning artifacts (`specs/ai-calling-agent/fixes-2026-06-29/plan.md`
and `research.md`) which document the 2026-06-29 production regressions. Identified that the
manual-dial (P3) and mandatory-disposition (P4) decisions share one root cause: the original
implementation reused ViciDial APIs that assume a logged-in human agent session, which does not
exist in the AI-headless setup. Clustered both into a single ADR rather than two atomic ADRs.

Created **ADR-0002: Manual Dial & Disposition Strategy — AI-Headless ViciDial Control** (Accepted).
Decision: standardize on session-independent ViciDial interfaces — AMI Originate for manual dial
(over `preview_dial_action`) and the non-agent API for mandatory disposition mapping
(AMD/IVR/XFER/HANDLED/DROP, never `NEW`). Documented 4 alternatives (preview_dial_action,
direct DB write, avr-ami originate-by-channel endpoint, campaign-level enforcement) with
rationale, plus positive/negative consequences. Referenced ADR-0001 (shared avr-ami/avr-sts-vapi
surface).

## Outcome

- ✅ Impact: 1 new ADR created (ADR-0002); 1 existing referenced (ADR-0001); 0 conflicts
- 🧪 Tests: n/a — documentation artifact
- 📁 Files: history/adr/ADR-0002-manual-dial-and-disposition-strategy.md
- 🔁 Next prompts: implement P3/P4 fixes per fixes-2026-06-29/plan.md; deploy + verify dispositions
- 🧠 Reflection: the two bugs looked independent but shared the "agent-session assumption" root —
  clustering them into one ADR captured the real architectural decision

## Evaluation notes (flywheel)

- Failure modes observed: none — avoided over-granular split (2 ADRs) and listed alternatives
- Graders run and results (PASS/FAIL): PASS — clusters multiple components, ≥1 alternative each,
  pros/cons present, concise but sufficient
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
