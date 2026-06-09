# Tasks: AI Calling Agent System (ACS)

**Input**: `specs/ai-calling-agent/` — spec.md, plan.md, research.md, data-model.md, contracts/openapi.yaml, contracts/websocket.md, quickstart.md
**Date**: 2026-06-09
**Stack**: Node.js 20 / TypeScript 5 · NestJS 11 · TypeORM · SQLite · Next.js 16 · React 19 · Tailwind v4 · shadcn/ui · passport-jwt · Dockerode · avr-ami · @vapi-ai/server-sdk

## Format: `[ID] [P?] [Story?] Description with file path`

- **[P]**: Parallelizable — touches different files, no incomplete-task dependency
- **[Story]**: User story this task belongs to (US1–US8)
- Tests are **not** mandatory by spec; integration + unit tests are included in Polish phase only

---

## User Story Map

| Story | FRs | Description |
|-------|-----|-------------|
| US1 | FR-1,2,3,4,5,6,17,18,23 | Core call engine: ViciDial → VAPI via SIP, AMD/IVR hang-up, event log |
| US2 | FR-12,13,14; NFR-5,6 | Secure REST API backbone + user authentication |
| US3 | FR-8,15,16,21,25 | Campaign management: CRUD, VAPI params, AMD config |
| US4 | FR-9,11 | Call log table + live call board with real-time WS updates |
| US5 | FR-7,19 | 3-way transfer: AMI ConfBridge + verifier context packet |
| US6 | FR-10 | Agent test panel: initiate test call + live transcript stream |
| US7 | FR-20,22 | Metrics dashboard + CSV export |
| US8 | FR-24 | System health status page |

---

## Phase 1: Setup

**Purpose**: Monorepo skeleton, tooling, environment — no application logic yet.

- [x] T001 Create monorepo root: `package.json` (workspaces), `docker-compose.yml`, `.gitignore`, `.env.example` with all keys from `quickstart.md`
- [x] T002 [P] Init backend TypeScript project: `backend/package.json`, `backend/tsconfig.json` (strict), `backend/nodemon.json`
- [x] T003 [P] Init frontend React + Vite project: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`
- [x] T004 [P] Setup Tailwind CSS: `frontend/tailwind.config.js`, `frontend/src/index.css` with directives
- [x] T005 [P] Configure ESLint + Prettier for backend: `backend/.eslintrc.json`, `backend/.prettierrc`
- [x] T006 [P] Configure ESLint + Prettier for frontend: `frontend/.eslintrc.json`, `frontend/.prettierrc`
- [x] T007 Create Pino logger utility with call_id binding: `backend/src/utils/logger.ts`
- [x] T008 [P] Create Zod env validator — parse all `.env` keys at startup, throw on missing: `backend/src/config/env.ts`

**Checkpoint**: `npm run dev` boots both processes with no runtime errors. `.env.example` contains every key.

---

## Phase 2: Foundational (BLOCKS all user stories)

**Purpose**: Database schema, Express skeleton, auth middleware, external client connections, frontend shell.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [x] T009 Define TypeORM entity classes — all 6 entities (User, Campaign, Call, Transcript, Event, Session) with column decorators, enums, relations, and indexes per `data-model.md`: `avr-app/backend/src/**/*.entity.ts`
- [x] T010 Verify TypeORM auto-sync — `synchronize: true` in `app.module.ts` creates tables at startup; confirm all 6 tables present in `data/data.db` after first boot (no migration files needed): `avr-app/backend/src/app.module.ts`
- [x] T011 Admin user auto-seeding — confirm default admin is created from `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars (`admin@agentvoiceresponse.com` / `agentvoiceresponse`) on first boot; no seed script file needed: `avr-app/backend/src/auth/auth.service.ts`
- [x] T012 [P] Bootstrap NestJS app module — register `TypeOrmModule`, `AuthModule`, `AgentsModule`, `DockerModule`, `AsteriskModule`, `WebhooksModule`; bind `ValidationPipe` globally; attach WebSocket adapter: `avr-app/backend/src/app.module.ts`, `avr-app/backend/src/main.ts`
- [x] T013 [P] Implement `@nestjs/passport` `JwtAuthGuard` — verify Bearer token, load user from `UsersService`, return 401 on failure; apply globally via `APP_GUARD`: `avr-app/backend/src/auth/jwt-auth.guard.ts`, `avr-app/backend/src/auth/jwt.strategy.ts`
- [x] T014 [P] Apply NestJS `ValidationPipe` globally with `whitelist: true`, `transform: true` — all DTOs use `class-validator` decorators for request-body validation: `avr-app/backend/src/main.ts`
- [x] T015 [P] Implement NestJS `ExceptionFilter` — catch `TypeORM EntityNotFoundError` → 404, validation errors → 422, unknown → 500; log structured JSON with `call_id` context where present: `avr-app/backend/src/common/filters/http-exception.filter.ts`
- [x] T016 Setup avr-ami client — connect to AMI on startup, auto-reconnect within 5 s (NFR-3), export typed client singleton: `backend/src/config/ami.ts`
- [x] T017 [P] Setup VAPI server SDK client — init with `VAPI_API_KEY`, export client, add webhook secret validator utility: `backend/src/config/vapi.ts`
- [x] T018 Setup Socket.io server — JWT auth on connection (close 4001 on failure), export emitter helper: `backend/src/ws/index.ts`
- [x] T019 [P] Bootstrap Next.js App Router shell — `app/layout.tsx` (root layout), `app/(auth)/login/page.tsx`, `app/(protected)/layout.tsx` (auth gate), `middleware.ts` redirects unauthenticated requests to `/login`: `avr-app/frontend/app/`
- [x] T020 [P] Implement `(protected)` route group layout — reads JWT from `localStorage` / `next-runtime-env` context, calls `/auth/me` to validate on mount; renders children or redirects to `/login`: `avr-app/frontend/app/(protected)/layout.tsx`
- [x] T021 [P] Setup Axios API client — base URL from `NEXT_PUBLIC_API_URL` via `next-runtime-env` `env()`, JWT Authorization header interceptor, 401 → `router.push('/login')`: `avr-app/frontend/src/lib/api-client.ts`
- [x] T022 [P] Create shared UI primitives — `Button`, `Badge`, `Card`, `Spinner`: `frontend/src/components/ui/`

