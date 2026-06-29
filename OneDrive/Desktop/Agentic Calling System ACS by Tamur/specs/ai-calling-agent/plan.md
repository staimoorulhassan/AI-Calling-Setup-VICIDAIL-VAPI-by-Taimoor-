# Implementation Plan: AI Calling Agent System (ACS)

**Branch**: `001-ai-calling-agent` | **Date**: 2026-06-22 (v3 — sp.checklist remediation + implementation decisions)
**v2 Date**: 2026-06-16 (sp.analyze remediation) | **v1 Date**: 2026-06-09
**v4 Date**: 2026-06-26 (Real-Time Monitor & Reports Dashboard — Phase 13)
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

---

## Summary

Build an outbound AI calling system where ViciDial initiates calls, routes answered calls to
VAPI via SIP trunk for AI conversation, and the ACS backend coordinates call control
(voicemail hang-up, IVR detection, 3-way transfer) via the Asterisk Manager Interface
using the `avr-ami` library. A fully custom Next.js + NestJS webapp (the `avr-app`
codebase) provides the operator dashboard.

**Phase 13 addition**: Real-time call monitor and reports dashboard wired directly to
ViciDial MySQL and Asterisk AMI — covering live agent grid, active call control
(drop/barge), AMD-mode selector, dial-ratio control, hopper stats, and disposition funnel.

---

## Technical Context

**Language/Version**: Node.js 20 LTS (backend), TypeScript 5.x (both layers)

**Primary Dependencies**:

- Backend: NestJS 11, TypeORM, `@nestjs/passport` + `passport-jwt`, `ari-client` (ARI),
  `avr-ami` (AMI client), Dockerode, bcrypt, class-validator,
  `@nestjs/throttler` (rate limiting — Constitution Security MUST),
  `@nestjs/helmet` (HTTP security headers — Constitution Security MUST)
- Frontend: Next.js **16.1.3**, React 19, Tailwind CSS v4, shadcn/ui (Radix primitives),
  `react-hook-form` + `zod`, `next-runtime-env`

**Storage**:

- SQLite via TypeORM (`data/data.db`) — primary/admin DataSource; `synchronize: true`
- PostgreSQL 16 — secondary `'calling'` DataSource; `synchronize: false`; migrations
- Redis 7 — BullMQ queues + DNC hot-cache (HGET `dnc:<e164>`)
- MinIO/S3-compatible — call recordings; 4-year lifecycle policy

**ViciDial MySQL Tables (Phase 13)**:

| Table | Used For |
|-------|----------|
| `vicidial_live_agents` | Live agent status, channel, callerid, calls_today |
| `vicidial_auto_calls` | Active/ringing calls with phone numbers |
| `vicidial_hopper` | Hopper READY count per campaign |
| `vicidial_campaigns` | dial_level (ratio), calls_today, active |
| `vicidial_log` | Historical dispositions for date-range reports |
| `vicidial_list` | Lead status updates (decompose: AMD→status) |

**AMD Mode (Phase 13)**:
Three modes stored in-memory (per campaign key) in `VicidialService.amdModeMap`:
- `ACTIVE` — when a call ends as AMD/IVR/WR/NA, backend updates vicidial_list.status
- `DISABLED` — no lead-status decomposition; ViciDial handles natively
- `CUSTOM` — configurable status mapping (future; stored as ACTIVE with custom map)

**Dial-Ratio Control**: Direct `UPDATE vicidial_campaigns SET dial_level=? WHERE campaign_id=?` — no AMI required.

**Drop Call**: Direct TCP AMI `Hangup` by channel name (VicidialService.sendAmiAction). 
Credentials: AMI_HOST/AMI_PORT/AMI_USER/AMI_PASS already in env.

**Barge/Listen**: AMI `Originate` with `Application=ChanSpy`, `Data=<channel>|q` — connects supervisor's SIP extension to spy on agent channel.

**Testing**: Jest + Supertest (backend), Vitest + Testing Library (frontend)

**Target Platform**: Windows (Docker Desktop) / Linux server (Docker container) + browser

**Performance Goals**: ≤1,500 ms AI voice turn latency p95; ≤300 ms API response p95
under 20 concurrent users; realtime poll interval 5 s (client-side setInterval, not WebSocket)

**Constraints**: 10 concurrent AI-driven calls max; no inbound call processing;
8-hour JWT expiry; secrets in `.env` only; rate limiting ≥100 req/min per IP;
VAPI `x-vapi-secret` webhook signature validation required

**Scale/Scope**: ~100 calls/day initially; 1 M+ call log rows long-term;
Organisation-scoped multi-tenancy

---

## Constitution Check (v4 — 2026-06-26)

