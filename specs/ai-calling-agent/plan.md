# Implementation Plan: AI Calling Agent System (ACS)

**Branch**: `fix/vercel-static-deploy` | **Date**: 2026-06-09
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

---

## Summary

Build an outbound AI calling system where ViciDial initiates calls, routes answered calls to VAPI via SIP trunk for AI conversation, and the ACS backend coordinates call control (voicemail hang-up, IVR detection, 3-way transfer) via the Asterisk Manager Interface using the `avr-ami` library. A fully custom Next.js + NestJS webapp (the `avr-app` codebase) provides the operator dashboard.

---

## Technical Context

**Language/Version**: Node.js 20 LTS (backend), TypeScript 5.x (both layers)
**Primary Dependencies**:
- Backend: NestJS 11, TypeORM, `@nestjs/passport` + `passport-jwt`, `ari-client` (ARI), `avr-ami` (AMI client), Dockerode, bcrypt, class-validator
- Frontend: Next.js 16, React 19, Tailwind CSS v4, shadcn/ui (Radix primitives), `react-hook-form` + `zod`, Framer Motion, `next-runtime-env`

**Storage**: SQLite via TypeORM (`data/data.db`); `synchronize: true` in dev; indexed on `call_id`, `created_at`, `campaign_id`
**Testing**: Jest + Supertest (backend), Vitest + Testing Library (frontend)
**Target Platform**: Windows (Docker Desktop) / Linux server (Docker container) + browser (Chrome/Firefox latest)
**Project Type**: Web application — `avr-app/backend/` (NestJS) + `avr-app/frontend/` (Next.js); no root workspace
**Performance Goals**: ≤1,500ms AI voice turn latency p95; ≤300ms API response p95 under 20 concurrent users
**Constraints**: 10 concurrent AI-driven calls max; no inbound call processing; 8-hour JWT expiry; secrets in env only
**Scale/Scope**: ~100 calls/day initially; 1M+ call log rows long-term; single operator

---

## Constitution Check

*Constitution is not yet filled in for this project (template placeholders present). Applying generic SDD principles as defaults.*

| Gate | Status | Notes |
|------|--------|-------|
| Secrets in env, not code | ✅ PASS | All credentials use `.env`; `.env.example` provided |
| No inbound call recording | ✅ PASS | `direction = 'outbound'` enforced at insert; inbound rejected |
| Smallest viable change | ✅ PASS | AVR: only `avr-ami` included (no unused repos) |
| Testable requirements | ✅ PASS | 35 test cases in spec.md, all linked to FRs |
| No hardcoded API contracts | ✅ PASS | OpenAPI spec defines all endpoints |
| AMD/IVR pre-VAPI | ✅ PASS | AMD at ViciDial layer; IVR classifier on VAPI first transcript |

**No gate violations. Proceed.**

---

## Project Structure

### Documentation (this feature)

```text
specs/ai-calling-agent/
├── spec.md           ✅ created
├── plan.md           ✅ this file
├── research.md       ✅ created (Phase 0)
├── data-model.md     ✅ created (Phase 1)
├── quickstart.md     ✅ created (Phase 1)
├── contracts/
│   ├── openapi.yaml  ✅ created (Phase 1)
│   └── websocket.md  ✅ created (Phase 1)
└── tasks.md          ⬜ Phase 2 output (/sp.tasks)
```

### Source Code (repository root)

