# ACS — Agentic Calling System

> AI-powered outbound calling platform built by **Taimoor**.
> ViciDial dials the lead → AVR Asterisk routes the audio → VAPI AI handles the conversation → one click transfers to a human verifier — all managed from a single admin panel.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                          OUTBOUND CALL FLOW                               │
└───────────────────────────────────────────────────────────────────────────┘

  ┌─────────────┐          ┌────────────────────────────────────────────┐
  │  ViciDial   │          │              AVR Stack (local / Docker)     │
  │  (Dialer)   │          │                                             │
  │  AMD  ──────┼──── SIP ─►  avr-asterisk (Asterisk 23, port 5060)     │
  │  Campaigns  │  ngrok   │       │  AudioSocket                        │
  │  Agent 9001 │  TCP     │       ▼                                     │
  └─────────────┘  tunnel  │  avr-core  (audio bridge)                  │
                           │       │  WebSocket                          │
  ┌─────────────┐          │       ▼                                     │
  │  VAPI       │◄─── WS ──┤  avr-sts-vapi (port 6042)                  │
  │  STT+LLM    │  VAPI    │       │  3-way transfer via ViciDial API    │
  │  +TTS       │  API     │       ▼                                     │
  └─────────────┘          │  avr-ami   (AMI bridge, port 6006)         │
                           │  avr-asterisk ─ ARI (port 8088)            │
                           └────────────────────────────────────────────┘
                                         │  Dockerode
                           ┌─────────────▼──────────────────────────────┐
                           │         avr-app  (Admin Panel)              │
                           │  backend  NestJS 11 · SQLite  (port 3001)  │
                           │  frontend Next.js 16 · React 19 (port 3000)│
                           └────────────────────────────────────────────┘
