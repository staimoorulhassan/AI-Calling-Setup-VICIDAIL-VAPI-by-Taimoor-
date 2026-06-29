# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

The **Agentic Calling System (ACS)** is an outbound AI-powered voice calling platform. It integrates:
- **ViciDial** — outbound call dialer and session manager
- **VAPI** — AI voice layer (STT, TTS, LLM)
- **AVR (Agent Voice Response)** — bridge/router between ViciDial and VAPI
- **avr-app** — custom admin + calling webapp (this repo's primary app)

## Repository Layout

```
avr-app/                   Admin + Calling panel: NestJS backend + Next.js frontend
  backend/                 NestJS 11, port 3001 (set via PORT in .env)
    src/
      calling/             CallingModule — outbound AI calling feature (imported in app.module.ts; needs PostgreSQL + Redis)
        api/               REST controllers: campaigns, calls, leads, compliance, health
        ai-agent/          VapiConnectorService
        campaigns/         CampaignsService, LaunchValidatorService
        compliance/        DncGateService, AuditLoggerService, OptOutProcessorService
        dialing/           DialingEngineService, DialRatioService
        entities/          11 TypeORM entities (PostgreSQL datasource 'calling')
        leads/             CsvImporterService, PhoneValidatorService
        migrations/        TypeORM migrations (synchronize: false)
        realtime/          Socket.io: SocketServerService, CallEventService, RealtimeModule
        security/          PiiEncryptionSubscriber (AES-256-GCM on Lead PII)
        seeds/             Disposition seeder
        storage/           S3Service
        telephony/         AriClientService, AmiClientService, AmdHandlerService, CallStateService
        callbacks/         CallbackSchedulerService
        reporting/         ReportExportService
        workers/           BullMQ workers: lead-import, dialing, opt-out, recording-upload,
                           report-export, callback-scheduler, dnc-import
  frontend/                Next.js 16 (React 19), dev port 3000 / Docker production port 3001
    app/(auth)/            Login page
    app/(protected)/       Authenticated views
      agents/              Agent management
      calls/               Call history
      campaigns/           Campaign list + create/edit form
      dockers/             Docker container management
      leads/               Lead list, lead detail, CSV import
      numbers/             Phone number management
      overview/            Dashboard
      phones/              Softphone management
      providers/           Provider configuration
      recordings/          Call recordings
      trunks/              SIP trunk configuration
      users/               User management
avr-infra/                 Docker Compose stacks for AVR pipeline
avr-sts-vapi/              VAPI Speech-to-Speech bridge (port 6042) — primary VAPI connector
avr-asr-*/                 ASR (speech-to-text) service connectors
avr-llm-*/                 LLM service connectors
avr-tts-*/                 TTS (text-to-speech) service connectors
avr-sts-*/                 Speech-to-Speech connectors (deepgram, elevenlabs, gemini, openai, etc.)
avr-ami/                   Asterisk Manager Interface bridge
avr-asterisk/              Asterisk PBX container config
avr-vad/                   Voice Activity Detection
avr-resampler/             Audio resampler
avr-webhook/               Webhook forwarder
avr-phone/                 Browser-based softphone
avr-docs-mcp/              MCP server exposing AVR documentation
TTS/                       Custom MOSS TTS model artifacts
specs/ai-calling-agent/    Feature specs, plan, tasks, contracts
.specify/                  SpecKit Plus local templates and scripts
history/prompts/           Prompt History Records (PHRs)
history/adr/               Architecture Decision Records
```

## Quick Start

**First-time setup** (interactive wizard — prerequisites, API keys, Docker, env files, all services):
```powershell
.\setup.ps1
```

**Start all services** (Docker network + avr-asterisk + avr-ami + avr-sts-vapi + backend + frontend):
```powershell
.\start-all.ps1
```

---

## Development Commands

Each sub-project runs from its own subdirectory. The root `package.json` defines a monorepo workspace but its `backend`/`frontend` paths point to the repo root (legacy layout) — **ignore the root workspace scripts and use the subdirectory commands below**.

### avr-app/backend (NestJS, **port 3001**)

```bash
cd avr-app/backend
npm install
npm run start:dev      # watch mode — logs to backend-clean.log when run via Start-Process
npm run build          # compile to dist/  (must pass with 0 errors before pushing)
npm run lint           # ESLint
npm test               # jest unit tests
npm run test:cov       # coverage
npm run test:e2e       # e2e (test/jest-e2e.json)
```

Run a single test file:
```bash
npx jest src/agents/agents.service.spec.ts
```

**IMPORTANT**: The backend listens on `PORT` from `.env` (default `3001`). Always use `http://localhost:3001` for API calls and integration tests.

Default admin credentials: `admin@agentvoiceresponse.com` / `agentvoiceresponse` (or `ADMIN_PASSWORD` env var).

### avr-app/frontend (Next.js 16 + React 19, dev port 3000)

```bash
cd avr-app/frontend
npm install
npm run start:dev      # next dev
npm run build          # next build
npm run lint           # eslint
npm test               # vitest run
```

Run a single frontend test:
```bash
npx vitest run test/<test-file>
```

**IMPORTANT**: Frontend pages live in `avr-app/frontend/app/(protected)/` (App Router), **not** `src/app/`. Do not create files under `src/app/` — that directory is a scaffold artifact.

### avr-sts-vapi (VAPI Bridge, port 6042)

Standalone Node.js service that connects VAPI's WebSocket to Asterisk/ViciDial.

```bash
cd avr-sts-vapi
node index.js           # direct run
# or build & run in Docker (done by start-all.ps1):
docker build --platform linux/amd64 -t agentvoiceresponse/avr-sts-vapi .
docker run -d --name avr-sts-vapi --network avr -p 6042:6042 --env-file .env agentvoiceresponse/avr-sts-vapi
```

Key env vars (`avr-sts-vapi/.env`):

| Variable | Description |
|---|---|
| `PORT` | Service port (default `6042`) |
| `VAPI_PRIVATE_KEY` | VAPI API key |
| `VAPI_PUBLIC_KEY` | VAPI public key |
| `VAPI_ASSISTANT_ID` | VAPI assistant to use |
| `VICIDIAL_URL` | ViciDial URL for 3-way transfer (optional) |
| `AVR_AMI_URL` | avr-ami bridge URL (default `http://avr-ami:6006`) |
| `TRANSFER_CONFIRM_DELAY_MS` | Delay before dropping AI leg after transfer (default `8000`) |

### Local verification before pushing

```bash
cd avr-app/backend && npm run lint && npm test
cd avr-app/frontend && npm run lint && npm run build
```

CI (`.github/workflows/main.yml`) only builds and pushes Docker images on push to `main` — it does **not** run lint or tests. Verify locally before pushing.

### AVR infrastructure (Docker)

```bash
cd avr-infra
cp .env.example .env          # fill in API keys
docker-compose -f docker-compose-vapi.yml up -d    # VAPI stack (this project's primary)
docker-compose -f docker-compose-openai.yml up -d  # OpenAI example
```

Each `docker-compose-<provider>.yml` bundles Asterisk + avr-core + a specific ASR/LLM/TTS combination. See `avr-infra/README.md` for the full provider matrix.

**Docker services wired by `start-all.ps1`:**
- `avr-asterisk` — Asterisk PBX; SIP on 5060, ARI on 8088, AMI on 5038
- `avr-ami` — AMI bridge; REST on 6006
- `avr-sts-vapi` — VAPI bridge; WebSocket on 6042

---

## Architecture

### avr-app Backend (NestJS 11)

**Single DataSource (SQLite only):**
- **Primary (SQLite)** — `synchronize: true`, auto-loads admin entities (Agents, Users, Providers, Phones, Numbers, Trunks, Webhooks, Recordings, Asterisk). No migrations; renaming a column = data loss.

**CallingModule** (`src/calling/`) is the PostgreSQL-backed outbound calling feature and **is imported in `src/app.module.ts`**. It requires a PostgreSQL DataSource and Redis (BullMQ) to boot — both run in production (`acs-postgres`, `acs-redis`). The `app-settings` module is `@Global()`, so `AppSettingsService` injects without an explicit import. `StsProviderModule` (exposes `/api/v1/ai-provider/*`) is also wired in app.module.

**Socket.io** is wired by `SocketServerService.onApplicationBootstrap()` using `HttpAdapterHost` — **do not** call `app.get(SocketServerService)` from `main.ts` (NestJS's `ExceptionsZone.run()` calls `process.exit(1)` on DI failures, which bypasses any try-catch).

**BullMQ queues** (all require Redis on port 6379):
- `lead-import`, `dialing`, `opt-out`, `recording-upload`, `report-export`, `callback-scheduler`, `dnc-import`

**Auth**: JWT via `passport-jwt`; tokens expire in 8 h. Roles: `admin`, `manager`, `viewer`. All admin endpoints require `JwtAuthGuard`. `GET /health` and `POST /auth/login` are the only unauthenticated endpoints.

**Global ValidationPipe**: `forbidNonWhitelisted: true` — DTOs must declare every accepted field with `class-validator` decorators or requests 400.

**Key modules**: `Auth`, `Users`, `Providers`, `Agents`, `Docker`, `Phones`, `Numbers`, `Trunks`, `Webhooks`, `Recordings`

**Agent lifecycle**: `agent-lifecycle.ts` enforces valid status transitions; `AgentsService` assembles provider env-vars and launches one Docker container per agent on the `avr` network. Backend talks to the host daemon via `/var/run/docker.sock` (`DOCKER_SOCKET_PATH`).

**Asterisk integration**: `AsteriskService` rewrites `extensions.conf` and `pjsip.conf` under `ASTERISK_CONFIG_PATH`. Config blocks live inside `; BEGIN AVR-MANAGED` … `; END AVR-MANAGED` — hand edits inside those markers are overwritten by trunk/phone/number CRUD. `TENANT` env (default `demo`) is used as the dialplan context.

**Tool mounts**: `TOOLS_DIR` / `AVR_TOOLS_DIR` are bind-mounted into spawned agent containers at `/usr/src/app/tools` and `/usr/src/app/avr_tools`. Must be absolute host paths.

### avr-app Frontend (Next.js 16)

- **Router**: Next.js App Router; `app/(auth)/` for login, `app/(protected)/` for all authenticated views. Pages live in `app/(protected)/`, **not** `src/app/`.
- **Protected sections**: `agents`, `calls`, `campaigns`, `dockers`, `leads`, `numbers`, `overview`, `phones`, `providers`, `recordings`, `trunks`, `users`
- **UI**: Tailwind CSS v4 + shadcn/ui (Radix primitives, style `new-york`, base color `neutral`); component registry in `components.json`
- **Forms**: `react-hook-form` + `zod`
- **Env loading**: `next-runtime-env` — read `NEXT_PUBLIC_*` vars via `env('NAME')`, not `process.env`. Restart dev server after `.env` edits.
- **i18n**: `lib/i18n/en.ts` and `it.ts` — add new navigation keys to **both** files
- **Testing**: Vitest + Testing Library (config: `vitest.config.ts`)

### AVR Pipeline (audio flow)

```
Asterisk ──AudioSocket──► avr-core ──HTTP/WS──► avr-asr-* ──► avr-llm-* ──► avr-tts-* ──► avr-core ──► Asterisk
```
For Speech-to-Speech providers, `avr-sts-*` replaces all three steps via a single WebSocket connection (`STS_URL`).

### Key Environment Variables (avr-app/backend/.env)

| Variable | Description |
|---|---|
| `PORT` | HTTP listen port (default `3001`) |
| `JWT_SECRET` | JWT signing key |
| `ADMIN_PASSWORD` | Default admin user password (fallback: `agentvoiceresponse`) |
| `TENANT` | Dialplan context name (default `demo`) used by AsteriskService |
| `CORE_DEFAULT_IMAGE` | Docker image for AVR containers (default: `agentvoiceresponse/avr-core:latest`) |
| `TOOLS_DIR` / `AVR_TOOLS_DIR` | Absolute host paths bind-mounted into agent containers |
| `ARI_URL`, `ARI_USERNAME`, `ARI_PASSWORD` | Asterisk REST Interface |
| `AMI_URL` | Asterisk Manager Interface bridge |
| `FRONTEND_URL` | CORS origin (default: `http://localhost:3000`) |
| `VAPI_API_KEY` | VAPI API key for AI voice calls |
| `S3_BUCKET`, `AWS_*` | S3 recording storage |

---

## Security Rules (Non-Negotiable)

These are enforced by the project constitution. **Never violate them.**

1. **`direction = 'outbound'`** on every `CallRecord` insert — use `CallDirection.OUTBOUND` enum, never string literal.
2. **PII encryption** — `Lead.firstName`, `lastName`, `email` encrypted at rest via `PiiEncryptionSubscriber`. `APP_ENCRYPTION_KEY` required in prod.
3. **DNC gate** — always check `DncGateService.isOnDncList()` before dialing. Redis hot cache (`HGET dnc:<e164>`).
4. **No secrets in code** — all credentials/keys in `.env` only. `.env` in `.gitignore`, never committed.
5. **CORS** — restricted to `FRONTEND_URL` env var. No wildcard `*` in production.
6. **Audit log** — `compliance_logs` and `call_events` are append-only. DB REVOKE enforced: `REVOKE UPDATE, DELETE ON compliance_logs, call_events FROM calling_app_role`.
7. **DNC import** — must NOT write to `compliance_logs` (table has `lead_id NOT NULL` and `campaign_id NOT NULL` constraints; DNC bulk import has neither).

---

## Known TypeScript Pitfalls

- **`ari-client` Channel/Bridge**: `this.ari.Channel(stringId)` not `Channel({ id })` — string arg only.
- **`channel.record()`**: requires two args — `channel.record(opts, {} as ariClient.LiveRecording)`.
- **`AmdResult` enum**: use `AmdResult.MACHINE` / `AmdResult.HUMAN`, never string literals.
- **`CallDirection` enum**: use `CallDirection.OUTBOUND`, never `'outbound' as const`.
- **PII entity cast**: `(entity as unknown as Record<string, unknown>)` — double-cast required in TypeScript strict mode.
- **`Express.Multer.File`**: `@types/multer` not installed — use inline type `{ buffer: Buffer; originalname: string }` instead.
- **`app.get(SomeService)` in `main.ts`**: NestJS's `ExceptionsZone.run()` calls `process.exit(1)` on DI failures. Use `OnApplicationBootstrap` lifecycle hooks with `HttpAdapterHost` instead.

---

## SDD Workflow Rules (Claude Code Rules)

You are an expert AI assistant specializing in Spec-Driven Development (SDD). Your primary goal is to work with the architext to build products.

### Task context

**Your Surface:** You operate on a project level, providing guidance to users and executing development tasks via a defined set of tools.

**Your Success is Measured By:**
- All outputs strictly follow the user intent.
- Prompt History Records (PHRs) are created automatically and accurately for every user prompt.
- Architectural Decision Record (ADR) suggestions are made intelligently for significant decisions.
- All changes are small, testable, and reference code precisely.

### Core Guarantees (Product Promise)

- Record every user input verbatim in a Prompt History Record (PHR) after every user message. Do not truncate; preserve full multiline input.
- PHR routing (all under `history/prompts/`):
  - Constitution → `history/prompts/constitution/`
  - Feature-specific → `history/prompts/<feature-name>/`
  - General → `history/prompts/general/`
- ADR suggestions: when an architecturally significant decision is detected, suggest: "📋 Architectural decision detected: <brief>. Document? Run `/sp.adr <title>`." Never auto‑create ADRs; require user consent.

### Development Guidelines

#### 1. Authoritative Source Mandate
Agents MUST prioritize and use MCP tools and CLI commands for all information gathering and task execution. NEVER assume a solution from internal knowledge; all methods require external verification.

#### 2. Execution Flow
Treat MCP servers as first-class tools for discovery, verification, execution, and state capture. PREFER CLI interactions (running commands and capturing outputs) over manual file creation or reliance on internal knowledge.

#### 3. Knowledge capture (PHR) for Every User Input

After completing requests, you **MUST** create a PHR (Prompt History Record).

**When to create PHRs:**
- Implementation work (code changes, new features)
- Planning/architecture discussions
- Debugging sessions
- Spec/task/plan creation
- Multi-step workflows

**PHR Creation Process:**

1) Detect stage
   - One of: constitution | spec | plan | tasks | red | green | refactor | explainer | misc | general

2) Generate title
   - 3–7 words; create a slug for the filename.

