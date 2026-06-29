---
id: 0060
title: Reconcile Backend Source Divergence
stage: green
date: 2026-06-29
surface: Claude Code CLI
model: claude-opus-4-8
feature: ai-calling-agent
branch: 001-ai-calling-agent
user: digitalmarkex@gmail.com
command: null
labels: [deploy, reconciliation, backend, production, sts-provider, vicidial]
links:
  spec: specs/ai-calling-agent/plan.md
  ticket: null
  adr: history/adr/ADR-0002-manual-dial-and-disposition-strategy.md
  pr: null
files:
  - /opt/avr/avr-app/backend/src/app.module.ts (server)
  - /opt/avr/avr-app/backend/src/vicidial/{controller,module,service,signal.controller}.ts (server)
  - /opt/avr/avr-app/backend/src/sts-provider/{controller,module,service}.ts (server, new)
  - CLAUDE.md (corrected CallingModule note)
tests:
  - normalized manifest diff local-vs-server = 0 after sync (172 files identical)
  - backend docker build exit=0; Nest started; no DI errors; /health 200
  - new routes mapped (ai-provider/*, internal/call-signal, recordings, calls/:channel/listen)
---

## Prompt

reconcile the backend source divergence

## Response snapshot

Computed line-ending-normalized md5 manifests of the backend `src/` tree on both sides
(local Windows CRLF vs server LF made raw md5 useless). Result: divergence was clean and
ONE-DIRECTIONAL — local strictly ahead, **0 prod-only files**.

Differences (8 files): 4 new (`sts-provider/{controller,module,service}.ts`,
`vicidial/vicidial-signal.controller.ts`) + 4 changed (`app.module.ts`,
`vicidial.{controller,module,service}.ts`). `package.json`/`tsconfig.json`/`tsconfig.build.json`
were already IDENTICAL → no dependency or build-config drift.

Pre-deploy safety checks:
- Server already imports `CallingModule` and boots fine (`acs-postgres` + `acs-redis` up) →
  the only app.module change is adding `StsProviderModule` (CLAUDE.md's "not imported" note was
  stale; corrected).
- `StsProviderService` injects `AppSettingsService` but `StsProviderModule` doesn't import
  AppSettingsModule — safe ONLY because AppSettingsModule is `@Global()` (verified). DockerModule
  exports DockerService (verified). `vicidial-signal.controller` only mutates an in-memory map.

Deployed: backed up server originals (`/opt/avr/_backups/recon-20260629`), synced 8 files
local→server. Re-ran normalized manifest: **server src now byte-identical to local (172 files,
0 diffs, 0 only-server)**. Rebuilt (exit=0), recreated. Verified: Nest started, no DI/errors,
`/health` 200, routes mapped incl. `/api/v1/internal/call-signal` (the sts-vapi `postCallSignal`
target — realtime light now works) and `/api/v1/ai-provider/*`.

## Outcome

- ✅ Impact: production backend source == local repo; recordings/listen/call-history + ai-provider
  + internal call-signal features now actually deployed; future deploys will build
- 🧪 Tests: manifest diff=0; build exit=0; clean boot; /health 200; routes mapped
- 📁 Files: 8 server files synced; CLAUDE.md CallingModule note corrected
- 🔁 Next prompts: consider putting the server under git (it's a bare snapshot) to prevent future
  drift; place a live test call to confirm realtime signals + dispositions end-to-end
- 🧠 Reflection: normalize line endings before cross-platform hash compares; verify @Global()/DI
  before deploying new modules since tsc won't catch missing-import DI failures

## Evaluation notes (flywheel)

- Failure modes observed: none this round — pre-flight DI/@Global check prevented a boot crash
- Graders run and results (PASS/FAIL): PASS — byte-identical trees, clean boot, routes mapped
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): init git on the server source tree to track drift
