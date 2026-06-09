# Specification Plus: AI Calling Agent System

**Project:** AI Calling Agent (ACS)
**Version:** 1.0
**Date:** 2026-06-09
**Status:** Draft

---

## 1. Overview & Intent

The AI Calling Agent System (ACS) is an outbound AI-powered voice calling platform that integrates ViciDial (as the call dialer and session manager), VAPI (as the AI voice layer providing STT, TTS, and LLM), and AVR (Agent Voice Response) as the bridge/router between ViciDial and VAPI. The system enables automated AI agents to conduct outbound calls on behalf of a campaign, qualify leads, and escalate to a human verifier via 3-way transfer when needed.

The platform ships with a **fully custom web application** (owned backend + frontend) that provides real-time call logs, agent testing tools, campaign configuration, and operational visibility — eliminating dependence on third-party dashboards. The product is designed for a single operator managing a calling operation who needs full control, traceability, and operational autonomy.

---

## 2. Goals & Non-Goals

### Goals
- Integrate ViciDial as the outbound call routing engine and remote agent host.
- Integrate VAPI for AI voice processing (STT, TTS, LLM) on active calls.
- Use AVR repos (only those relevant to ViciDial + VAPI + webapp bridge) as the routing/bridge middleware.
- Support 3-way call transfer from the AI agent to a human verifier.
- Detect and hang up voicemail and IVR responses without engaging.
- Deliver a fully owned web application (own backend + frontend) with logs, agent testing, configuration, and metrics.

### Non-Goals
- Processing or recording inbound calls.
- Replacing ViciDial's native agent dashboard.
- Building a proprietary STT/TTS/LLM engine (VAPI is the provider).
- Mobile application.
- Multi-tenant SaaS features (multi-customer isolation, billing).
- Inbound call queuing or ACD routing.

---

## 3. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | The system shall use ViciDial as the primary outbound call dialer, managing dial sessions via ViciDial's remote agent API. | Must |
| FR-2 | The system shall integrate VAPI to handle STT, TTS, and LLM processing for active outbound calls. | Must |
| FR-3 | The system shall use selected AVR repository components as the bridge/router connecting ViciDial to VAPI. | Must |
| FR-4 | The AI agent shall detect answering machine/voicemail responses and immediately terminate the call without leaving a message. | Must |
| FR-5 | The AI agent shall detect IVR (interactive voice response) prompts and terminate the call without engaging. | Must |
| FR-6 | The system shall not initiate, capture, or store audio recordings of inbound calls. | Must |
| FR-7 | The system shall support a 3-way call transfer, connecting the live call between the AI agent, the prospect, and a human verifier, without dropping the prospect. | Must |
| FR-8 | The AI agent conversation flow shall be configurable via a system prompt/script stored in the webapp. | Must |
| FR-9 | The webapp shall display a real-time call log showing: call ID, phone number, agent name, start time, duration, status, and disposition. | Must |
| FR-10 | The webapp shall provide an agent test interface that can initiate a test call to a specified number and display the conversation transcript live. | Must |
| FR-11 | The webapp shall display currently active calls with live status (ringing, connected, on-hold, transferring, ended). | Must |
| FR-12 | The webapp backend shall expose a REST API covering: call initiation, agent config CRUD, log retrieval, and transfer triggers. | Must |
| FR-13 | The webapp shall require user authentication (username + password) before granting access to any view or API. | Must |
| FR-14 | All AI agent interactions (user utterance, AI response, timestamps, call ID) shall be logged to persistent storage. | Must |
| FR-15 | The webapp shall allow configuration of VAPI parameters: voice model, LLM model, language, and first-message. | Must |
| FR-16 | The webapp shall support creating, editing, enabling, and disabling AI agent campaigns. | Must |
| FR-17 | Each completed call shall have a recorded disposition (e.g., answered, voicemail, IVR, transferred, no-answer, failed). | Must |
| FR-18 | The system shall support ViciDial remote agent mode, routing the audio stream through the AVR bridge rather than a human agent station. | Must |
| FR-19 | During 3-way transfer, the system shall pass contextual information (call ID, prospect name, summary) to the receiving verifier. | Should |
| FR-20 | The webapp shall display per-agent metrics: total calls, answer rate, transfer rate, average call duration, and disposition breakdown. | Should |
| FR-21 | The system shall support configurable AMD (Answering Machine Detection) sensitivity settings per campaign. | Should |
| FR-22 | The webapp shall support exporting call logs as CSV. | Should |
| FR-23 | The system shall emit structured (JSON) event logs for every call lifecycle event (initiated, answered, AMD-detected, transferred, ended). | Must |
| FR-24 | The webapp shall provide a health status page showing connectivity to ViciDial, VAPI, and the AVR bridge. | Should |
| FR-25 | The system shall support configuring a list of phone numbers to use as caller ID per campaign. | Could |

