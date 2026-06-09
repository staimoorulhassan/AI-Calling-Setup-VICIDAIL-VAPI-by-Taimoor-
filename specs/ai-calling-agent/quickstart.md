# Quickstart: AI Calling Agent System (ACS)

**Date**: 2026-06-09
**Audience**: Developer setting up ACS for the first time.

This guide covers environment setup, dependency installation, and running the system locally. Production deployment notes are at the bottom.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20 LTS | https://nodejs.org |
| PostgreSQL | 15+ | https://postgresql.org or Docker |
| Git | any | https://git-scm.com |
| ViciDial instance | 2.14-x | VM or existing server |
| VAPI account | — | https://vapi.ai |

---

## 1. Clone and Install

```bash
git clone https://github.com/yourorg/acs
cd acs
npm install            # installs root dev tools (husky, concurrently)
cd backend && npm install
cd ../frontend && npm install
```

---

## 2. Environment Variables

Copy the example env file and fill in values:

```bash
cp .env.example .env
```

**.env keys:**

```bash
# Database
DATABASE_URL="postgresql://acs_user:yourpassword@localhost:5432/acs_db"

# Auth
JWT_SECRET="replace-with-64-char-random-string"

# VAPI
VAPI_API_KEY="your-vapi-api-key"
VAPI_WEBHOOK_SECRET="replace-with-32-char-random-string"
VAPI_SIP_HOST="sip.vapi.ai"

# ViciDial AMI (Asterisk Manager Interface)
AMI_HOST="192.168.1.100"         # ViciDial server IP
AMI_PORT=5038
AMI_USER="acs_ami_user"
AMI_PASSWORD="your-ami-password"

# ViciDial HTTP API (for campaign/lead management)
VICIDIAL_API_URL="http://192.168.1.100/agc/api.php"
VICIDIAL_API_USER="api_user"
VICIDIAL_API_PASS="api_password"

# Frontend (Vite)
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
```

---

## 3. Database Setup

```bash
cd backend
npx prisma migrate dev --name init     # creates tables and applies migrations
npx prisma db seed                     # creates default admin user
```

Default admin credentials (change immediately after first login):
- Email: `admin@acs.local`
- Password: `ChangeMe123!`

---

## 4. ViciDial Configuration

### 4a. Create AMI User

In ViciDial's Asterisk `manager.conf`, add:

```ini
[acs_ami_user]
secret = your-ami-password
deny = 0.0.0.0/0.0.0.0
permit = 127.0.0.1/255.255.255.0     ; or your ACS server IP
read = all
write = all
```

Reload Asterisk: `asterisk -rx "module reload manager"`

### 4b. Create VAPI SIP Trunk in ViciDial

In ViciDial Admin → Carriers, add:

```
Carrier Name: VAPI-AI
Protocol: SIP
Server: sip.vapi.ai
Auth type: none
Dial prefix: SIP/
```

### 4c. Campaign Outbound Route

In the ViciDial campaign, set the Dial Method to `ADAPT_HARD_LIMIT` and in the dialplan ensure answered calls route to the VAPI carrier. The exact dialplan modification depends on your ViciDial version — see `docs/vicidial-dialplan.md` (Phase 6 deliverable).

---

## 5. VAPI Configuration

### 5a. Create an Assistant

In VAPI Dashboard → Assistants → New:
- Set **System Prompt** and **First Message** (these will be overridden per-campaign by ACS).
- Set **Webhook URL**: `https://acs.yourdomain.com/api/webhooks/vapi`
- Set **Webhook Secret**: value from `VAPI_WEBHOOK_SECRET`.
- Add **Tool**: `request_transfer` (see `contracts/websocket.md` for tool definition JSON).

### 5b. SIP Trunk Whitelist

In VAPI Dashboard → SIP Trunks → New:
- Name: `ViciDial`
- Allowlisted IPs: your ViciDial server's public IP.
- Username: your VAPI assistant ID.

---

## 6. Run Locally

```bash
# From repo root — starts backend + frontend concurrently
npm run dev
```

Or separately:

```bash
# Terminal 1 — backend (port 3001)
cd backend && npm run dev

# Terminal 2 — frontend (port 5173)
cd frontend && npm run dev
```

Open `http://localhost:5173` → login with admin credentials.

---

## 7. Verify Setup

1. Open **System Health** page (`/health`). All three indicators (ViciDial, VAPI, Database) should show green.
2. Open **Agent Test Panel** → enter your own phone number → click **Test Agent**. Your phone should ring and the AI should greet you.
3. Check **Call Logs** — the test call should appear with `test` disposition and a transcript.

If ViciDial or VAPI show as degraded:
- ViciDial: confirm AMI host/port/credentials in `.env`; check `telnet AMI_HOST 5038`.
- VAPI: confirm `VAPI_API_KEY` is valid; check VAPI dashboard for assistant status.

---

## 8. Production Deployment

### Docker (recommended)

```bash
docker compose up -d
```

`docker-compose.yml` provisions:
- `acs-backend` (Node.js)
- `acs-frontend` (Nginx serving React build)
- `postgres` (PostgreSQL 15)

Environment variables must be set in a `.env` file or Docker secrets — never baked into the image.

### Process Manager (alternative)

```bash
cd backend && npm run build && pm2 start dist/index.js --name acs-backend
cd frontend && npm run build    # then serve /dist with Nginx
```

### Database Migrations in Production

```bash
cd backend && npx prisma migrate deploy
```

Run this before starting the updated application. Migrations are non-destructive (additive only in Phase 1).

---

## 9. AVR-AMI Setup

`avr-ami` is used for Asterisk call control. It is included as a dependency in `backend/package.json`.

Configuration in `backend/src/config/ami.ts`:

```typescript
export const amiConfig = {
  host:     process.env.AMI_HOST!,
  port:     parseInt(process.env.AMI_PORT ?? '5038'),
  username: process.env.AMI_USER!,
  password: process.env.AMI_PASSWORD!,
  reconnect: true,
  reconnectTimeout: 5000,  // NFR-3: 5s reconnect
}
```

The AMI client reconnects automatically on drop — satisfying NFR-3.

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `DATABASE_URL connection refused` | PostgreSQL not running; check `pg_isready` |
| `AMI connection failed` | ViciDial firewall; confirm port 5038 open from ACS server |
| `VAPI webhook 401` | `x-vapi-secret` header mismatch; verify `VAPI_WEBHOOK_SECRET` matches VAPI dashboard |
| Test call rings but AI doesn't speak | Check VAPI assistant has a valid `first_message`; check call log events for `call.answered` |
| AMD not detecting voicemails | ViciDial AMD not enabled on campaign; check campaign `amd_sensitivity` setting |