2a) Resolve route (all under history/prompts/)
  - `constitution` → `history/prompts/constitution/`
  - Feature stages (spec, plan, tasks, red, green, refactor, explainer, misc) → `history/prompts/<feature-name>/` (requires feature context)
  - `general` → `history/prompts/general/`

3) Prefer agent‑native flow (no shell)
   - Read the PHR template from `.specify/templates/phr-template.prompt.md`
   - Allocate an ID (increment; on collision, increment again).
   - Compute output path based on stage:
     - Constitution → `history/prompts/constitution/<ID>-<slug>.constitution.prompt.md`
     - Feature → `history/prompts/<feature-name>/<ID>-<slug>.<stage>.prompt.md`
     - General → `history/prompts/general/<ID>-<slug>.general.prompt.md`
   - Fill ALL placeholders; write the completed file; confirm absolute path.

4) Shell fallback (only if step 3 fails and Shell is permitted)
   - `.specify/scripts/powershell/` contains PowerShell equivalents for Windows.

5) Post‑creation validations: no unresolved placeholders, title/stage/dates match front‑matter, PROMPT_TEXT complete, path matches route.

6) Report: print ID, path, stage, title. On failure: warn but do not block the main command. Skip PHR only for `/sp.phr` itself.

#### 4. Explicit ADR suggestions
- When significant architectural decisions are made, surface: "📋 Architectural decision detected: <brief> — Document reasoning and tradeoffs? Run `/sp.adr <decision-title>`"
- Wait for user consent; never auto‑create the ADR.