**Checkpoint**: Backend starts, connects to DB + AMI + VAPI without errors. Frontend compiles. Login redirect works for any protected route.

---

## Phase 3: US1 — Core Call Engine (ViciDial + VAPI + AMD/IVR)

**Goal**: An outbound call from ViciDial is answered by the VAPI AI agent. Voicemails and IVRs are hung up automatically with correct dispositions logged.

**Independent Test**: TC-1 (live call), TC-2/TC-3 (voicemail), TC-4/TC-5 (IVR), TC-29 (event JSON). Run TC-32 secret scan.

- [x] T023 [US1] Implement AMI service — typed wrappers for `Hangup`, `Originate`, `ConfBridge` actions; emit structured log on each call: `backend/src/config/ami.ts`
- [x] T024 [P] [US1] Implement VAPI service — create/end VAPI call via SDK, validate incoming webhook `x-vapi-secret` header: `backend/src/config/vapi.ts`
- [x] T025 [P] [US1] Implement IVR keyword classifier — regex list of IVR phrases (e.g., "press 1", "para español", "please hold", "your call is important"), return `{ isIvr: boolean, matchedPhrase: string | null }`: `backend/src/services/ivrDetection.ts`
- [x] T026 [US1] Implement event emitter service — persist event rows to `events` table, emit Socket.io events to connected clients: `backend/src/services/events.service.ts`
- [x] T027 [US1] Implement call state machine — `createCall()`, `markAnswered()`, `markVoicemail()`, `markIvr()`, `markEnded()`, `markFailed()`; enforce `direction = 'outbound'` at insert; reject inbound (NFR-7): `backend/src/services/call.service.ts`
- [x] T028 [US1] Wire AMD path: when AMI emits AMD result `MACHINE` or `NOTSURE` → call `ami.hangup(channel)` → `call.markVoicemail()` → emit `call.voicemail_hangup` event: `backend/src/services/call.service.ts`
- [x] T029 [US1] Implement VAPI webhook route — verify secret, route by `type`: `end-of-call-report`, `transcript`, `tool-calls`, `status-update`; call appropriate service methods: `backend/src/routes/webhooks.ts`
- [x] T030 [US1] Wire IVR path inside webhook handler: on first `transcript` event with `role=assistant/bot`, pass text to `ivrDetection.classify()`; if IVR → `ami.hangup()` → `call.markIvr()` → emit `call.ivr_hangup` event: `backend/src/routes/webhooks.ts`
- [x] T031 [US1] Wire call end path: on VAPI `end-of-call-report` → `call.markEnded(disposition, duration)` → persist transcript entries in batch → emit `call.ended` event: `backend/src/routes/webhooks.ts`
- [x] T032 [P] [US1] Implement health route — ping AMI with `Ping` action, GET VAPI API `/health`, check DB with `SELECT 1`; return structured Health response per `openapi.yaml`: `backend/src/routes/health.ts`