```text
avr-app/backend/                  # NestJS 11 app (port 3001)
├── src/
│   ├── main.ts                   # NestJS bootstrap; global ValidationPipe; port 3001
│   ├── app.module.ts             # Root module; TypeOrmModule (SQLite data/data.db)
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts       # Login, JWT sign, admin auto-seed from env vars
│   │   ├── jwt.strategy.ts       # passport-jwt strategy
│   │   └── jwt-auth.guard.ts     # JwtAuthGuard (applied globally via APP_GUARD)
│   ├── agents/
│   │   ├── agents.module.ts
│   │   ├── agents.service.ts     # Agent lifecycle; Docker container launch; AMD passthrough to ViciDial
│   │   └── agent.entity.ts
│   ├── calls/
│   │   ├── calls.service.ts      # Call state machine, disposition logic
│   │   └── call.entity.ts
│   ├── providers/                # VAPI/ASR/TTS provider configs
│   ├── docker/                   # Dockerode container management
│   ├── phones/                   # Browser softphone (avr-phone) sessions
│   ├── numbers/                  # Caller ID number management
│   ├── trunks/                   # SIP trunk config
│   ├── webhooks/                 # POST /webhooks/vapi — VAPI event ingestion
│   ├── recordings/               # Call recording retrieval
│   └── common/
│       └── filters/
│           └── http-exception.filter.ts  # TypeORM/validation → HTTP status mapping
├── test/                         # Jest integration tests (jest-e2e.json)
└── package.json

avr-app/frontend/                 # Next.js 16 app (port 3000)
├── app/
│   ├── layout.tsx                # Root layout
│   ├── (auth)/login/page.tsx     # Login page
│   ├── (protected)/              # Auth-gated route group
│   │   ├── layout.tsx            # JWT validation on mount; redirect to /login
│   │   ├── agents/               # Agent config pages
│   │   ├── calls/                # Call log + detail views
│   │   ├── overview/             # Live call board + metrics
│   │   ├── phones/               # Softphone sessions
│   │   ├── providers/            # Provider management
│   │   ├── recordings/           # Recording playback
│   │   ├── trunks/               # Trunk management
│   │   └── users/                # User management
│   └── middleware.ts             # Unauthenticated request redirect
├── src/
│   ├── lib/
│   │   └── api-client.ts         # Axios; NEXT_PUBLIC_API_URL via next-runtime-env; JWT interceptor
│   └── components/               # shadcn/ui + custom components
└── package.json

avr-sts-vapi/                     # Speech-to-Speech VAPI connector (WS port 6042)
├── index.js                      # WebSocket server; VAPI call management; conf_newcall transfer
└── .env                          # VAPI_PRIVATE_KEY, VICIDIAL_URL, VICIDIAL_AGENT_USER, …
```

---

## Complexity Tracking

No constitution violations. No complexity justification required.

---

## Phase 0 — Research (COMPLETED)

All open questions resolved. See [research.md](./research.md).

| OQ | Resolution Summary |
|----|--------------------|
| OQ-1 (AVR repos) | Use `avr-ami` for AMI call control. SIP Trunk for audio — no custom audio bridge needed. |
| OQ-2 (AMD source) | ViciDial native AMD at dialplan level. |
| OQ-3 (IVR detection) | Regex/keyword classifier on first VAPI transcript turn → AMI hang-up. |
| OQ-4 (LLM provider) | Configurable per campaign via VAPI; default `gpt-4o-mini`. |
| OQ-5 (verifier endpoint) | PSTN phone number stored in campaign config; ViciDial `conf_newcall` API dials it into the existing ViciDial-managed conference. |

---

## Phase 1 — Design (COMPLETED)

### Artifacts Produced

| Artifact | Path | Purpose |
|----------|------|---------|
| Data Model | `specs/ai-calling-agent/data-model.md` | 6 entities, state machines, indexes |
| OpenAPI Contract | `specs/ai-calling-agent/contracts/openapi.yaml` | All REST endpoints, schemas, auth |
| WebSocket Contract | `specs/ai-calling-agent/contracts/websocket.md` | WS message formats + VAPI tool call |
| Quickstart | `specs/ai-calling-agent/quickstart.md` | Dev setup, ViciDial config, VAPI config |

### Key Architecture Decisions

#### AD-1: SIP Trunk over AudioSocket for VAPI audio
**Chosen:** ViciDial → VAPI via SIP Trunk (PSTN RTP).
**Rejected:** Asterisk AudioSocket + VAPI WebSocket (requires 8kHz→16kHz transcoding; undocumented by VAPI; fragile in production).
**Rationale:** SIP is the standard telephony path; VAPI documents it; ViciDial supports it natively; no codec bridging code to maintain.