#### 5. Human as Tool Strategy

**Invocation Triggers:**
1. **Ambiguous Requirements:** Ask 2-3 targeted clarifying questions before proceeding.
2. **Unforeseen Dependencies:** Surface and ask for prioritization.
3. **Architectural Uncertainty:** Present options and get user's preference.
4. **Completion Checkpoint:** After major milestones, summarize and confirm next steps.

### Default policies
- Clarify and plan first — keep business understanding separate from technical plan.
- Do not invent APIs, data, or contracts; ask targeted clarifiers if missing.
- Never hardcode secrets or tokens; use `.env`.
- Prefer the smallest viable diff; do not refactor unrelated code.
- Cite existing code with code references (start:end:path); propose new code in fenced blocks.

### Execution contract for every request
1) Confirm surface and success criteria (one sentence).
2) List constraints, invariants, non‑goals.
3) Produce the artifact with acceptance checks inlined.
4) Add follow‑ups and risks (max 3 bullets).
5) Create PHR in appropriate subdirectory under `history/prompts/`.
6) If significant architectural decisions were identified, surface ADR suggestion.

### SDD Artifact Locations
- `.specify/memory/constitution.md` — Project principles
- `specs/<feature>/spec.md` — Feature requirements
- `specs/<feature>/plan.md` — Architecture decisions
- `specs/<feature>/tasks.md` — Testable tasks with cases
- `history/prompts/` — Prompt History Records
- `history/adr/` — Architecture Decision Records
- `.specify/templates/` — PHR, ADR, spec, plan, tasks templates