```

---

## Table of Contents

1. [What it does](#1-what-it-does)
2. [Tech stack](#2-tech-stack)
3. [Quick start — one script](#3-quick-start--one-script)
4. [Manual setup](#4-manual-setup)
   - 4.1 [Prerequisites](#41-prerequisites)
   - 4.2 [Clone and install](#42-clone-and-install)
   - 4.3 [Environment variables](#43-environment-variables)
   - 4.4 [Start Docker services](#44-start-docker-services)
   - 4.5 [Start avr-sts-vapi](#45-start-avr-sts-vapi)
   - 4.6 [Start avr-app](#46-start-avr-app)
5. [VAPI configuration](#5-vapi-configuration)
6. [ViciDial configuration](#6-vicidial-configuration)
7. [In-app setup](#7-in-app-setup)
8. [How a call works end-to-end](#8-how-a-call-works-end-to-end)
9. [3-way transfer deep-dive](#9-3-way-transfer-deep-dive)
10. [AMD sensitivity](#10-amd-sensitivity)
11. [Webapp pages](#11-webapp-pages)
12. [API reference](#12-api-reference)
13. [Environment variable reference](#13-environment-variable-reference)
14. [Project structure](#14-project-structure)
15. [Development commands](#15-development-commands)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. What it does

| Capability | How |
|---|---|
| **AI outbound calls** | ViciDial dials the lead → SIP trunk to AVR Asterisk → avr-core AudioSocket bridge → avr-sts-vapi → VAPI AI |
| **Voicemail detection** | ViciDial AMD fires at dialplan level → immediate hang-up, no AI audio wasted |
| **IVR detection** | First VAPI transcript turn checked against keyword list → hang-up if matched |
| **3-way transfer** | VAPI calls `transferCall` tool → avr-sts-vapi calls ViciDial `conf_newcall` API → verifier dialed into existing conference |
| **AMD sensitivity control** | Per-agent setting (`conservative` / `normal` / `aggressive` / `disabled`) passed to ViciDial on agent start |
| **Agent management** | avr-app creates providers and agents, then launches the correct Docker container pair per agent |
| **SIP trunk & number routing** | avr-app manages Asterisk PJSIP config, reloads Asterisk via ARI when anything changes |
| **Browser softphone** | avr-phone (WebRTC) registers via Asterisk — operators can take calls from the browser |
| **Call recordings** | Captured by Asterisk, browsable and streamable from the admin panel |

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| **Dialer** | ViciDial 2.14 + Asterisk |
| **PBX** | Asterisk 23 (`agentvoiceresponse/avr-asterisk`) — PJSIP · ARI 8088 · AMI 5038 |
| **AMI bridge** | `avr-ami` — lightweight HTTP wrapper for Asterisk AMI (port 6006) |
| **STS bridge** | `avr-sts-vapi` — Node.js WebSocket server (port 6042); resamples 8 kHz ↔ 16 kHz |
| **AI voice** | VAPI — STT + LLM + TTS in Speech-to-Speech mode |
| **Admin backend** | NestJS 11 · TypeORM · SQLite (`data/data.db`) · `passport-jwt` (8h) · Dockerode |
| **Admin frontend** | Next.js 16 · React 19 · Tailwind CSS v4 · shadcn/ui · Framer Motion |
| **Container runtime** | Docker Engine — backend manages agent containers via Dockerode |
| **Tunnel** | ngrok TCP — exposes local Asterisk SIP port 5060 to ViciDial |

---

## 3. Quick start — one script

> **Windows only.** Requires PowerShell 7+ (`pwsh`).

```powershell
git clone https://github.com/staimoorulhassan/AI-Calling-Setup-VICIDAIL-VAPI-by-Taimoor-.git acs
cd acs
.\setup.ps1
```

`setup.ps1` will:
- Check and install Node.js 20, Docker, Git, ngrok (via `winget`)
- Walk you through VAPI account + assistant creation step by step
- Walk you through ViciDial SIP carrier + agent configuration
- Prompt for all API keys (passwords are masked)
- Auto-generate `JWT_SECRET` and `WEBHOOK_SECRET`
- Write all `.env` files
- `npm install` and `npm run build` for backend + frontend
- Start Docker services (avr-asterisk, avr-ami, avr-sts-vapi)
- Start the NestJS backend and Next.js frontend
- Start `ngrok tcp 5060` and display the public address
- Guide you through in-app Provider → Agent → Trunk → Number setup

After it finishes, open **http://localhost:3000** and log in.

---

## 4. Manual setup

Use this if you prefer to understand each step or are on Linux/macOS.

### 4.1 Prerequisites

| Tool | Minimum | Check |
|---|---|---|
| Node.js | 20 LTS | `node --version` |
| npm | 10+ | `npm --version` |
| Docker Desktop | any recent | must be running |
| Git | any | `git --version` |
| ngrok | any | `ngrok --version` — free account needed for TCP tunnels |
| ViciDial | 2.14 | admin access required |
| VAPI account | — | [dashboard.vapi.ai](https://dashboard.vapi.ai) — free tier works |

### 4.2 Clone and install

```bash
git clone https://github.com/staimoorulhassan/AI-Calling-Setup-VICIDAIL-VAPI-by-Taimoor-.git acs
cd acs

# Backend
cd avr-app/backend && npm install && cd ../..

# Frontend
cd avr-app/frontend && npm install && cd ../..

# STS bridge
cd avr-sts-vapi && npm install && cd ..
```

### 4.3 Environment variables

#### `avr-sts-vapi/.env`

```env
PORT=6042

# VAPI — get from dashboard.vapi.ai → API Keys
VAPI_PRIVATE_KEY=your-private-key
VAPI_PUBLIC_KEY=your-public-key
VAPI_ASSISTANT_ID=your-assistant-id

# ViciDial — required for 3-way transfer
VICIDIAL_URL=https://your-vicidial-server.com
VICIDIAL_USER=admin
VICIDIAL_PASS=your-admin-password
VICIDIAL_AGENT_USER=9001
VICIDIAL_AGENT_PASS=your-agent-password

# AMD sensitivity applied to ViciDial campaign on agent start
# Values: disabled | conservative | normal | aggressive
AMD_SENSITIVITY=conservative
```

#### `avr-app/backend/.env`

```env
PORT=3001

# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=your-64-hex-chars-secret

# Auto-created admin user on first boot
ADMIN_USERNAME=admin@agentvoiceresponse.com
ADMIN_PASSWORD=agentvoiceresponse

# SQLite database path (relative to backend/)
DB_TYPE=sqlite
DB_DATABASE=../data/data.db

# Frontend origin (CORS)
FRONTEND_URL=http://localhost:3000