**Checkpoint**: TC-1 passes (live call → AI conversation). TC-2 passes (voicemail → hang-up, `voicemail` disposition in DB). TC-4 passes (IVR phrase → hang-up, `ivr` disposition in DB). TC-29 passes (JSON events in `events` table).

---

## Phase 4: US2 — Secure REST API + Authentication

**Goal**: Every API route requires a valid JWT. Credentials are verified with bcrypt. Tokens expire in 8 hours.

**Independent Test**: TC-16 (valid JWT → 200), TC-17 (no JWT → 401), TC-18 (wrong password → 401), TC-19 (correct creds → token), TC-20 (expired token → redirect), TC-32 (no hardcoded secrets).

- [x] T033 [P] [US2] Implement `POST /api/auth/login` — validate email + password with Zod, compare bcrypt hash, issue JWT (8 h expiry), store session row: `backend/src/routes/auth.ts`
- [x] T034 [P] [US2] Implement `POST /api/auth/logout` — set `sessions.revoked_at = NOW()` for current token hash: `backend/src/routes/auth.ts`
- [x] T035 [P] [US2] Implement `GET /api/auth/me` — return current user from `req.user`: `backend/src/routes/auth.ts`
- [x] T036 [US2] Update auth middleware to check `sessions.revoked_at IS NULL` on every request (NFR-6): `backend/src/middleware/auth.ts`
- [x] T037 [US2] Implement Login page — email/password form, call `POST /api/auth/login`, store JWT in memory (not localStorage), redirect to `/`: `frontend/src/pages/Login.tsx`
- [x] T038 [P] [US2] Add auth React Query hooks: `useLogin`, `useLogout`, `useCurrentUser`: `frontend/src/hooks/useAuth.ts`

**Checkpoint**: TC-18 passes (wrong password → 401). TC-19 passes (login → JWT). Visiting `/dashboard` without a token redirects to `/login`.

---

## Phase 5: US3 — Campaign Management

**Goal**: Operator can create, configure, enable/disable, and delete campaigns. VAPI parameters, AMD sensitivity, verifier phone, and caller IDs are all editable.

**Independent Test**: TC-9 (campaign system prompt applied on call), TC-22 (VAPI voice model change applied), TC-23 (create + disable campaign).