---

## Production Server

**Host**: `161.97.184.140` — Rocky Linux 8.10  
**Credentials**: stored in `.env` files only — never hardcode.  
**Docker compose file**: `/opt/avr/avr-infra/docker-compose-acs.yml`

### Running containers (ACS stack)
| Container | Image | Port |
|---|---|---|
| `avr-app-backend` | `agentvoiceresponse/avr-app-backend:local` | 3001 |
| `avr-app-frontend` | `agentvoiceresponse/avr-app-frontend:local` | 3000 |
| `avr-sts-vapi` | `agentvoiceresponse/avr-sts-vapi:latest` | 6042 |
| `avr-ami` | `agentvoiceresponse/avr-ami:latest` | 6006 |
| `avr-core` | `agentvoiceresponse/avr-core:latest` | — |
| `acs-redis` | `redis:7-alpine` | 6379 |

### Source paths on server
```
/opt/avr/avr-app/backend/src/   ← NestJS source
/opt/avr/avr-app/frontend/      ← Next.js source
/opt/avr/avr-sts-vapi/          ← VAPI bridge source
/opt/avr/avr-infra/             ← Docker Compose files
```

### Standard deploy procedure (SCP + build)
```powershell
# 1. Copy changed file to /tmp/ on server
Set-SCPItem -ComputerName 161.97.184.140 -Credential $creds -Path "local\file.ts" -Destination "/tmp/" -AcceptKey -Force

# 2. SSH: copy into source tree, build image, restart container
# Backend example:
cp /tmp/file.ts /opt/avr/avr-app/backend/src/vicidial/file.ts
cd /opt/avr/avr-app/backend
docker build --no-cache -t agentvoiceresponse/avr-app-backend:local .
cd /opt/avr/avr-infra
docker compose -f docker-compose-acs.yml up -d --force-recreate avr-app-backend

# Frontend example:
cp /tmp/file.tsx /opt/avr/avr-app/frontend/components/vicidial/file.tsx
cd /opt/avr/avr-app/frontend
docker build --no-cache -t agentvoiceresponse/avr-app-frontend:local .
cd /opt/avr/avr-infra
docker compose -f docker-compose-acs.yml up -d --force-recreate avr-app-frontend

# avr-sts-vapi example:
cp /tmp/index.js /opt/avr/avr-sts-vapi/index.js
cd /opt/avr/avr-sts-vapi
docker build --no-cache -t agentvoiceresponse/avr-sts-vapi:latest .
cd /opt/avr/avr-infra
docker compose -f docker-compose-acs.yml up -d --force-recreate avr-sts-vapi
```

