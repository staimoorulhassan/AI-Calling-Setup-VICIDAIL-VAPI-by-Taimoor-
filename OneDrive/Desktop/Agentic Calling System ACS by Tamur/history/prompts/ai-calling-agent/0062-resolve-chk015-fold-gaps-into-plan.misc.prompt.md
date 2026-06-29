---
id: 0062
title: Resolve CHK015 Fold Gaps Into Plan
stage: misc
date: 2026-06-29
surface: Claude Code CLI
model: claude-opus-4-8
feature: ai-calling-agent
branch: 001-ai-calling-agent
user: digitalmarkex@gmail.com
command: null
labels: [remediation, plan-amendment, checklist, conflict-resolution, manual-dial, disposition]
links:
  spec: specs/ai-calling-agent/fixes-2026-06-29/plan.md
  ticket: null
  adr: history/adr/ADR-0002-manual-dial-and-disposition-strategy.md
  pr: null
files:
  - specs/ai-calling-agent/fixes-2026-06-29/plan.md
  - specs/ai-calling-agent/checklists/remediation.md
tests:
  - n/a (spec/checklist amendment)
---

## Prompt

resolve the CHK015 conflict and fold the gaps into the plan

## Response snapshot

Amended `fixes-2026-06-29/plan.md` and marked the corresponding checklist items resolved:

- **CHK015 (conflict) resolved** — rewrote T3.2 to state manual dial ALWAYS routes through AMI
  Originate (`manualDialViaAmi`); `preview_dial_action` is not used; `campaignId`/`leadId` accepted
  but ignored for routing; the earlier "OR fall back to AMI" wording is explicitly superseded.
  Now consistent with ADR-0002 and what's deployed. Marked [x].
- **CHK005 (gap) folded** — new T4.1a: `VICIDIAL_URL` MUST be base host only (not the full
  `/non_agent_api.php` path → doubled URL); use https directly (self-signed cert ignored).
- **CHK026 (gap) folded** — new T4.1b: validate the API user can actually update leads
  (vdc_agent_api_access=1 + modify_leads + user_level>7 + active); assert response is not
  "USER DOES NOT HAVE PERMISSION". Documents the real prod failure (6666 had access=0).
- **CHK022 (gap) folded** — extended T4.4: enumerated the call-end paths, named
  `VICIDIAL_DEFAULT_DISPO` (default DROP), and added the idempotency requirement (first-write-wins
  `finalDispoWritten` guard; one disposition per call; skip when no phone/lead_id).

Marked the four checklist items [x] with "→ Resolved: ..." pointers and added a resolution note.
Marked the now-deployed plan tasks (T3.2, T4.1, T4.1a/b, T4.2, T4.4) [x]; left T3.4/T4.3
(real live-call verification) unchecked since only dummy-curl validation was done.

## Outcome

- ✅ Impact: plan now unambiguous and matches deployed reality; 4 high-value gaps closed in docs
- 🧪 Tests: n/a
- 📁 Files: fixes-2026-06-29/plan.md (T3.2, T4.1a, T4.1b, T4.4), checklists/remediation.md
- 🔁 Next prompts: place one live test call to satisfy T3.4/T4.3 end-to-end acceptance
- 🧠 Reflection: the checklist's value was concrete — three of the four resolved items were
  defects we'd already hit in prod, now codified so a future revert/redeploy won't repeat them

## Evaluation notes (flywheel)

- Failure modes observed: none — kept edits surgical; did not over-mark live-verification tasks done
- Graders run and results (PASS/FAIL): PASS — conflict resolved with single authoritative wording;
  gaps now have measurable requirement statements
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): re-run /sp.analyze to confirm no new cross-artifact drift