📋 Architectural decision detected: SIP Trunk vs AudioSocket for ViciDial-VAPI audio path — Document reasoning and tradeoffs? Run `/sp.adr sip-trunk-vs-audiosocket`

#### AD-2: avr-ami only (not avr-infra)
**Chosen:** Single AVR repo: `avr-ami` for AMI call control (hang-up, originate, ConfBridge).
**Rejected:** `avr-infra` (AudioSocket path, not needed for SIP). All other 43 AVR repos excluded.
**Rationale:** NFR-9 requires only necessary repos. SIP path eliminates `avr-infra` dependency.

📋 Architectural decision detected: AVR repo selection (avr-ami only vs broader AVR stack) — Document? Run `/sp.adr avr-repo-selection`

#### AD-3: IVR detection via transcript keyword classifier (not audio-level)
**Chosen:** First VAPI transcript turn is checked against IVR keyword list. If matched, AMI hang-up fired.
**Rejected:** Audio-level Asterisk AMD for IVR (AMD only reliably detects voicemail, not IVR menus).
**Rationale:** Zero additional infrastructure cost; leverages VAPI transcription already paid for; accurate enough for common IVR patterns ("press 1", "para español", "your call is important").

#### AD-4: ViciDial `conf_newcall` API for 3-way transfer
**Chosen:** When VAPI fires a `transferCall` tool call, `avr-sts-vapi` calls `non_agent_api.php?function=agent_status` to retrieve the agent's `conf_exten` session ID, then calls `agc/api.php?action=conf_newcall&session_id=…&phone_number=…` to add the verifier into ViciDial's native conference. ViciDial manages the bridge; VAPI SIP leg exits.
**Rejected:** Asterisk AMI ConfBridge (requires ACS to own and manage a separate ConfBridge room, coordinate channel redirect for the prospect leg, and originate the verifier — all while ViciDial still holds the agent session separately). SIP REFER (blind transfer — loses in-call context).
**Rationale:** ViciDial already holds the agent session and owns the call's conference slot. Using ViciDial's own `conf_newcall` API adds the verifier directly into that slot with a single HTTP call, with no need to interact with Asterisk AMI at all. This eliminates ACS-side conference state management and keeps all conference control inside ViciDial where the agent session lives.

---

## Constitution Check (Post-Design)

| Gate | Status | Notes |
|------|--------|-------|
| All FRs have contracts | ✅ PASS | openapi.yaml covers all Must/Should FRs |
| WebSocket message shapes defined | ✅ PASS | websocket.md covers both WS endpoints |
| Data model covers all entities | ✅ PASS | 6 entities; all FRs traceable |
| AMD/IVR pre-VAPI confirmed | ✅ PASS | AMD at ViciDial; IVR at first transcript |
| No inbound call storage | ✅ PASS | `direction='outbound'` enforced; `calls` insert rejects inbound |
| Secrets handling | ✅ PASS | `.env.example` defines all; no defaults with real values |

---

## Follow-ups & Risks

1. **ViciDial `conf_newcall` API validation (Medium risk):** AD-4 requires that the ViciDial instance has API access enabled for the agent user (`Agent API Access: 1` in ViciDial admin) and that `agc/api.php` is reachable from the `avr-sts-vapi` container. Validate with a live ViciDial instance before production use (see T-5.4).

2. **VAPI SIP Trunk codec compatibility (Low risk):** VAPI's SIP trunk page does not list supported codecs explicitly. Default G.711 μ-law should work; verify in T-5.1.

3. **IVR classifier false positives (Medium risk):** Keyword-based IVR detection may incorrectly hang up on a human who says "press 1" in context (rare). Monitor disposition data; add phrase-context filtering if needed.

---

## Next Steps

Run `/sp.tasks` to generate the detailed, dependency-ordered `tasks.md` for implementation.