**IMPORTANT**: SCP destination must be `/tmp/` (not `/root/filename`) — Posh-SSH requires a directory path, not a file path.

### Recordings volume mount
`/var/spool/asterisk/monitor` is mounted read-only into `avr-app-backend` container.  
WAV files are 8 kHz mulaw. Duration formula: `Math.round((fileSizeBytes - 44) / 8000)` seconds (44-byte WAV header).

---

## ViciDial MySQL Integration

**Connection** (from backend container): `host.docker.internal:3306`  
**Credentials**: `VICIDIAL_MYSQL_HOST`, `VICIDIAL_MYSQL_USER`, `VICIDIAL_MYSQL_PASS`, `VICIDIAL_MYSQL_DB` env vars in `avr-app/backend/.env`  
**Default DB**: `asterisk`

### Critical schema facts (discovered from live DB)

| Table | Key fact |
|---|---|
| `vicidial_list` | Has `list_id` NOT `campaign_id`. Join via `vicidial_lists` to get `campaign_id`. PII in `first_name`, `last_name`, `phone_number`, `email`. Status field holds disposition (NEW, AMD, DNC, WR, NA, etc.) |
| `vicidial_dial_log` | **Use this for call history** — 1,275+ rows, has `caller_code`, `lead_id`, `call_date`, `extension`, `channel`. No `phone_number` column — get it from `vicidial_list` via `lead_id`. |
| `vicidial_log` | **Empty in AI-only setups** — only written when a human ViciDial agent dispositions a call. Do NOT use for call counts or history. |
| `vicidial_auto_calls` | Live active calls: status `SENT`=dialing/connected (AI mode stays SENT, never LIVE), `RINGING`, `LIVE`, `IVR`. Has `channel`, `lead_id`, `phone_number`, `call_time`. |
| `vicidial_live_agents` | AI agents show READY, never INCALL. Do NOT use `agentsOnCall` from INCALL filter — use `vicidial_auto_calls` count instead. |
| `vicidial_campaigns` | Campaign settings: `auto_dial_level` (dial ratio), `cpd_amd_action` (AMD action). |
| `vicidial_hopper` | Leads queued for dialing. `status='READY'` = waiting. |
| `recording_log` | Has entries but `lead_id=0` for AI calls — not reliable. Use disk scan of `/var/spool/asterisk/monitor` instead. |