---

## 4. Non-Functional Requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-1 | Performance | AI voice response turn latency (from end of prospect speech to start of AI speech) must be ≤ 1,500 ms at p95. |
| NFR-2 | Performance | Webapp REST API responses must be ≤ 300 ms at p95 under 20 concurrent users. |
| NFR-3 | Reliability | The AVR bridge must reconnect to ViciDial within 5 seconds on a dropped connection without losing an active call's state. |
| NFR-4 | Reliability | The system must handle up to 10 simultaneous active AI-driven calls without degradation. |
| NFR-5 | Security | VAPI API key, ViciDial credentials, and database secrets must be stored as environment variables; never hardcoded or committed. |
| NFR-6 | Security | Webapp authentication tokens must expire after 8 hours; sessions are invalidated on logout. |
| NFR-7 | Compliance | No audio or transcript data from inbound calls may be stored, per regulatory constraint. |
| NFR-8 | Observability | Every call lifecycle event must be logged as structured JSON with: timestamp (ISO 8601), call_id, event_type, and relevant metadata. |
| NFR-9 | Maintainability | Only AVR repository components necessary for ViciDial ↔ VAPI ↔ webapp integration shall be included; unused AVR repos shall not be bundled. |
| NFR-10 | Scalability | Database schema must support at minimum 1,000,000 call log rows without query degradation (indexed on call_id, created_at, campaign_id). |

---

## 5. Design & Approach

### 5.1 System Architecture

```
┌─────────────┐     AMI/AGI      ┌──────────────────┐     WebSocket/REST     ┌──────────────┐
│  ViciDial   │◄────────────────►│   AVR Bridge      │◄──────────────────────►│  VAPI Cloud  │
│  (Dialer)   │                  │  (Router Layer)   │                        │  STT+TTS+LLM │
└──────┬──────┘                  └──────────┬────────┘                        └──────────────┘
       │                                    │
       │ Remote Agent API                   │ Events + Transcripts
       ▼                                    ▼
┌─────────────────────────────────────────────────┐
│              ACS Backend (Node.js / Express)     │
│  - REST API         - Auth middleware            │
│  - Call log store   - Campaign config            │
│  - Transfer logic   - Event processor            │
└───────────────────────────┬─────────────────────┘
                            │
                  REST + WebSocket
                            │
                ┌───────────▼──────────┐
                │   ACS Frontend       │
                │  (React + Tailwind)  │
                │  - Live call board   │
                │  - Logs & metrics    │
                │  - Agent test panel  │
                │  - Campaign config   │
                └──────────────────────┘
```

### 5.2 Component Roles

| Component | Role |
|-----------|------|
| **ViciDial** | Initiates outbound calls from a lead list; manages agent sessions via remote agent mode; provides AMD (voicemail detection) hooks. |
| **AVR Bridge** | Selected subset of the `agentvoiceresponse` GitHub repos that act as the Asterisk AGI/AMI adapter. Receives audio from ViciDial's Asterisk PBX, streams to VAPI, and returns AI audio back to the call. |
| **VAPI** | Processes the real-time audio stream using STT, generates AI responses via LLM (configurable model), synthesizes speech via TTS, and manages the voice agent conversation state. |
| **ACS Backend** | Node.js/Express REST + WebSocket server. Stores call logs, campaign configs, transcripts, and dispositions. Authenticates webapp users. Triggers 3-way transfers via ViciDial AMI. |
| **ACS Frontend** | React single-page app. Provides the operator dashboard: live call board, logs, test panel, metrics, agent/campaign config forms. |

