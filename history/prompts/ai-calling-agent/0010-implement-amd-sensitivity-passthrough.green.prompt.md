---
id: "0010"
title: Implement AMD sensitivity passthrough
stage: green
date: 2026-06-09
surface: project
model: claude-sonnet-4-6
feature: ai-calling-agent
branch: fix/vercel-static-deploy
user: preyespdrcarpentry@gmail.com
command: /sp.implement
labels: [green, amd-sensitivity, fr-21, agent-entity, avr-sts-vapi, t085]
links:
  spec: specs/ai-calling-agent/spec.md
  ticket: ""
  adr: ""
  pr: ""
files:
  - avr-app/backend/src/agents/agent.entity.ts
  - avr-app/backend/src/agents/dto/create-agent.dto.ts
  - avr-app/backend/src/agents/dto/update-agent.dto.ts
  - avr-app/backend/src/agents/agents.service.ts
  - avr-sts-vapi/index.js
  - avr-sts-vapi/.dockerignore
  - .gitignore
  - specs/ai-calling-agent/tasks.md
tests:
  - tsc --noEmit: PASS (0 errors in modified files; 3 pre-existing merge conflict markers in providers.service.spec.ts unrelated to this change)
---

## Prompt

/sp.implement — execute the implementation plan from tasks.md.

## Response snapshot

All tasks T001–T084 were already implemented (marked [x]) in the existing avr-app codebase.
The one incomplete task was T085 (renumbered from T045 to avoid collision with existing Phase 6
T045). Implemented T085: FR-21 AMD sensitivity passthrough.

**No checklists found** — proceeded automatically.

**T085 implementation — 5 files changed:**

### 1. `agent.entity.ts`
Added `AmdSensitivity` enum (disabled | conservative | normal | aggressive) and `amdSensitivity`
column with `default: AmdSensitivity.CONSERVATIVE`. TypeORM `synchronize: true` auto-adds the
column on next startup.

### 2. `create-agent.dto.ts`
Added optional `@IsEnum(AmdSensitivity) amdSensitivity?: AmdSensitivity` field.

### 3. `update-agent.dto.ts`
Added optional `@IsEnum(AmdSensitivity) amdSensitivity?: AmdSensitivity` field.

### 4. `agents.service.ts`
- `create()`: sets `amdSensitivity` from DTO, defaulting to `CONSERVATIVE`
- `update()`: updates `amdSensitivity` when provided
- `runAgent()` STS path: pushes `AMD_SENSITIVITY=<value>` into the STS provider container's env
  and logs the sensitivity level as a campaign start event

### 5. `avr-sts-vapi/index.js`
- Added `AMD_SENSITIVITY` const with validation (falls back to `conservative` for unknown values)
- Added `applyVicidialAmdSensitivity()` async function — calls ViciDial's
  `non_agent_api.php?function=update_campaign&amd_sensitivity=<value>` on startup
- Function is non-fatal (logs warning if ViciDial API doesn't support the call)
- Called in the startup IIFE when `VICIDIAL_URL` is set

**Project setup verified:**
- Root `.gitignore`: solid coverage; removed stale Prisma migration entry
- `avr-sts-vapi/.dockerignore`: created (was missing despite Dockerfile existing)
- Pre-existing CRLF lint issue (6079 `Delete ␍` errors) is project-wide on Windows, unrelated

## Outcome

- ✅ Impact: T085 (FR-21) implemented; AMD sensitivity stored per-agent, injected as env var to
  STS container on agent start, applied to ViciDial campaign via non_agent_api on container startup
- 🧪 Tests: tsc --noEmit passes for all modified files; 3 pre-existing merge conflict markers in
  providers.service.spec.ts are unrelated (noted for separate fix)
- 📁 Files: agent.entity.ts, create/update agent DTOs, agents.service.ts, avr-sts-vapi/index.js,
  avr-sts-vapi/.dockerignore, .gitignore (Prisma stale entry removed), tasks.md (T085 marked [x])
- 🔁 Next prompts: Fix 3 merge conflict markers in providers.service.spec.ts; fix CRLF issue
  (run git config core.autocrlf false + git attributes); push all changes to acs remote
- 🧠 Reflection: AMD sensitivity doesn't belong in a "campaign" entity (no such entity in avr-app)
  — it belongs in the Agent entity since each Agent represents an AVR pipeline. The env var
  injection pattern (agent config → container env) is consistent with how all other provider
  config flows through the system.

## Evaluation notes (flywheel)

- Failure modes observed: T045 numbering collision (introduced in prior session, fixed before
  implement); self-import in agent.entity.ts (caught and fixed immediately)
- Graders run and results (PASS/FAIL): tsc PASS
- Prompt variant (if applicable): n/a
- Next experiment: add integration test for AMD sensitivity env var injection in runAgent()