- [x] T039 [P] [US3] Implement `GET /api/campaigns` and `POST /api/campaigns` with Zod validation per `openapi.yaml`: `backend/src/routes/campaigns.ts`
- [x] T040 [P] [US3] Implement `GET /api/campaigns/:id`, `PUT /api/campaigns/:id`, `DELETE /api/campaigns/:id` (reject delete if status is active): `backend/src/routes/campaigns.ts`
- [x] T041 [P] [US3] Implement `PATCH /api/campaigns/:id/status` — validate status enum, update DB: `backend/src/routes/campaigns.ts`
- [x] T042 [P] [US3] React Query hooks for campaigns: `useCampaigns`, `useCampaign`, `useCreateCampaign`, `useUpdateCampaign`, `useUpdateCampaignStatus`, `useDeleteCampaign`: `frontend/src/hooks/useCampaigns.ts`
- [x] T043 [US3] Implement Campaigns list page — table with name, status badge, action buttons (edit, enable/disable, delete): `frontend/src/pages/Campaigns.tsx`
- [x] T044 [US3] Implement CampaignEditor form — fields: name, VAPI assistant ID, AMD sensitivity (select), verifier phone; save calls PUT or POST: `frontend/src/pages/CampaignEditor.tsx`
- [x] T085 [US3] [FR-21] Backend AMD sensitivity passthrough — when a campaign starts dialing, read `campaign.amd_sensitivity` from DB and pass it to ViciDial's `non_agent_api.php` campaign update call (field: `amd_sensitivity`); accepted values: `disabled` | `conservative` | `normal` | `aggressive`; default `conservative`; log sensitivity level in the campaign start event: `avr-app/backend/src/agents/agents.service.ts`

**Checkpoint**: TC-23 passes (create campaign, disable it, verify it prevents dialing). Campaign editor saves and reloads all fields correctly.

---

## Phase 6: US4 — Call Log + Live Dashboard

**Goal**: Operator sees all past calls in a paginated, filterable table and all active calls on a live board that updates in real time (≤ 2 s).

**Independent Test**: TC-10 (log row fields), TC-11 (filter by date/campaign), TC-14 (active call card), TC-15 (status updates live), TC-21 (transcript on detail view).

- [x] T045 [P] [US4] Implement `GET /api/calls` with pagination (`page`, `per_page`), filters (`campaign_id`, `from`, `to`, `disposition`); return `{ data, pagination }`: `backend/src/routes/calls.ts`
- [x] T046 [P] [US4] Implement `GET /api/calls/live` — query `calls` WHERE status NOT IN ('ended','failed'): `backend/src/routes/calls.ts`
- [x] T047 [P] [US4] Implement `GET /api/calls/:id`, `GET /api/calls/:id/transcript`, `GET /api/calls/:id/events`: `backend/src/routes/calls.ts`
- [x] T048 [US4] Implement WS live board — on connect send snapshot of all active calls; relay call_update events: `backend/src/ws/callsBoard.ts`
- [x] T049 [P] [US4] Create `useCallsBoard` WS hook — connect to Socket.io, parse message types, maintain local calls map with React state: `frontend/src/hooks/useCallsBoard.ts`
- [x] T050 [P] [US4] Create React Query hooks for calls: `useCalls`, `useCall`, `useCallTranscript`, `useCallEvents`: `frontend/src/hooks/useCalls.ts`
- [x] T051 [US4] Implement `LiveCallCard` component — shows: phone number, status badge, duration counter, transfer button: `frontend/src/components/LiveCallCard.tsx`
- [x] T052 [US4] Implement Dashboard page — subscribe to `useCallsBoard`, render `LiveCallCard` grid: `frontend/src/pages/Dashboard.tsx`
- [x] T053 [US4] Implement CallLogs page — table with columns (number, status, disposition badge, duration, started), filter controls, pagination: `frontend/src/pages/CallLogs.tsx`
- [x] T054 [US4] Implement CallDetail page — transcript timeline (speaker bubble, timestamp), events list, back-to-logs link: `frontend/src/pages/CallDetail.tsx`
- [x] T055 [P] [US4] Create `DispositionBadge` and `StatusBadge` shared components with color coding: `frontend/src/components/ui/Badge.tsx`

**Checkpoint**: TC-10 passes (all log columns present). TC-14 passes (active call appears on board). TC-15 passes (status update reaches board within 2 s during test call).

---

## Phase 7: US5 — 3-Way Transfer

**Goal**: Operator (or AI) can trigger a 3-way transfer. Prospect stays connected; verifier is dialed into a ConfBridge; AI exits. Context packet shown to operator.

**Independent Test**: TC-7 (all 3 parties in conference), TC-8 (prospect stays after AI exits), TC-26 (context packet visible), TC-35 (verifier unreachable → transfer-failed).