### 5.3 Key Call Flow

1. Operator starts a campaign; ViciDial dials prospects from lead list.
2. ViciDial detects a live answer (AMD pass) → passes the call channel to AVR bridge via Asterisk AGI/AMI.
3. AVR bridge establishes a VAPI session, streams audio bidirectionally.
4. VAPI AI agent conducts conversation per configured system prompt.
5. **Voicemail/IVR detected** → AVR bridge or ViciDial AMD fires hang-up; event logged as `voicemail` or `ivr`.
6. **Transfer trigger** → AI agent issues a VAPI `transferCall` tool call; `avr-sts-vapi` calls ViciDial's `non_agent_api.php` to retrieve the current agent session ID, then calls `agc/api.php?action=conf_newcall` to dial the human verifier into ViciDial's native conference. ViciDial manages the conference bridge; AI SIP leg exits.
7. Call ends → disposition written; transcript + events persisted.

### 5.4 3-Way Transfer Design

Transfer is triggered by the AI issuing a VAPI `transferCall` tool call (or manually from the webapp). The `avr-sts-vapi` connector handles the transfer sequence entirely via ViciDial's HTTP API — no Asterisk AMI or ConfBridge commands are used.

**Transfer sequence:**
1. VAPI sends a `transferCall` tool call event on the WebSocket session.
2. `avr-sts-vapi` calls `GET {VICIDIAL_URL}/non_agent_api.php?function=agent_status&agent_user=…&agent_pass=…` to retrieve the agent's active `conf_exten` (ViciDial session ID).
3. `avr-sts-vapi` calls `GET {VICIDIAL_URL}/agc/api.php?action=conf_newcall&session_id=…&phone_number=…` to dial the verifier's phone number into ViciDial's internal conference.
4. ViciDial bridges the verifier into the existing call; the AI's VAPI SIP leg is terminated.
5. A context packet (call_id, prospect name, AI-generated conversation summary) is surfaced to the verifier in the webapp.

**Why ViciDial `conf_newcall` instead of AMI ConfBridge:** ViciDial maintains its own conference state per agent session. Using ViciDial's native API (`conf_newcall`) adds the verifier directly into the ViciDial-managed bridge without requiring ACS to create or manage an independent Asterisk ConfBridge room. This is simpler, more reliable, and keeps conference control inside ViciDial where the agent session lives.

### 5.5 AVR Repo Selection Rationale

From the 44 repositories in `agentvoiceresponse`, only those fulfilling the following roles are in scope:
- **Asterisk AGI/AMI connector** — receives ViciDial call control events.
- **VAPI WebSocket bridge** — streams audio to/from VAPI.
- **Audio format adapter** — handles codec negotiation (µ-law ↔ PCM ↔ VAPI format).
- **Call router/state machine** — routes events between ViciDial and VAPI, fires hang-up on AMD/IVR signals.

Specific repo names are flagged as an Open Question (see Section 9) pending repository audit.

### 5.6 Key Decisions & Trade-offs

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Backend runtime | Node.js 20 | Python | VAPI and AVR repos are JS-native; reduces integration surface. |
| Backend framework | NestJS 11 | Express 4 | Built-in DI, guards, decorators, and module system reduce boilerplate; TypeORM integration is first-class. |
| Frontend framework | Next.js 16 + React 19 + Tailwind v4 + shadcn/ui | React + Vite | App Router provides layout-level auth protection; shadcn/ui accelerates UI; reuses avr-app codebase. |
| Database | SQLite (TypeORM, `synchronize: true`) | PostgreSQL / MongoDB | Zero-ops for single-operator deployment; TypeORM auto-syncs schema; SQLite handles 1M+ rows with proper indexes. |
| ORM / migrations | TypeORM with `synchronize: true` | Prisma + explicit migrations | Schema auto-sync is acceptable for single-tenant; avoids migration management overhead in early stage. |
| Auth | JWT via `passport-jwt` (8h expiry) | Session cookies | Stateless; works with REST API calls from test interface; NestJS Passport integration is idiomatic. |
| Transport: ViciDial ↔ AVR audio | SIP Trunk (PSTN RTP) | Asterisk AudioSocket + VAPI WebSocket | SIP is the standard telephony path; VAPI documents it; no codec bridging code to maintain. (AD-1) |
| Transport: ViciDial call control | Asterisk AMI via avr-ami | SIP direct / AGI | ViciDial is Asterisk-native; AMI is the documented path for hang-up and ConfBridge origination. |

