# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

The **Agentic Calling System (ACS)** is an outbound AI-powered voice calling platform. It integrates:
- **ViciDial** — outbound call dialer and session manager
- **VAPI** — AI voice layer (STT, TTS, LLM)
- **AVR (Agent Voice Response)** — bridge/router between ViciDial and VAPI
- **avr-app** — custom admin webapp (this repo's primary app)

## Repository Layout

```
avr-app/            Admin panel: NestJS backend + Next.js frontend
avr-infra/          Docker Compose stacks for deploying the full AVR pipeline
avr-asr-*/          ASR (speech-to-text) service connectors
avr-llm-*/          LLM service connectors
avr-tts-*/          TTS (text-to-speech) service connectors
avr-sts-*/          Speech-to-Speech (combined) service connectors
avr-ami/            Asterisk Manager Interface bridge
avr-asterisk/       Asterisk PBX container config
avr-vad/            Voice Activity Detection
avr-resampler/      Audio resampler
avr-webhook/        Webhook forwarder
avr-phone/          Browser-based softphone (avr-phone)
avr-docs-mcp/       MCP server exposing AVR documentation
TTS/                Custom MOSS TTS model artifacts
spec-kit-plus/      SDD tooling and docs (submodule/copy)
specs/ai-calling-agent/  Feature specs, plan, tasks, contracts
.specify/           SpecKit Plus local templates and scripts
history/prompts/    Prompt History Records (PHRs)
history/adr/        Architecture Decision Records
```

## Development Commands

All commands run from their respective subdirectory — **there is no root-level workspace**.

### avr-app/backend (NestJS, port 3001)

```bash
cd avr-app/backend
npm install
npm run start:dev      # watch mode
npm run build          # compile to dist/
npm run lint           # ESLint
npm test               # jest unit tests
npm run test:cov       # coverage
npm run test:e2e       # e2e (test/jest-e2e.json)
```

Run a single test file:
```bash
npx jest src/agents/agents.service.spec.ts
```

### avr-app/frontend (Next.js 16 + React 19, port 3000)

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

### Local verification before pushing

```bash
cd avr-app/backend && npm run lint && npm test
cd avr-app/frontend && npm run lint && npm run build
```

CI runs `backend-quality-gate.yml` (lint + unit) and `frontend-quality-gate.yml` (lint + build) on PRs.

### AVR infrastructure (Docker)

```bash
cd avr-infra
cp .env.example .env          # fill in API keys
docker-compose -f docker-compose-openai.yml up -d   # example stack
```

Each `docker-compose-<provider>.yml` bundles Asterisk + avr-core + a specific ASR/LLM/TTS combination. See `avr-infra/README.md` for the full provider matrix.

## Architecture

### avr-app Backend (NestJS)

- **Framework**: NestJS 11 with TypeORM + SQLite (`/app/data/data.db`); `synchronize: true` in dev
- **Auth**: JWT via `passport-jwt`; tokens expire in 8 h
- **Docker management**: `DockerModule` wraps `dockerode` to start/stop AVR service containers per agent
- **Asterisk integration**: `AsteriskService` uses `ari-client` (ARI) and `avr-ami` for call control
- **Key modules**: `Auth`, `Users`, `Providers`, `Agents`, `Docker`, `Phones`, `Numbers`, `Trunks`, `Webhooks`, `Recordings`
- **Agent lifecycle**: `agent-lifecycle.ts` enforces valid status transitions; `AgentsService` assembles provider env-vars and launches the correct Docker image per agent

### avr-app Frontend (Next.js)

- **Router**: Next.js App Router; `app/(auth)/` for login, `app/(protected)/` for all authenticated views
- **Protected sections**: `agents`, `calls`, `dockers`, `numbers`, `overview`, `phones`, `providers`, `recordings`, `trunks`, `users`
- **UI**: Tailwind CSS v4 + shadcn/ui (Radix primitives); component registry in `components.json`
- **Forms**: `react-hook-form` + `zod`
- **Testing**: Vitest + Testing Library (config: `vitest.config.ts`)

### AVR Pipeline (audio flow)

```
Asterisk ──AudioSocket──► avr-core ──HTTP/WS──► avr-asr-* ──► avr-llm-* ──► avr-tts-* ──► avr-core ──► Asterisk
```
For Speech-to-Speech providers, `avr-sts-*` replaces all three steps via a single WebSocket connection (`STS_URL`).

Each avr-* service is a small Node.js package exposing a streaming HTTP or WebSocket endpoint. URLs are wired together via env vars: `ASR_URL`, `LLM_URL`, `TTS_URL` (or `STS_URL`).

### Key Environment Variables (avr-app/backend)

See `avr-app/backend/.env.example`. Critical vars:
- `JWT_SECRET` — signing key for auth tokens
- `CORE_DEFAULT_IMAGE` — Docker image used when launching agent containers (default: `agentvoiceresponse/avr-core:latest`)
- `ARI_URL`, `ARI_USERNAME`, `ARI_PASSWORD` — Asterisk REST Interface
- `AMI_URL` — Asterisk Manager Interface bridge

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
- `.specify/memory/constitution.md` — Project principles (template; fill in for this project)
- `specs/<feature>/spec.md` — Feature requirements
- `specs/<feature>/plan.md` — Architecture decisions
- `specs/<feature>/tasks.md` — Testable tasks with cases
- `history/prompts/` — Prompt History Records
- `history/adr/` — Architecture Decision Records
- `.specify/templates/` — PHR, ADR, spec, plan, tasks templates