# Webhooks
WEBHOOK_URL=http://localhost:3001/webhooks
WEBHOOK_SECRET=your-webhook-secret

# Asterisk — avr-asterisk container
ARI_URL=http://localhost:8088/ari
ARI_USERNAME=avr
ARI_PASSWORD=avr
AMI_URL=http://localhost:6006

# Asterisk config files location (relative to backend/)
ASTERISK_CONFIG_PATH=../asterisk

# Docker socket — Windows: //./pipe/docker_engine  Linux: /var/run/docker.sock
DOCKER_SOCKET_PATH=//./pipe/docker_engine

# Default avr-core image
CORE_DEFAULT_IMAGE=agentvoiceresponse/avr-core:latest
```

#### `avr-app/frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WEBRTC_CLIENT_URL=http://localhost:8080/index.html
```

### 4.4 Start Docker services

```bash
# One-time: create shared network
docker network create avr

# Asterisk PBX
docker run -d \
  --name avr-asterisk \
  --network avr \
  --restart unless-stopped \
  -p 5060:5060 -p 5060:5060/udp \
  -p 8088:8088 -p 8089:8089 \
  -p 5038:5038 \
  -v "$(pwd)/avr-app/asterisk/pjsip.conf:/etc/asterisk/my_pjsip.conf" \
  -v "$(pwd)/avr-app/asterisk/extensions.conf:/etc/asterisk/my_extensions.conf" \
  -v "$(pwd)/avr-app/asterisk/ari.conf:/etc/asterisk/my_ari.conf" \
  -v "$(pwd)/avr-app/asterisk/manager.conf:/etc/asterisk/my_manager.conf" \
  agentvoiceresponse/avr-asterisk

# AMI bridge
docker run -d \
  --name avr-ami \
  --network avr \
  --restart unless-stopped \
  -p 6006:6006 \
  -e PORT=6006 \
  -e AMI_HOST=avr-asterisk \
  -e AMI_PORT=5038 \
  -e AMI_USERNAME=avr \
  -e AMI_PASSWORD=avr \
  agentvoiceresponse/avr-ami
```

Verify:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
# avr-asterisk   Up X minutes
# avr-ami        Up X minutes

curl http://localhost:6006/health
# {"status":"healthy","asterisk":"connected"}
```

### 4.5 Start avr-sts-vapi

```bash
# Build the image (includes ViciDial 3-way transfer code)
cd avr-sts-vapi
docker build -t agentvoiceresponse/avr-sts-vapi .

# Run it — reads credentials from .env
docker run -d \
  --name avr-sts-vapi \
  --network avr \
  --restart unless-stopped \
  -p 6042:6042 \
  --env-file .env \
  agentvoiceresponse/avr-sts-vapi
cd ..
```

Or run directly with Node for development:

```bash
cd avr-sts-vapi
node index.js
# [avr-sts-vapi] Resamplers ready (8 kHz <-> 16 kHz)
# [avr-sts-vapi] Listening on port 6042
```

### 4.6 Start avr-app

Two terminals:

```bash
# Terminal 1 — Backend
cd avr-app/backend
npm run build
node --enable-source-maps dist/main
# [NestJS] Listening on http://localhost:3001

# Terminal 2 — Frontend
cd avr-app/frontend
npm run dev
# Next.js ready on http://localhost:3000
```