---

## 6. Acceptance Criteria

The system is **done** when all of the following hold:

- [ ] An outbound call from ViciDial is fully handled by the VAPI AI agent without human involvement.
- [ ] A call reaching voicemail results in an automatic hang-up with `voicemail` disposition — confirmed in logs.
- [ ] A call reaching an IVR results in an automatic hang-up with `ivr` disposition — confirmed in logs.
- [ ] No audio or transcript is stored when an inbound call arrives (outbound-only mode verified).
- [ ] A 3-way transfer completes: AI + prospect + verifier are all in conference; AI successfully exits; prospect remains connected.
- [ ] Webapp login rejects invalid credentials; valid credentials produce a session token.
- [ ] Webapp live call board updates in real time (≤ 2s delay) for a call in progress.
- [ ] Agent test panel can initiate a test call and display the transcript live.
- [ ] All call lifecycle events appear in the call log with correct disposition.
- [ ] VAPI and ViciDial credentials are sourced from `.env`; no secrets in source.

---

## 7. Test Cases

| ID | Tests | Preconditions | Steps | Expected Result | Status |
|----|-------|---------------|-------|-----------------|--------|
| TC-1 | FR-1, FR-2, FR-3 | ViciDial running, AVR bridge up, VAPI credentials valid | 1. Trigger outbound dial to a live test number. 2. Human answers. | AI agent greets prospect, conversation flows via VAPI STT/TTS. | ☐ Not run |
| TC-2 | FR-4 | ViciDial AMD enabled, voicemail test number configured | 1. Dial a number known to reach voicemail. | Call is terminated within 3s of voicemail greeting; disposition = `voicemail`. | ☐ Not run |
| TC-3 | FR-4 | Same as TC-2 | 1. Dial voicemail. 2. Check logs. | No AI audio is transmitted to the voicemail box. | ☐ Not run |
| TC-4 | FR-5 | IVR test number available | 1. Dial a number that answers with an IVR menu. | Call is terminated within 3s of IVR detection; disposition = `ivr`. | ☐ Not run |
| TC-5 | FR-5 | Same as TC-4 | 1. Dial IVR. 2. Confirm AI did not press any key or speak. | No DTMF or speech was sent to IVR. | ☐ Not run |
| TC-6 | FR-6 | Inbound call test configured | 1. Place an inbound call to the system's DID. | Call is not answered or recorded; no transcript or audio stored. | ☐ Not run |
| TC-7 | FR-7 | Live call in progress, verifier phone number configured | 1. Trigger transfer from webapp. 2. Observe call flow. | Verifier is dialed; all three parties are in conference; AI exits after handoff phrase. | ☐ Not run |
| TC-8 | FR-7 | Same as TC-7 | 1. Complete 3-way transfer. 2. Verify prospect stays connected after AI exits. | Prospect remains on line; verifier continues conversation. | ☐ Not run |
| TC-9 | FR-8 | Campaign with custom system prompt saved | 1. Start a call with the configured campaign. | AI's first message and behavior match the configured prompt. | ☐ Not run |
| TC-10 | FR-9 | At least one completed call exists | 1. Open webapp logs view. | Log row shows: call ID, number, agent, start time, duration, status, disposition. | ☐ Not run |
| TC-11 | FR-9 | Same as TC-10 | 1. Filter logs by date range and campaign. | Only matching records returned. | ☐ Not run |
| TC-12 | FR-10 | Webapp test panel open, valid test number entered | 1. Enter a phone number. 2. Click "Test Agent". | Outbound call initiated; live transcript appears in test panel. | ☐ Not run |
| TC-13 | FR-10 | Same as TC-12 | 1. Initiate test call. 2. Speak to AI. | AI responds; both turns shown in transcript with timestamps. | ☐ Not run |
| TC-14 | FR-11 | One active call in progress | 1. Open webapp live board. | Active call card shown: number, agent, status, duration counter. | ☐ Not run |
| TC-15 | FR-11 | Status changes (connected → transferring) | 1. Trigger transfer during active call. 2. Watch live board. | Status updates to `transferring` within 2s without page refresh. | ☐ Not run |
| TC-16 | FR-12 | Backend deployed | 1. Call `GET /api/calls` with valid JWT. | Returns paginated call log JSON. | ☐ Not run |
| TC-17 | FR-12 | Backend deployed | 1. Call `GET /api/calls` without auth header. | Returns 401 Unauthorized. | ☐ Not run |
| TC-18 | FR-13 | Webapp login page | 1. Submit wrong password. | Login rejected; no token issued. | ☐ Not run |
| TC-19 | FR-13 | Webapp login page | 1. Submit correct credentials. | JWT token issued; user redirected to dashboard. | ☐ Not run |
| TC-20 | FR-13 | Valid session | 1. Wait 8+ hours (or manually expire token). 2. Try to access dashboard. | Redirected to login; no data visible. | ☐ Not run |
| TC-21 | FR-14 | Active call in progress | 1. Speak five utterances. 2. Call ends. | Log record shows all five utterances with timestamps and call_id. | ☐ Not run |
| TC-22 | FR-15 | Webapp campaign config | 1. Change VAPI voice model. 2. Start a call. | Call uses the updated voice model. | ☐ Not run |
| TC-23 | FR-16 | Webapp campaigns page | 1. Create a new campaign. 2. Disable it. | Campaign appears in list; disabling prevents new dials. | ☐ Not run |
| TC-24 | FR-17 | Completed calls with varied outcomes | 1. Inspect log rows for voicemail, IVR, transferred, and answered calls. | Each has correct disposition value. | ☐ Not run |
| TC-25 | FR-18 | ViciDial remote agent mode enabled | 1. Start a campaign. | Audio channel routed through AVR bridge, not to a human agent station. | ☐ Not run |
| TC-26 | FR-19 | 3-way transfer triggered | 1. Check verifier's context panel during transfer. | Panel shows prospect name, call ID, and AI-generated conversation summary. | ☐ Not run |
| TC-27 | FR-20 | 10 completed calls in DB | 1. Open agent metrics page. | Displays: total calls, answer rate %, transfer rate %, avg duration, disposition breakdown. | ☐ Not run |
| TC-28 | FR-22 | 50 call records in DB | 1. Click "Export CSV" in logs view. | CSV file downloads with all visible columns; no data truncated. | ☐ Not run |
| TC-29 | FR-23, NFR-8 | Active call lifecycle | 1. Initiate call. 2. Call is answered. 3. Transfer triggered. 4. Call ends. | Four JSON events written: `initiated`, `answered`, `transfer_initiated`, `ended`; each has call_id, timestamp, event_type. | ☐ Not run |
| TC-30 | FR-24 | Health page open | 1. Take down VAPI mock. 2. Refresh health page. | VAPI indicator shows `degraded`; ViciDial and AVR show `healthy`. | ☐ Not run |
| TC-31 | NFR-1 | Live call in progress, latency monitoring on | 1. Prospect speaks; measure time to first AI audio byte. | Latency ≤ 1,500 ms at p95 across 10 test utterances. | ☐ Not run |
| TC-32 | NFR-5 | Source code and `.env` | 1. `grep -r "VAPI_API_KEY\|viciPassword" src/`. | No hardcoded secrets found. | ☐ Not run |
| TC-33 | NFR-4 | Load test setup | 1. Simulate 10 simultaneous test calls. | All 10 calls complete without error; no transcript dropped; avg latency within NFR-1. | ☐ Not run |
| TC-34 | FR-4, edge | AMD fires mid-conversation | 1. Simulate late AMD trigger (3s into AI speech). | Call is terminated; AI does not continue speaking; disposition = `voicemail`. | ☐ Not run |
| TC-35 | FR-7, edge | Verifier does not answer 3-way transfer | 1. Trigger transfer; verifier number busy/unreachable. | System retries once; if still unreachable, AI resumes or call is flagged `transfer-failed`. | ☐ Not run |

