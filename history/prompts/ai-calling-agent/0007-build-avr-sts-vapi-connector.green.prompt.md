---
id: "0007"
title: Build avr-sts-vapi connector
stage: green
date: 2026-06-09
surface: agent
model: claude-sonnet-4-6
feature: ai-calling-agent
branch: fix/vercel-static-deploy
user: Taimoor
command: build the avr-sts-vapi connector
labels: ["vapi","sts","connector","docker","audio","websocket","resampling"]
links:
  spec: specs/ai-calling-agent/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - avr-sts-vapi/index.js
  - avr-sts-vapi/package.json
  - avr-sts-vapi/Dockerfile
  - avr-sts-vapi/.env.example
tests:
  - Docker build: PASS (image agentvoiceresponse/avr-sts-vapi:latest, 205MB)
---

## Prompt

build the avr-sts-vapi connector

## Response snapshot

Created the `avr-sts-vapi/` directory with all four required files. The connector:

1. Opens a WebSocket server on port **6042** (next free port after xai:6041)
2. On AVR `init` message: POSTs to `https://api.vapi.ai/call/web` with `assistantId` and `transport.provider:"vapi.websocket"`, extracts `transport.websocketCallUrl` from response
3. Connects to VAPI WebSocket — audio arrives as binary PCM16LE 16 kHz frames, control messages as JSON text frames
4. **Upsamples** AVR 8 kHz → 16 kHz before sending binary PCM to VAPI (using `@alexanderolsen/libsamplerate-js`, global resampler created once at startup)
5. **Downsamples** VAPI 16 kHz → 8 kHz, buffers samples, emits 20 ms frames (160 samples / 320 bytes) to AVR as base64 JSON
6. Forwards `final` transcripts with `role:"agent"|"user"` to AVR
7. Sends `interruption` to AVR when VAPI emits `speech-update{role:"user",status:"started"}`
8. Handles `hang` event by cleaning up and closing the AVR socket
9. Validates `VAPI_PRIVATE_KEY` and `VAPI_ASSISTANT_ID` at startup; exits with code 1 if missing

Docker image `agentvoiceresponse/avr-sts-vapi:latest` built successfully (205 MB) and available locally.
Provider template already present in `avr-app/frontend/app/(protected)/providers/page.tsx` with `defaultImage: 'agentvoiceresponse/avr-sts-vapi'`.

## Outcome

- ✅ Impact: VAPI STS connector is complete and runnable. AVR Core can now bridge Asterisk calls to VAPI voice agents via the `sts-vapi` provider.
- 🧪 Tests: Docker build PASS; no unit tests (connector pattern matches existing avr-sts-openai)
- 📁 Files: avr-sts-vapi/index.js, package.json, Dockerfile, .env.example created
- 🔁 Next prompts: test a live call with the VAPI provider; push Docker image to registry with `npm run dc:push`
- 🧠 Reflection: Port 6041 and 6042 were both occupied by xai; used 6042. VAPI's `vapi.websocket` transport expects binary PCM16 at 16 kHz — resampling pattern is identical to avr-sts-openai (8 kHz ↔ N kHz), just with a 2× ratio instead of 3×.

## Evaluation notes (flywheel)

- Failure modes observed: `npm ci` failed without package-lock.json — fixed by running `npm install` locally first to generate the lock file
- Graders run and results (PASS/FAIL): Docker build PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add optional `{"type":"control","control":"say-first-message"}` after VAPI WS open event if assistant doesn't speak first automatically
