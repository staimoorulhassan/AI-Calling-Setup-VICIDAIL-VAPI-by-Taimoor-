# ACS Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-06-09

## Active Technologies

| Layer | Tech | Version |
|-------|------|---------|
| Backend runtime | Node.js | 20 LTS |
| Backend language | TypeScript | 5.x |
| HTTP framework | Express | 4.x |
| ORM | Prisma | 5.x |
| Database | PostgreSQL | 15+ |
| WebSocket | Socket.io | latest |
| Auth | JWT + bcrypt | — |
| Logging | Pino | latest |
| Validation | Zod | latest |
| AMI client | avr-ami | (from agentvoiceresponse) |
| VAPI SDK | @vapi-ai/server-sdk | latest |
| Frontend runtime | React | 18 |
| Build tool | Vite | 5 |
| Styling | Tailwind CSS | 3 |
| Routing | React Router | 6 |
| Data fetching | React Query (TanStack) | latest |
| Charts | Recharts | latest |
| Testing (backend) | Jest + Supertest | — |
| Testing (frontend) | Vitest + RTL | — |

## Project Structure

```text
backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── index.ts
│   ├── config/      (ami.ts, vapi.ts, env.ts)
│   ├── middleware/  (auth.ts, validate.ts)
│   ├── routes/      (auth, campaigns, calls, metrics, health, webhooks)
│   ├── services/    (ami, vapi, call, ivrDetection, transfer)
│   ├── ws/          (callsBoard, transcript)
│   └── jobs/        (callCleanup)
└── tests/

frontend/
├── src/
│   ├── api/         (client, hooks)
│   ├── pages/       (Login, Dashboard, CallLogs, CallDetail, AgentTest, Campaigns, Metrics, Health)
│   ├── components/
│   └── ws/
└── tests/

specs/ai-calling-agent/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
└── contracts/ (openapi.yaml, websocket.md)
```

## Commands

```bash
# Install all
npm install && cd backend && npm install && cd ../frontend && npm install

# Run both in dev
npm run dev                    # from root (uses concurrently)

# Backend only
cd backend && npm run dev      # nodemon + ts-node, port 3001

# Frontend only
cd frontend && npm run dev     # Vite HMR, port 5173

# Database
cd backend && npx prisma migrate dev    # dev migrations
cd backend && npx prisma migrate deploy # production migrations
cd backend && npx prisma db seed        # seed admin user
cd backend && npx prisma studio         # DB browser

# Tests
cd backend && npm test         # Jest
cd frontend && npm test        # Vitest

# Build
cd backend && npm run build    # tsc output to dist/
cd frontend && npm run build   # Vite output to dist/

# Type check
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

## Code Style

- TypeScript strict mode on both layers.
- Zod for all runtime validation (env vars, request bodies, VAPI webhook payloads).
- Prisma for all DB access — no raw SQL except migrations.
- Return `{ data: ... }` wrapper from all REST endpoints; `{ error, message }` on errors.
- WebSocket messages always include `type` discriminant field.
- Log with Pino structured JSON; include `call_id` in every log entry related to a call.
- No `any` — use `unknown` + type guards.

## Integration Points

| System | How |
|--------|-----|
| ViciDial (audio) | SIP Trunk to `sip.vapi.ai` — ViciDial dials VAPI directly |
| ViciDial (control) | AMI on port 5038 via `avr-ami`; reconnect within 5s |
| VAPI (call control) | `@vapi-ai/server-sdk` + webhook on `/api/webhooks/vapi` |
| VAPI (3-way tool) | `request_transfer` tool registered in VAPI assistant config |
| AMD | ViciDial native — fires before VAPI SIP leg established |
| IVR detection | `ivrDetection.service.ts` — keyword check on first VAPI transcript turn |

## Recent Changes

1. **2026-06-09**: Initial spec + plan created. Architecture: ViciDial SIP → VAPI, avr-ami for AMI control, PostgreSQL for call log storage, React webapp.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