---

## 8. Implementation Tasks

> This section is superseded by [`specs/ai-calling-agent/tasks.md`](./tasks.md), which is the authoritative, dependency-ordered task list. Refer to `tasks.md` for all implementation work.

---

## 9. Risks & Open Questions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| AVR repo audit reveals no directly usable ViciDial ↔ VAPI bridge; custom bridge must be built from scratch | Medium | High | Start T-1.1 immediately; if no suitable AVR repo exists, build a thin Asterisk AGI script + VAPI SDK wrapper as a fallback (≈ 1 week additional). |
| ViciDial AMD misfires on live human answers (false positive) | Medium | Medium | Make AMD sensitivity configurable (FR-21); default to conservative setting; monitor disposition data. |
| VAPI introduces latency spikes above 1,500 ms p95 on lower-tier plans | Medium | Medium | Monitor in TC-31; if exceeded, explore VAPI's dedicated infrastructure tier or pre-warm sessions. |
| 3-way transfer drops the prospect during conference handoff | Low | High | Test TC-8 and TC-35 extensively on ViciDial before any production use; maintain a fallback where AI stays until verifier confirms. |

### Open Questions

| OQ | Question | Blocking? | Owner |
|----|----------|-----------|-------|
| OQ-1 | Which specific AVR repos from the 44 in `agentvoiceresponse` are intended for ViciDial + VAPI integration? (T-1.1 answers this) | Yes — blocks Phase 2 | Project owner / repo audit |
| OQ-2 | Does the project use ViciDial's built-in AMD or does AVR/VAPI provide its own voicemail detection? | Yes — affects FR-4, FR-5 design | AVR repo audit |
| OQ-3 | What is the IVR detection mechanism — DTMF tones, silence patterns, VAPI classifier, or ViciDial signal? | Yes — affects T-2.5 implementation | ViciDial + AVR docs |
| OQ-4 | What LLM provider should VAPI use by default (OpenAI, Anthropic, custom)? | No — configurable later | Project owner preference |
| OQ-5 | What is the human verifier's endpoint — a phone number, a SIP extension, or a webapp interface? | Yes — affects FR-7 transfer design | Project owner |
| OQ-6 | Is there a specific ViciDial campaign/list format or API version to target? | No — ViciDial 2.14-x is typical | Project owner |
| OQ-7 | Are there compliance or geographic requirements governing call recording that go beyond "no inbound recording"? | No | Project owner / legal |