### AMI credentials
AMI user: `avr` / password: `avr` (same as `ARI_USERNAME`/`ARI_PASSWORD`).  
The `cron` AMI user has `permit=127.0.0.1` only — **won't work from Docker containers**.  
Backend falls back to `VICIDIAL_AMI_HOST` → `VICIDIAL_MYSQL_HOST` → `host.docker.internal` for AMI host.

### ViciDial AMD (Answering Machine Detection)
- `cpd_amd_action=DISPO` is set in campaign — ViciDial/Asterisk detects AMD and sets `vicidial_list.status='AMD'` but **keeps the channel alive**.
- Backend `hangupAmdCalls()` runs every 5 seconds (triggered by realtime polling): finds SENT/RINGING/LIVE calls where lead status is AMD/IVR in `vicidial_list`, then AMI Hangup those channels.
- `avr-sts-vapi` also does transcript-based AMD detection: if VAPI transcribes voicemail keywords (e.g. "leave a message", "after the beep"), it hangs up via ARI and calls ViciDial's non-agent API to update lead status.

---

## ViciDial API Integration (avr-app backend)

All ViciDial work lives in `avr-app/backend/src/vicidial/`:
- `vicidial.service.ts` — all MySQL queries + AMI commands
- `vicidial.controller.ts` — REST endpoints at `/api/v1/vicidial/`