> **TypeORM `synchronize: true`** creates all database tables automatically on first boot.
> No migration commands needed.
> The admin user is auto-created from `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars.

Open **http://localhost:3000** → log in with `admin@agentvoiceresponse.com` / `agentvoiceresponse`.

---

## 5. VAPI configuration

### 5.1 Get your API keys

1. Go to [dashboard.vapi.ai](https://dashboard.vapi.ai) → **API Keys**
2. Copy the **Private Key** and **Public Key**

### 5.2 Create an Assistant

1. **Assistants → Create Assistant**
2. Set a **Name** (e.g. `ACS Sales Agent`)
3. Set **First Message** — what the AI says when the call is answered
4. Set **System Prompt** — your sales/qualification script
5. Under **Tools**, add the `transferCall` function:

```json
{
  "type": "function",
  "function": {
    "name": "transferCall",
    "description": "Transfer the qualified prospect to a human closer/verifier",
    "parameters": {
      "type": "object",
      "properties": {
        "phoneNumber": {
          "type": "string",
          "description": "Verifier phone number in E.164 format, e.g. +12125551234"
        },
        "message": {
          "type": "string",
          "description": "What the AI says while connecting (e.g. 'Connecting you now, please hold')"
        }
      },
      "required": ["phoneNumber"]
    }
  }
}
```

6. Copy the **Assistant ID** — you'll need it in `avr-sts-vapi/.env` and when creating an Agent in the admin panel.

### 5.3 Configure SIP Trunk in VAPI

This connects VAPI to your AVR Asterisk. Do this **after** ngrok is running (Step 6.3).

1. **Phone Numbers → Add → SIP Trunk**
2. **Hostname**: paste the ngrok host (e.g. `0.tcp.ngrok.io`)
3. **Port**: paste the ngrok port (e.g. `12345`)
4. **Assign to assistant**: select your ACS assistant
5. Save

---

## 6. ViciDial configuration

### 6.1 Create an Agent user for AVR

1. **Admin → Users → Add New User**
2. Set `User ID = 9001` (or any free ID)
3. Set a strong password
4. Set `User Level = 1` (Agent)
5. **Enable `Agent API Access = 1`** ← required for 3-way transfer
6. Save

### 6.2 Expose AVR Asterisk to ViciDial with ngrok

ViciDial must be able to reach your local AVR Asterisk. Use ngrok:

```bash
# One-time authtoken setup (free account at ngrok.com)
ngrok config add-authtoken YOUR_AUTH_TOKEN

# Start TCP tunnel
ngrok tcp 5060
# Forwarding tcp://0.tcp.ngrok.io:12345 -> localhost:5060
```

> **Note:** The ngrok address changes every time on the free plan. You must update the ViciDial carrier after each restart. [ngrok paid plans](https://ngrok.com/pricing) provide static TCP addresses.

### 6.3 Create a SIP Carrier

1. **Admin → Carriers → Add New Carrier**
2. `Carrier Name`: `AVR-AI`
3. `Protocol`: SIP
4. `Server IP`: ngrok host (e.g. `0.tcp.ngrok.io`)
5. `Port`: ngrok port (e.g. `12345`)
6. Save

> Update this every time ngrok restarts (if on free tier).

### 6.4 Configure your Campaign

1. **Campaigns → edit your outbound campaign**
2. `Dial Method`: RATIO or PREVIEW
3. `Dial Carrier`: AVR-AI
4. `AMD (Answering Machine Detection)`: Enabled
5. `AMD Sensitivity`: Conservative (recommended starting point — tunable via the ACS admin panel)
6. `Transfer Conference Number`: your verifier's phone number
7. Save

### 6.5 Enable Remote Agents mode

1. **Admin → System Settings**
2. Enable **Allow Remote Agents**
3. Save

---

## 7. In-app setup

Once `setup.ps1` (or manual setup) is complete, configure the admin panel:

### Step 1 — Add a Provider

1. **Providers → Add Provider**
2. **Type**: STS (Speech-to-Speech)
3. **Name**: `VAPI`
4. **Config** (JSON):
   ```json
   {
     "image": "agentvoiceresponse/avr-sts-vapi:latest",
     "env": {
       "VAPI_PRIVATE_KEY": "your-private-key",
       "VAPI_ASSISTANT_ID": "your-assistant-id"
     }
   }
   ```
5. Save

### Step 2 — Create an Agent

1. **Agents → Add Agent**
2. **Name**: e.g. `Sales Agent`
3. **Mode**: STS
4. **STS Provider**: VAPI (from Step 1)
5. **AMD Sensitivity**: conservative
6. Save

### Step 3 — Start the Agent

Click **Start** on the agent card.

This launches two Docker containers:
- `avr-core-<agent-id>` — AudioSocket bridge
- `avr-sts-<agent-id>` — VAPI STS connector

The agent status changes `stopped → starting → running`.

### Step 4 — Add a SIP Trunk

1. **Trunks → Add Trunk**
2. **Name**: `ViciDial`
3. **Host**: your ViciDial server hostname/IP
4. Save — backend writes Asterisk PJSIP config and reloads

### Step 5 — Add a Number

1. **Numbers → Add Number**
2. **Number/Extension**: your outbound DID or Asterisk extension
3. **Assign to**: the agent you created
4. Save — backend generates the Asterisk extensions.conf dialplan entry

---

## 8. How a call works end-to-end

```
 1. ViciDial dials a lead's phone number from the campaign list
        │
 2. Lead's phone rings and answers
        │
 3. ViciDial AMD (Answering Machine Detection) fires
        ├─── AMD = MACHINE / NOTSURE ─────────────────► hang up, log "voicemail"
        └─── AMD = HUMAN ─────────────────────────────► continue
        │
 4. ViciDial SIP carrier routes audio to AVR Asterisk via ngrok TCP:5060
        │
 5. Asterisk dialplan routes the channel to avr-core AudioSocket bridge
        │
 6. avr-core opens a WebSocket to avr-sts-vapi
        │
 7. avr-sts-vapi calls VAPI API → starts an AI WebSocket session
        │
        ├─── avr-sts-vapi upsamples audio 8 kHz → 16 kHz for VAPI
        └─── avr-sts-vapi downsamples VAPI audio 16 kHz → 8 kHz for Asterisk
        │
 8. VAPI AI answers, conducts the conversation
        │
        ├─── IVR detected (first transcript turn) ────► hang up, log "ivr"
        └─── AI decides to transfer ──────────────────► continue
        │
 9. VAPI calls the transferCall() tool
        │