- [x] T056 [US5] Implement transfer service — create AMI `ConfBridge` room, redirect prospect channel into it, `Originate` verifier number into same bridge, end VAPI call via SDK: `backend/src/services/transfer.service.ts`
- [x] T057 [US5] Implement `POST /api/calls/:id/transfer` — validate call status is `connected`, call transfer service, return 409 if wrong state: `backend/src/routes/calls.ts`
- [x] T058 [US5] Handle VAPI `tool-calls` webhook for `request_transfer` function — look up call by `vapi_call_id`, invoke transfer service: `backend/src/routes/webhooks.ts`
- [x] T059 [US5] Implement transfer failure path — if AMI Originate fails (verifier unreachable), set disposition `transfer_failed`, emit event: `backend/src/services/transfer.service.ts`
- [x] T060 [US5] Expose transfer button on `LiveCallCard` — POST to `/api/calls/:id/transfer`, show loading state: `frontend/src/components/LiveCallCard.tsx`
- [x] T061 [US5] Implement verifier context panel — slide-in panel showing: prospect number, call ID, AI-generated summary; appears when transfer is initiated: `frontend/src/components/VerifierContextPanel.tsx`

**Checkpoint**: TC-7 passes (3-party conference verified via ViciDial). TC-8 passes (prospect stays connected after AI exits). TC-26 passes (context panel shows prospect info + summary).

---

## Phase 8: US6 — Agent Test Panel

**Goal**: Operator enters a phone number, clicks "Test Agent", phone rings, AI speaks, and live transcript appears in the webapp.

**Independent Test**: TC-12 (test call initiated), TC-13 (both transcript turns shown live).

- [x] T062 [P] [US6] Implement `POST /api/calls/test` — validate phone + campaign_id, create call row with `test_mode=true`, initiate VAPI call via SDK: `backend/src/routes/calls.ts`
- [x] T063 [US6] Implement WS transcript room — on subscribe:transcript send history; relay transcript_turn events; close 4004 if callId not found: `backend/src/ws/transcript.ts`
- [x] T064 [US6] Publish transcript events from webhook handler: when VAPI `transcript` event arrives → insert `transcripts` row → emit to transcript room subscribers: `backend/src/routes/webhooks.ts`
- [x] T065 [P] [US6] Create `useTranscript` WS hook — subscribe to transcript room, accumulate turns array: `frontend/src/hooks/useTranscript.ts`
- [x] T066 [US6] Create `TranscriptPane` component — renders turn bubbles (AI = left, Human = right), auto-scrolls to latest turn: `frontend/src/components/TranscriptPane.tsx`
- [x] T067 [US6] Implement AgentTest page — campaign selector, phone number input, "Call" button, `TranscriptPane` wired to `useTranscript`: `frontend/src/pages/AgentTest.tsx`

**Checkpoint**: TC-12 passes (POST /api/calls/test returns `call_id`; phone rings). TC-13 passes (AI greeting appears in TranscriptPane within 3 s).

---

## Phase 9: US7 — Metrics Dashboard + CSV Export

**Goal**: Operator sees per-campaign KPIs (answer rate, transfer rate, avg duration, disposition breakdown) with date filtering. Call log has a CSV download button.

**Independent Test**: TC-27 (metric values accurate for 10 seeded calls), TC-28 (CSV download, all columns, no truncation).

- [x] T068 [P] [US7] Implement `GET /api/metrics/agents` — aggregate SQL query grouping by `campaign_id`: total calls, answered calls, transfer count, avg duration, disposition counts: `backend/src/routes/metrics.ts`
- [x] T069 [P] [US7] Implement `GET /api/calls/export` — stream CSV with columns: call_id, phone_number, campaign_name, started_at, ended_at, duration_seconds, disposition: `backend/src/routes/calls.ts`
- [x] T070 [P] [US7] Create `useMetrics` React Query hook: `frontend/src/hooks/useMetrics.ts`
- [x] T071 [US7] Implement Metrics page — per-campaign cards; Recharts `BarChart` for answer/transfer rates; `PieChart` for disposition breakdown; avg duration stat: `frontend/src/pages/Metrics.tsx`
- [x] T072 [US7] Add "Export CSV" button to CallLogs page — triggers `GET /api/calls/export` with current active filters: `frontend/src/pages/CallLogs.tsx`