| Gate | Principle | Status | Notes |
| ---- | --------- | ------ | ----- |
| Outbound-only enforced | I | ✅ PASS | `direction='outbound'` at insert; inbound rejected |
| Secrets in env only | II | ✅ PASS | All keys in `.env`; no hardcoded credentials |
| AMD/IVR pre-VAPI | III | ✅ PASS | AMD mode selector controls decomposition; UI enforces it |
| Structured events logged | IV | ✅ PASS | JSON events emitted for all call lifecycle events |
| Minimal AVR surface | V | ✅ PASS | Only `avr-ami`, `avr-asterisk`, `avr-sts-vapi` used |
| Testable requirements | VI | ✅ PASS | All Phase 13 tasks reference FR or TC IDs |

**No gate violations. Proceed.**

---

## Phase 13: Real-Time Monitor & Reports Dashboard

### Architecture Decision: AD-10

**Polling over WebSocket for real-time monitor**: The ViciDial MySQL tables
(`vicidial_live_agents`, `vicidial_auto_calls`, `vicidial_hopper`) are updated by
ViciDial's C processes every ~1s. A client-side 5s poll against a single backend endpoint
is sufficient and avoids WebSocket complexity. The endpoint aggregates all tables in one
database round-trip. This is consistent with ViciDial's own real-time report approach.

### New Backend Interfaces

```typescript
VicidialLiveAgent {
  user; extension; status; campaignId; callerNumber;
  callDuration; callsToday; channel; uniqueId; lastStateChange;
}

VicidialActiveCall {
  callId; campaignId; status; phoneNumber; callTime;
  duration; channel; leadId;
}

VicidialRealtimeStats {
  agents: VicidialLiveAgent[];
  activeCalls: VicidialActiveCall[];
  agentsAlive; agentsOnCall; callsRinging; callsLive;
  hopperCount; dialRatio; dialedToday; campaignId;
}

DispositionStat { status; count; label; }
```

### New Backend Endpoints (Phase 13)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/vicidial/realtime` | Aggregate live agents + calls + hopper |
| GET | `/api/v1/vicidial/stats/dispositions` | Disposition counts by date range |
| POST | `/api/v1/vicidial/campaigns/:id/ratio` | Update dial_level 1–10 |
| POST | `/api/v1/vicidial/campaigns/:id/amd-mode` | Set AMD mode in-memory |
| POST | `/api/v1/vicidial/calls/:channel/drop` | AMI Hangup by channel |
| POST | `/api/v1/vicidial/calls/:channel/barge` | AMI ChanSpy via Originate |
| POST | `/api/v1/vicidial/leads/:id/decompose` | Set lead status (AMD/WR/NA/IVR/etc.) |

### New Frontend Components (Phase 13)

| File | Purpose |
|------|---------|
| `hooks/use-realtime.ts` | 5s poll hook returning `VicidialRealtimeStats` |
| `components/vicidial/realtime-monitor.tsx` | Full monitor panel (agent grid + controls) |
| `components/vicidial/monitor-widget.tsx` | Compact 4-stat strip for Overview |
| `app/(protected)/reports/page.tsx` | Rewrite: live monitor + historical date-range filter |
| `app/(protected)/overview/page.tsx` | Add MonitorWidget before existing content |

---

## Project Structure (unchanged from v3 except Phase 13 additions)

See v3 plan for full structure. Phase 13 adds:
- `src/vicidial/vicidial.service.ts` — 7 new methods
- `src/vicidial/vicidial.controller.ts` — 7 new routes
- Frontend: 2 new hooks, 2 new components, 2 page rewrites

---

## Architecture Decisions

*(AD-1 through AD-9 from v3 unchanged)*

### AD-10: Poll-Based Real-Time Monitor (Phase 13)

- **Decision**: 5-second client-side `setInterval` polling `GET /api/v1/vicidial/realtime`
- **Rationale**: ViciDial doesn't push events; MySQL polling is the standard approach. Socket.io would require a server-side poller anyway. 5s matches ViciDial's native real-time report.
- **Alternatives**: WebSocket with server-side 5s MySQL poll (more complex, no user-visible benefit at this scale)

### AD-11: Direct TCP AMI for Drop/Barge (Phase 13)

- **Decision**: VicidialService opens a one-shot TCP socket to Asterisk AMI (port 5038) for `Hangup` and `Originate(ChanSpy)` actions
- **Rationale**: The `avr-ami` bridge tracks calls by AVR UUID (embedded in dialplan), not by ViciDial `uniqueid`/channel. ViciDial live calls don't go through AVR dialplan, so avr-ami cannot find them. Direct AMI is necessary.
- **Alternatives**: Add a `POST /hangup-by-channel` endpoint to avr-ami (requires avr-ami code change + redeploy)

### AD-12: AMD Mode In-Memory Map (Phase 13)

- **Decision**: `VicidialService.amdModeMap: Map<string, 'ACTIVE'|'DISABLED'|'CUSTOM'>` — resets on restart
- **Rationale**: AMD mode is an operational setting that makes sense to reset on service restart. No DB migration needed.
- **Future**: Persist to SQLite admin DB if needed