10. avr-sts-vapi calls ViciDial conf_newcall API → verifier is dialed in
        │
11. Verifier answers → human conversation continues → AI exits
        │
12. Call ends → disposition written to DB
```

---

## 9. 3-way transfer deep-dive

Transfer is triggered by VAPI calling the `transferCall` function tool. All logic lives in `avr-sts-vapi/index.js`.

### Sequence

```
VAPI ──transferCall({phoneNumber, message})──► avr-sts-vapi
                                                     │
                                                     ▼
                          GET /vicidial/non_agent_api.php
                          ?function=agent_status
                          &agent_user=9001             ← retrieve ViciDial session ID
                                                     │
                                                     ▼
                          GET /vicidial/agc/api.php
                          ?action=conf_newcall
                          &session_id=<conf_exten>
                          &phone_number=+1XXXXXXXXXX   ← dial verifier into conference
                                                     │
                                                     ▼
                          ViciDial bridges lead ↔ verifier
                          VAPI SIP leg exits
                          AI speaks `message` then ends
```

### Requirements

- Agent user must have **Agent API Access = 1** in ViciDial admin
- Agent must be **actively logged in** to a ViciDial session when transfer fires
- `VICIDIAL_URL`, `VICIDIAL_AGENT_USER`, `VICIDIAL_AGENT_PASS` must be set in `avr-sts-vapi/.env`
- The `transferCall` tool must be registered on the VAPI assistant (see Section 5.2)

### Transfer failure handling

If the verifier is unreachable or the ViciDial API call fails, `avr-sts-vapi` logs the error and returns an error message string to VAPI. VAPI speaks the message and the call continues (AI stays on the line).

---

## 10. AMD sensitivity

AMD sensitivity controls how aggressively ViciDial's Answering Machine Detection fires.

| Value | Behaviour |
|---|---|
| `disabled` | AMD off — all calls passed to AI regardless |
| `conservative` | Only confident voicemail detections trigger hang-up (**default — recommended**) |
| `normal` | Standard sensitivity |
| `aggressive` | Hang up on any machine-like audio — higher false-positive rate |

### How it's applied

1. Set per-agent in **Agents → AMD Sensitivity** in the admin panel
2. When you click **Start** on an agent, the backend injects `AMD_SENSITIVITY` as an env var to the STS container
3. On startup, `avr-sts-vapi` calls `ViciDial non_agent_api.php?function=update_campaign&amd_sensitivity=<value>`
4. ViciDial applies the setting to the campaign immediately

---

## 11. Webapp pages

| Page | Path | Description |
|---|---|---|
| **Login** | `/login` | Email + password. JWT stored in memory (not localStorage). |
| **Overview** | `/overview` | Live summary — running agents, active calls, provider health |
| **Agents** | `/agents` | Create, configure, start/stop AI agents; AMD sensitivity setting |
| **Providers** | `/providers` | Add AI service providers (VAPI, OpenAI Realtime, Deepgram, etc.) with API keys |
| **Trunks** | `/trunks` | Manage Asterisk PJSIP SIP trunks |
| **Numbers** | `/numbers` | Map Asterisk extensions to agents |
| **Phones** | `/phones` | Browser-based WebRTC softphones (avr-phone) |
| **Calls** | `/calls` | Call log with disposition, duration, transcript |
| **Recordings** | `/recordings` | Browse and play back Asterisk call recordings |
| **Dockers** | `/dockers` | Live view of Docker containers managed by the backend |
| **Users** | `/users` | Admin panel user management (admin / manager / viewer roles) |

---

## 12. API reference

All endpoints require `Authorization: Bearer <token>` except `/auth/login` and `/health`.

### Authentication

```bash
# Login
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin@agentvoiceresponse.com","password":"agentvoiceresponse"}'
# → {"access_token":"eyJ...","user":{...}}