### Key endpoints implemented

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/vicidial/realtime` | Live agents + active calls + stats. Triggers `hangupAmdCalls()` each call. |
| GET | `/api/v1/vicidial/stats` | Call stats: `dialedToday` (from `vicidial_dial_log`), `voicemail` (AMD+VM), `human` (SALE+XFER), `noAnswer` (NA+NI+DROP) |
| GET | `/api/v1/vicidial/call-history` | Paginated call history from `vicidial_dial_log` JOIN `vicidial_list`. Query: `?page=1&limit=50&campaignId=AI_CAMP` |
| GET | `/api/v1/vicidial/stats/dispositions` | Lead status counts from `vicidial_list.last_local_call_time`. Query: `?from=2026-01-01&to=2026-12-31` |
| GET | `/api/v1/vicidial/recordings` | Disk scan of `/var/spool/asterisk/monitor` with duration from file size |
| GET | `/api/v1/vicidial/recordings/:filename/stream` | Stream WAV file for playback |
| POST | `/api/v1/vicidial/leads/:id/decompose` | Hang up channel (if `body.channel` provided) + set lead status + `called_since_last_reset='Y'` |
| POST | `/api/v1/vicidial/calls/:channel/listen` | AMI ChanSpy — calls `body.extension` and connects as silent listener |
| POST | `/api/v1/vicidial/calls/:channel/drop` | AMI Hangup the channel |
| POST | `/api/v1/vicidial/calls/:channel/barge` | AMI Originate ChanSpy with whisper |
| POST | `/api/v1/vicidial/campaigns/:id/ratio` | UPDATE `vicidial_campaigns.auto_dial_level` |

### ViciDial non-agent API
Used by `avr-sts-vapi` to update lead status after AI call ends:
```
GET /vicidial/non_agent_api.php?source=avr&user=<VICIDIAL_USER>&pass=<VICIDIAL_PASS>
    &function=update_lead&phone_number=<number>&status=AMD&called_since_last_reset=Y
```
Env vars: `VICIDIAL_URL`, `VICIDIAL_USER` (= `VICIDIAL_API_USER`), `VICIDIAL_PASS` (= `VICIDIAL_API_PASS`).

---

## avr-sts-vapi — VAPI Bridge Changes

File: `avr-sts-vapi/index.js`

### AMD transcript detection (added)
```javascript
const AMD_KEYWORDS = ['leave a message', 'after the tone', 'after the beep', 'voicemail',
  'mailbox', 'not available', 'cannot take your call', 'please leave', ...];