---

## 10. Glossary

| Term | Definition |
|------|------------|
| **AVR** | Agent Voice Response — an open-source GitHub organization (`agentvoiceresponse`) with 44 repos providing bridge/routing tools between telephony platforms and AI voice APIs. |
| **ViciDial** | Open-source call center suite built on Asterisk; manages outbound dialing campaigns and remote agent sessions. |
| **VAPI** | Voice API — a cloud AI voice platform providing STT, TTS, LLM, and full voice agent orchestration. |
| **AMD** | Answering Machine Detection — a ViciDial/Asterisk feature that analyzes audio to determine if a call was answered by a voicemail system. |
| **IVR** | Interactive Voice Response — an automated phone system that prompts callers with menus (e.g., "Press 1 for sales"). |
| **AGI** | Asterisk Gateway Interface — a protocol for external programs to control an Asterisk call channel. |
| **AMI** | Asterisk Manager Interface — a TCP API for sending commands to and receiving events from a running Asterisk instance. |
| **3-Way Transfer** | A call configuration where the AI agent, the prospect, and a human verifier are all connected in a conference bridge simultaneously. |
| **STT** | Speech-to-Text — transcribes spoken audio to text. |
| **TTS** | Text-to-Speech — synthesizes text into spoken audio. |
| **LLM** | Large Language Model — generates AI responses; in VAPI, this drives the conversation logic. |
| **PHR** | Prompt History Record — a structured log of a user prompt and AI response, stored for traceability. |
| **Disposition** | The outcome label assigned to a completed call (e.g., `answered`, `voicemail`, `ivr`, `transferred`, `no-answer`, `failed`). |