# Use the token
TOKEN="eyJ..."
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/agents
```

### Endpoints

| Resource | Method | Path | Description |
|---|---|---|---|
| **Auth** | POST | `/auth/login` | Returns JWT token |
| | GET | `/auth/me` | Current user |
| **Agents** | GET | `/agents` | List (paginated: `?page=1&limit=20`) |
| | POST | `/agents` | Create |
| | PUT | `/agents/:id` | Update |
| | DELETE | `/agents/:id` | Delete |
| | POST | `/agents/:id/run` | Start agent containers |
| | POST | `/agents/:id/stop` | Stop agent containers |
| **Providers** | GET/POST/PUT/DELETE | `/providers` | Manage AI providers |
| **Trunks** | GET/POST/PUT/DELETE | `/trunks` | Manage SIP trunks |
| **Numbers** | GET/POST/PUT/DELETE | `/numbers` | Manage extensions |
| **Phones** | GET/POST/PUT/DELETE | `/phones` | Manage softphones |
| **Calls** | GET | `/calls` | Call log (filters: `?campaign_id=&from=&to=&disposition=`) |
| | GET | `/calls/:id/transcript` | Call transcript |
| **Recordings** | GET | `/recordings` | List recordings |
| **Users** | GET/POST/PUT/DELETE | `/users` | Admin only |
| **Health** | GET | `/health` | Service health check |
| **Webhooks** | POST | `/webhooks` | VAPI event ingestion |

---

## 13. Environment variable reference

### `avr-sts-vapi/.env`

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | | `6042` | WebSocket server port |
| `VAPI_PRIVATE_KEY` | ✔ | — | VAPI private API key |
| `VAPI_PUBLIC_KEY` | | — | VAPI public key |
| `VAPI_ASSISTANT_ID` | ✔ | — | VAPI assistant to use for calls |
| `VICIDIAL_URL` | | — | ViciDial base URL — enables 3-way transfer when set |
| `VICIDIAL_USER` | | `admin` | ViciDial admin user for session lookup |
| `VICIDIAL_PASS` | | — | ViciDial admin password |
| `VICIDIAL_AGENT_USER` | | — | Agent user ID (e.g. `9001`) |
| `VICIDIAL_AGENT_PASS` | | — | Agent user password |
| `AMD_SENSITIVITY` | | `conservative` | `disabled` / `conservative` / `normal` / `aggressive` |

### `avr-app/backend/.env`

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | | `3001` | HTTP server port |
| `JWT_SECRET` | ✔ | — | Random 64-hex string — sign JWT tokens |
| `ADMIN_USERNAME` | | `admin@agentvoiceresponse.com` | First-boot admin email |
| `ADMIN_PASSWORD` | | — | First-boot admin password |
| `DB_TYPE` | | `sqlite` | Database type |
| `DB_DATABASE` | | `../data/data.db` | SQLite file path |
| `FRONTEND_URL` | | `http://localhost:3000` | CORS allowed origin |
| `WEBHOOK_URL` | | `http://localhost:3001/webhooks` | Where VAPI sends events |
| `WEBHOOK_SECRET` | | — | Validates incoming webhook signatures |
| `ARI_URL` | | `http://localhost:8088/ari` | Asterisk ARI endpoint |
| `ARI_USERNAME` | | `avr` | Asterisk ARI username |
| `ARI_PASSWORD` | | `avr` | Asterisk ARI password |
| `AMI_URL` | | `http://localhost:6006` | avr-ami bridge URL |
| `ASTERISK_CONFIG_PATH` | | `../asterisk` | Asterisk config directory |
| `DOCKER_SOCKET_PATH` | | `/var/run/docker.sock` | Docker socket (`//./pipe/docker_engine` on Windows) |
| `CORE_DEFAULT_IMAGE` | | `agentvoiceresponse/avr-core:latest` | avr-core image for agent containers |
| `CONNECTOR_READINESS_TIMEOUT_MS` | | `15000` | Max wait for container healthcheck |