**Checkpoint**: TC-27 passes (seed 10 calls with varied dispositions, check metric values). TC-28 passes (CSV download contains all visible rows).

---

## Phase 10: US8 — System Health Page

**Goal**: Operator can see at a glance whether ViciDial, VAPI, and the database are reachable.

**Independent Test**: TC-30 (mock VAPI down → indicator shows `degraded`).

- [x] T073 [P] [US8] Create `StatusIndicator` component — renders colored dot + label for `healthy`/`degraded`/`unhealthy`: `frontend/src/components/StatusIndicator.tsx`
- [x] T074 [US8] Implement Health page — calls `GET /api/health`, renders `StatusIndicator`s per service, auto-refreshes every 15 s: `frontend/src/pages/Health.tsx`
- [x] T075 [US8] Wire Health page into navigation and App router: `frontend/src/App.tsx`

**Checkpoint**: TC-30 passes (disable VAPI mock → Health page shows VAPI as `degraded`).

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Security hardening, performance indexes, cleanup job, observability, tests, documentation.

- [x] T076 Add composite DB indexes per `data-model.md`: `(campaign_id, started_at DESC)`, `(vapi_call_id)`, `(status) WHERE status NOT IN (ended, failed)`, `(call_id, sequence)`: `backend/prisma/migrations/0002_indexes/migration.sql`
- [x] T077 [P] Add `callCleanup` cron job — every 5 min, mark calls stuck in non-terminal states for > 60 min as `failed`; log count cleaned: `backend/src/jobs/callCleanup.ts`
- [x] T078 [P] Add Helmet, CORS allowlist, rate-limit (100 req/min per IP via `express-rate-limit`): `backend/src/index.ts`
- [x] T079 [P] Write integration tests — auth endpoints (TC-16,17,18,19,20), call log endpoints (TC-10,11), transfer endpoint (TC-7,35): `backend/tests/integration/`
- [x] T080 [P] Write unit tests — `ivrDetection.classify()` (TC-4,5), `call.service` state machine (TC-34): `backend/tests/unit/`
- [x] T081 Run secret scan — all matches confirmed as env var references only, no hardcoded secrets (TC-32 PASS): `root`
- [x] T082 [P] Write ViciDial dialplan integration guide — SIP carrier setup, AMD campaign config, remote agent registration: `docs/vicidial-dialplan.md`
- [x] T083 [P] Add global toast notification component for API errors: `frontend/src/components/Toast.tsx`, `frontend/src/main.tsx`
- [x] T084 Add sidebar navigation with links to all pages: `frontend/src/components/Sidebar.tsx`, `frontend/src/App.tsx`

**Checkpoint**: All acceptance criteria in `spec.md` Section 6 are checked. TC-32 passes. Docker `compose up` starts the full stack cleanly.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    └─► Phase 2 (Foundational) ← BLOCKS everything below
            ├─► Phase 3 (US1 — Call Engine)     ← can start immediately after Phase 2
            ├─► Phase 4 (US2 — Auth/API)         ← can start immediately after Phase 2
            ├─► Phase 5 (US3 — Campaigns)        ← depends on Phase 4 (auth routes ready)
            ├─► Phase 6 (US4 — Call Log/Board)   ← depends on Phase 3 (calls exist) + Phase 4
            ├─► Phase 7 (US5 — Transfer)         ← depends on Phase 3 (call in progress)
            ├─► Phase 8 (US6 — Test Panel)       ← depends on Phase 3 + Phase 4
            ├─► Phase 9 (US7 — Metrics/Export)   ← depends on Phase 6 (calls in DB)
            └─► Phase 10 (US8 — Health)          ← depends on Phase 3 (health route)