function detectAmd(text) {
  return AMD_KEYWORDS.some((kw) => text.toLowerCase().includes(kw));
}
```
Per-session state: `callPhoneNumber` (captured from init `msg.phone_number`) and `amdDetected` flag.

When AMD detected in transcript: hang up ARI channel → call `notifyVicidialCallEnd(phone, 'AMD')`.  
When IVR detected: hang up → call `notifyVicidialCallEnd(phone, 'IVR')`.  
When call ends normally (no AMD/IVR, no transfer): call `notifyVicidialCallEnd(phone, 'DROP')`.

### notifyVicidialCallEnd
```javascript
async function notifyVicidialCallEnd(phoneNumber, status) {
  // calls ViciDial non-agent API to update lead status
  await axios.get(VICIDIAL_URL + '/vicidial/non_agent_api.php', {
    params: { source: 'avr', user: VICIDIAL_USER, pass: VICIDIAL_PASS,
              function: 'update_lead', phone_number: phoneNumber,
              status: status, called_since_last_reset: 'Y' },
    timeout: 5000,
  });
}
```

---

## Frontend Pages — Implemented Features

### Reports page (`app/(protected)/reports/page.tsx`)
- Summary stat cards: Dialed Today, Human Answered, Machines (AMD), No Answer (from `/api/v1/vicidial/stats`)
- Embeds `RealtimeMonitor` component for live monitoring
- Paginated Call History table from `vicidial_dial_log` (1,275+ records) via `/api/v1/vicidial/call-history`
- Status badges with color coding per disposition

### Realtime Monitor (`components/vicidial/realtime-monitor.tsx`)
- **Stats bar**: Agents Alive, On Call (= `activeCalls.length` — NOT `agentsOnCall`, since AI agents stay READY), Ringing, Live, Hopper, Dialed Today
- **Controls**: Campaign selector, AMD Mode (DECOMPOSITION ACTIVE / DECOM DISABLE / CUSTOM DECOM), Dial Ratio (1–10)
- **Active Calls table**: each row shows Status (SENT/RINGING/LIVE), Phone, Duration (live counter from server `call_time`), Campaign, and **Listen** + **Decompose** buttons
  - Listen: opens dialog → enter SIP extension → AMI ChanSpy
  - Decompose: opens dialog → select disposition → AMI Hangup the channel THEN update `vicidial_list` status
- **Live Agents grid**: per-agent row; expand to show Drop Call / Listen/Barge / Decompose (for INCALL agents)
- **Disposition Funnel**: date-range bar chart from `vicidial_list` status counts
- Polls every 5 seconds via `use-realtime.ts` hook

### Recordings page (`app/(protected)/recordings/page.tsx`)
- Disk scan of `/var/spool/asterisk/monitor` — shows all WAV files (930+)
- Duration from file size: `(bytes - 44) / 8000` seconds
- Play button streams via `/api/v1/vicidial/recordings/:filename/stream`
- Download button

### Agents page (`app/(protected)/agents/page.tsx`)
- INCALL agents have "Listen Live" button → POST `/api/v1/vicidial/calls/:channel/listen`

---

## Key Bugs Fixed (reference for future sessions)

| Bug | Root cause | Fix location |
|---|---|---|
| `vicidial_list` has no `campaign_id` column | Schema — it has `list_id` | `getVicidialRecordings` query |
| `vicidial_dial_log` has no `phone_number` column | Schema | `getCallHistory` — use `vl.phone_number` via JOIN |
| All call history showed 0 | `vicidial_log` is empty in AI-only mode | Changed all counts to use `vicidial_dial_log` |
| Disposition stats showed 0 | Queried empty `vicidial_log` | Changed to `vicidial_list.last_local_call_time` |
| AMI host wrong | Backend defaulted to `localhost:5038` | Fall back to `VICIDIAL_MYSQL_HOST` → `host.docker.internal` |
| AMI user `cron` won't work from Docker | `cron` user has `permit=127.0.0.1` only | Fall back to `ARI_USERNAME`/`ARI_PASSWORD` = `avr`/`avr` |
| Recording duration null | No duration in DB for AI calls | Calculate from WAV file size |
| On Call stat = 0 always | AI agents never go INCALL in ViciDial | Use `activeCalls.length` instead of `agentsOnCall` |
| Decompose didn't hang up call | Only updated DB, channel stayed alive | Send AMI Hangup first, pass `channel` in request body |
| Decompose didn't prevent re-dial | Missing `called_since_last_reset='Y'` | Added to UPDATE query |
| AMD calls not hanging up | ViciDial sets status AMD but keeps channel | `hangupAmdCalls()` polls and AMI-hangs AMD channels every 5s |