### `avr-app/frontend/.env.local`

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✔ | — | Backend API base URL |
| `NEXT_PUBLIC_WEBRTC_CLIENT_URL` | | — | avr-phone WebRTC client URL |

---

## 14. Project structure

```
acs/
├── setup.ps1                        ← One-shot setup wizard (Windows)
├── start-all.ps1                    ← Start all services (after setup)
│
├── avr-app/
│   ├── backend/                     NestJS 11 API (port 3001)
│   │   ├── src/
│   │   │   ├── agents/              Agent CRUD · Docker lifecycle · AMD sensitivity
│   │   │   ├── auth/                JWT login · JwtAuthGuard · JwtStrategy
│   │   │   ├── asterisk/            ARI client · dialplan sync
│   │   │   ├── docker/              Dockerode container management
│   │   │   ├── numbers/             Asterisk extension → agent mapping
│   │   │   ├── phones/              WebRTC softphone sessions
│   │   │   ├── providers/           Provider config (VAPI, OpenAI, Deepgram, etc.)
│   │   │   ├── recordings/          Call recording access
│   │   │   ├── trunks/              SIP trunk management
│   │   │   ├── users/               User CRUD (admin only)
│   │   │   └── webhooks/            VAPI event ingestion
│   │   ├── .env.example
│   │   └── package.json
│   │
│   ├── frontend/                    Next.js 16 + React 19 (port 3000)
│   │   ├── app/
│   │   │   ├── (auth)/login/        Login page
│   │   │   └── (protected)/         All authenticated pages
│   │   │       ├── agents/
│   │   │       ├── calls/
│   │   │       ├── dockers/
│   │   │       ├── numbers/
│   │   │       ├── overview/
│   │   │       ├── phones/
│   │   │       ├── providers/
│   │   │       ├── recordings/
│   │   │       ├── trunks/
│   │   │       └── users/
│   │   ├── src/components/          shadcn/ui + custom components
│   │   ├── src/lib/                 Auth helpers · i18n (EN/IT)
│   │   ├── .env.example
│   │   └── package.json
│   │
│   └── asterisk/                    Asterisk config (auto-managed by backend)
│       ├── pjsip.conf
│       ├── extensions.conf
│       ├── ari.conf
│       └── manager.conf
│
├── avr-sts-vapi/                    VAPI STS WebSocket bridge (port 6042)
│   ├── index.js                     Audio bridge + 3-way transfer via ViciDial API
│   ├── Dockerfile
│   ├── .env.example
│   └── package.json
│
├── avr-ami/                         Asterisk AMI HTTP bridge (port 6006)
├── avr-asterisk/                    Asterisk 23 Docker image
├── avr-infra/                       Docker Compose stacks (multi-provider combos)
│
├── avr-asr-*/                       ASR connectors (Deepgram, Google, Vosk, etc.)
├── avr-llm-*/                       LLM connectors (OpenAI, Anthropic, n8n, etc.)
├── avr-tts-*/                       TTS connectors (ElevenLabs, OpenAI, Cartesia, etc.)
├── avr-sts-*/                       STS connectors (OpenAI RT, Ultravox, Gemini, etc.)
│
├── specs/ai-calling-agent/          SDD artifacts
│   ├── spec.md                      Feature requirements
│   ├── plan.md                      Architecture decisions (AD-1 through AD-4)
│   ├── tasks.md                     Implementation task list (T001–T085)
│   └── contracts/                   OpenAPI + WebSocket contracts
│
└── history/prompts/                 Prompt History Records (PHRs)
```

---

## 15. Development commands