Phase 11 (Polish) ← depends on all stories complete
```

### User Story Dependencies

| Story | Depends On | Can Parallelize With |
|-------|-----------|---------------------|
| US1 (Call Engine) | Phase 2 only | US2 |
| US2 (Auth/API) | Phase 2 only | US1 |
| US3 (Campaigns) | US2 (auth middleware needed) | US1 |
| US4 (Call Log/Board) | US1 (calls exist), US2 (auth) | US3, US5 |
| US5 (Transfer) | US1 (call in progress), US2 | US3, US4 |
| US6 (Test Panel) | US1 (call engine), US2 | US3, US4, US5 |
| US7 (Metrics/Export) | US4 (calls in DB) | US5, US6, US8 |
| US8 (Health) | US1 (health route) | US3–US7 |

### Within Each Phase

- All `[P]`-marked tasks within a phase run in parallel.
- Non-`[P]` tasks depend on `[P]` tasks in the same phase completing first.
- `[US*]` tasks follow: models → services → routes → frontend hooks → frontend pages.

---

## Parallel Execution Examples

### Phase 2 (Foundational) — all [P] tasks launch together

```
T009 TypeORM entities     T013 JwtAuthGuard         T017 VAPI SDK client
T010 Verify auto-sync     T014 ValidationPipe       T018 Socket.io server
T011 Admin env-seed       T015 ExceptionFilter       T019 Next.js App Router
T012 NestJS bootstrap     T016 AMI client            T020 Protected layout
                                                     T021 Axios client
                                                     T022 UI primitives
```

### Phase 3 (US1) — parallel start within story

```
T024 VAPI service         T025 IVR classifier       T032 Health route
T023 AMI service (first, no [P] — others depend on it)
```

### Phase 6 (US4) — parallel backend + frontend

```
T045 GET /calls           T049 useCallsBoard hook   T050 useCalls hook
T046 GET /calls/live      T051 LiveCallCard          T055 Badges
T047 GET /calls/:id       ...then T052 Dashboard, T053 CallLogs, T054 CallDetail (sequential)
T048 WS /ws/calls
```

---

## Implementation Strategy

### MVP Scope (Phases 1–4 + Phase 7 partial = US1 + US2)

1. Phase 1: Setup
2. Phase 2: Foundational
3. Phase 3: US1 — Call Engine ← **core value delivered**
4. Phase 4: US2 — Auth + REST API ← **secure access**
5. **Validate**: TC-1, TC-2, TC-4, TC-19, TC-32 all pass.
6. **Demo**: ViciDial outbound call → VAPI AI agent answers → voicemail hang-up works → login to webapp → calls appear in log.

### Incremental Delivery

After MVP, each phase adds independently testable value:

| Increment | New Capability | Key Test |
|-----------|---------------|----------|
| +US3 | Create + configure campaigns | TC-23 |
| +US4 | See calls live + history | TC-10, TC-14 |
| +US5 | 3-way transfer | TC-7, TC-8 |
| +US6 | Test agents in browser | TC-12, TC-13 |
| +US7 | Metrics + CSV | TC-27, TC-28 |
| +US8 | Health monitoring | TC-30 |
| +Phase 11 | Hardened production build | TC-32, TC-33 |

---

## Task Count Summary

| Phase | Tasks | Parallelizable |
|-------|-------|---------------|
| Phase 1 — Setup | 8 | 6 |
| Phase 2 — Foundational | 14 | 11 |
| Phase 3 — US1 Call Engine | 10 | 3 |
| Phase 4 — US2 Auth/API | 6 | 5 |
| Phase 5 — US3 Campaigns | 6 | 5 |
| Phase 6 — US4 Call Log/Board | 11 | 5 |
| Phase 7 — US5 Transfer | 6 | 1 |
| Phase 8 — US6 Test Panel | 6 | 2 |
| Phase 9 — US7 Metrics/Export | 5 | 3 |
| Phase 10 — US8 Health | 3 | 1 |
| Phase 11 — Polish | 9 | 6 |
| **TOTAL** | **84** | **48** |

**Definition of Done**: All 35 test cases in `spec.md` pass (TC-1 to TC-35). All acceptance criteria in `spec.md` Section 6 are checked. No unresolved PHR placeholders. No hardcoded secrets. Docker `compose up` starts the full stack.