```bash
# Backend — watch mode
cd avr-app/backend && npm run start:dev

# Backend — lint + unit tests
cd avr-app/backend && npm run lint && npm test

# Backend — single test file
cd avr-app/backend && npx jest src/agents/agents.service.spec.ts

# Frontend — dev server
cd avr-app/frontend && npm run dev

# Frontend — lint + build check
cd avr-app/frontend && npm run lint && npm run build

# Frontend — single test
cd avr-app/frontend && npx vitest run test/<file>

# avr-sts-vapi — run directly (dev)
cd avr-sts-vapi && node index.js

# avr-sts-vapi — rebuild Docker image
cd avr-sts-vapi && docker build -t agentvoiceresponse/avr-sts-vapi .
```

### CI quality gates

Two GitHub Actions workflows run on every PR:

| Workflow | File | What runs |
|---|---|---|
| Backend quality gate | `.github/workflows/backend-quality-gate.yml` | `npm run lint` + `npm test` |
| Frontend quality gate | `.github/workflows/frontend-quality-gate.yml` | `npm run lint` + `npm run build` |

---

## 16. Troubleshooting

### "Cannot connect to Docker daemon"

Docker Desktop is not running or the socket path is wrong.

```
# Windows — add to avr-app/backend/.env:
DOCKER_SOCKET_PATH=//./pipe/docker_engine

# Linux/macOS:
DOCKER_SOCKET_PATH=/var/run/docker.sock
```

Start Docker Desktop and wait for the tray icon to show **"Docker Desktop is running"**.

---

### Frontend blank page or auth redirect loop

```
# Check:
1. Backend is running on port 3001
2. avr-app/frontend/.env.local contains:
   NEXT_PUBLIC_API_URL=http://localhost:3001
3. No CORS error in browser console
```

---

### Asterisk ARI connection refused

```
Error: connect ECONNREFUSED 127.0.0.1:8088
```

```bash
# Is avr-asterisk running?
docker ps | grep avr-asterisk

# Check ARI is accessible
curl http://localhost:8088/ari/asterisk/info -u avr:avr

# Restart if needed
docker restart avr-asterisk
```

---

### avr-ami not healthy

```bash
curl http://localhost:6006/health
# {"status":"unhealthy","error":"..."}
```

- Both `avr-ami` and `avr-asterisk` must be on the same Docker network (`avr`)
- AMI port 5038 must be exposed on `avr-asterisk`
- Check: `docker logs avr-ami`

---

### Agent stuck in "starting"

```bash
# Pull the required image
docker pull agentvoiceresponse/avr-core:latest

# Check what Docker sees
docker ps -a | grep avr-

# Check backend logs for Dockerode errors
# (backend terminal output)
```

---

### ViciDial can't reach AVR Asterisk

- ngrok TCP tunnel must be running: `ngrok tcp 5060`
- ViciDial carrier **Server IP** and **Port** must match the current ngrok address
- On the free ngrok plan the address changes on every restart — update ViciDial after each restart
- Use `ngrok tcp 5060 --log=stdout` to see the address immediately

---

### 3-way transfer fails silently

Checklist:

```
✔  VICIDIAL_URL is set in avr-sts-vapi/.env
✔  VICIDIAL_AGENT_USER and VICIDIAL_AGENT_PASS are correct
✔  ViciDial agent user has "Agent API Access = 1"
✔  Agent is actively logged in to a ViciDial campaign session
✔  transferCall tool is added to the VAPI assistant
✔  docker logs avr-sts-vapi  — look for "Transfer failed:" lines
```

---

### ngrok "authtoken required" error

```bash
# Register a free account at https://ngrok.com
# Get your authtoken from https://dashboard.ngrok.com/get-started/setup

ngrok config add-authtoken YOUR_AUTH_TOKEN
ngrok tcp 5060
```

---

### Backend CRLF / Prettier lint errors on Windows

This is a Windows Git line-ending issue. Fix it once:

```bash
git config core.autocrlf false
git rm -r --cached avr-app/
git checkout avr-app/
```

Or add a `.gitattributes` file:

```
* text=auto eol=lf
```

---

*Built with [VAPI](https://vapi.ai) · [ViciDial](https://vicidial.org) · [AVR](https://github.com/agentvoiceresponse) · by Taimoor*
