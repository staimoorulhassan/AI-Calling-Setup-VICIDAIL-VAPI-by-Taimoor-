# Research: AI Calling Agent System

**Phase**: 0 — Research & Unknowns Resolution
**Date**: 2026-06-09
**Resolves OQ**: OQ-1, OQ-2, OQ-3, OQ-4 (partial), OQ-5 (partial)

---

## R-1: AVR Repository Selection (OQ-1, OQ-2)

**Decision:** Use `avr-ami` + `avr-infra` as the two core AVR repos. Build a thin custom adapter to bridge AVR's AudioSocket output to VAPI.

**Findings:**

| Repo | Role | Include? |
|------|------|----------|
| `avr-infra` | Asterisk AudioSocket connector; receives raw slin16 PCM from ViciDial's Asterisk; orchestrates the AVR core service layer | **YES — Asterisk audio bridge** |
| `avr-ami` | Node.js AMI client; handles call control (originate, hangup, transfer, conference) via Asterisk Manager Interface | **YES — call control layer** |
| `avr-asr-*` / `avr-tts-*` | STT/TTS modules (Google, Soniox, ElevenLabs, etc.) | **NO — VAPI replaces all of these** |
| `avr-sts-openai` / `avr-sts-gemini` | Real-time STS models | **NO — VAPI is the LLM/STS layer** |
| All other 40+ repos | Specific STT/TTS/LLM providers, UI, utilities | **NO — not needed for VAPI integration** |

**Key technical detail:** AVR's `avr-infra` uses Asterisk **AudioSocket** (TCP, raw slin16 PCM at 8 kHz). VAPI's WebSocket transport expects either PCM slin16 at 16 kHz or μ-law at 8 kHz. The custom adapter layer must transcode slin16@8kHz → mulaw@8kHz (1:1 sample rate, just encode change) before sending to VAPI.

**Sources:**
- `https://github.com/agentvoiceresponse/avr-infra`
- `https://github.com/agentvoiceresponse/avr-ami`
- VAPI WebSocket transport docs: `https://docs.vapi.ai/calls/websocket-transport`

**Confidence:** High

---

## R-2: ViciDial ↔ AI Agent Integration Pattern (OQ-1, OQ-2, OQ-5)

**Decision:** Use **SIP Trunk** for audio (ViciDial → VAPI), and **AMI** for call control (hangup, 3-way transfer, originate). This is the production-safe path.

**Findings:**

### Audio Path (two options evaluated)

| Approach | How It Works | Latency | Status |
|----------|-------------|---------|--------|
| **SIP Trunk** (chosen) | ViciDial dials `sip:assistant_id@sip.vapi.ai`; audio travels as standard SIP RTP. VAPI handles the call as an inbound SIP call. | ~200ms | Documented by VAPI |
| AudioSocket + WebSocket | Asterisk streams raw PCM to AVR service; AVR bridges to VAPI WebSocket. Requires 8kHz→16kHz transcoding. | ~100ms | Undocumented, fragile |

**SIP Trunk setup:**
1. In VAPI: create a SIP Trunk; whitelist ViciDial's public IP (e.g., `44.229.228.186/32`).
2. In ViciDial dialplan: add outbound route to `sip.vapi.ai` with `SIP/your_assistant_id@sip.vapi.ai`.
3. When ViciDial detects a live answer (AMD pass), it dials the VAPI SIP address; VAPI answers and AI agent takes the call.
4. ViciDial's AMD runs before the SIP leg is established — it fires on the prospect leg.

### Call Control (AMI)
- `avr-ami` connects to ViciDial's Asterisk via `AMI TCP port 5038`.
- For 3-way transfer: AMI `Originate` dials verifier into a `ConfBridge`; existing call is redirected into same bridge; VAPI SIP leg is hung up.
- For hangup (voicemail/IVR): AMI `Hangup` action on the prospect's channel.

### ViciDial Remote Agent Mode
- Register AI as a SIP extension on ViciDial.
- ViciDial treats the VAPI SIP endpoint as a "remote agent station".
- The Agent API (`AGENT_API.txt`) provides HTTP hooks for pause/resume/status of that station.

**Sources:**
- VAPI SIP Trunk: `https://docs.vapi.ai/advanced/sip/sip-trunk`
- ViciDial Agent API: `https://vicidial.org/docs/AGENT_API.txt`
- ViciStack AMI guide: `https://vicistack.com/blog/asterisk-ami-commands-guide/`

**Confidence:** High (SIP), Medium (AMI transfer flow — needs ViciDial ConfBridge verification)

---

## R-3: AMD and IVR Detection (OQ-2, OQ-3)

**Decision:** Use ViciDial's built-in Asterisk AMD for voicemail detection (configured in campaign settings). For IVR detection, use a secondary text-based classifier on VAPI's first transcript — if it reads as an IVR prompt, trigger hang-up via AMI.

**Findings:**

### Voicemail/AMD Detection
- ViciDial has native AMD integration via Asterisk's `AMD()` dialplan application.
- Configured per-campaign with parameters: `initialSilence`, `greeting`, `betweenWordsSilence`, `totalAnalysisTime`, `minimumWordLength`, `maximumNumberOfWords`.
- Accuracy: 70-80% (rule-based); upgradeable to 92-99% using external AI classifier on audio.
- **Chosen:** ViciDial native AMD for Phase 1 (simple, zero custom code). AMD fires before VAPI SIP leg — no AI tokens wasted on voicemails.
- If AMD result is `MACHINE` or `NOTSURE` → ViciDial does not bridge to VAPI → ACS logs `voicemail` disposition.
- AMD sensitivity exposed as a configurable parameter in ACS campaign settings (passed to ViciDial via API).

### IVR Detection
- VAPI has **no built-in IVR detection**.
- Approach: If AMD passes (`HUMAN`) but the call's first VAPI transcript turn contains IVR-pattern phrases ("press 1", "para español", "please hold", etc.), ACS backend triggers AMI hangup and logs `ivr` disposition.
- This is a lightweight regex/keyword classifier on the first 1-2 VAPI transcript events.
- Alternative (advanced): external AI audio classifier (Whisper + ML) inserted between Asterisk and VAPI — deferred to Phase 2.

**Sources:**
- Asterisk AMD: `https://docs.asterisk.org/Asterisk_16_Documentation/API_Documentation/Dialplan_Applications/AMD/`
- ViciStack AMD config: `https://vicistack.com/blog/vicidial-amd-guide/`
- AI-based AMD: `https://medium.com/@akhanriz/ai-based-answering-machine-detection-for-vicidial-freeswitch-and-asterisk-cb73320e7f28`
- VAPI IVR community: `https://vapi.ai/community/m/1360413780416139314`

**Confidence:** High (AMD at ViciDial layer), Medium (IVR text classifier — needs tuning)

---

## R-4: VAPI Audio Transport and Codec (resolves Audio Mismatch)

**Decision:** Use VAPI SIP trunk (not WebSocket) for audio. No codec transcoding needed — standard telephony G.711 μ-law over SIP.

**Findings:**

- VAPI SIP trunk accepts standard SIP calls with G.711 (μ-law / a-law) — the same codec ViciDial uses natively.
- VAPI WebSocket requires raw PCM binary at 16 kHz (slin16) — Asterisk AudioSocket provides 8 kHz slin16; 2× upsampling required. This path adds complexity.
- **Chosen path**: SIP avoids all codec translation concerns. ViciDial → SIP RTP → VAPI.
- The `avr-ami` repo remains in use for AMI-based call control; `avr-infra` is **not needed** for the SIP path (it is only needed for the AudioSocket path).

**Revised AVR inclusion:**

| Repo | Role | Include? |
|------|------|----------|
| `avr-ami` | AMI call control (hangup, originate, conference) | **YES** |
| `avr-infra` | AudioSocket bridge | **NOT NEEDED for SIP path; document as fallback** |

**Sources:**
- VAPI WebSocket: `https://docs.vapi.ai/calls/websocket-transport`
- VAPI SIP: `https://docs.vapi.ai/advanced/sip/sip-trunk`

**Confidence:** High

---

## R-5: Human Verifier Endpoint (OQ-5 — partially resolved)

**Decision:** Treat verifier endpoint as a configurable phone number per campaign. ViciDial AMI dials it into the ConfBridge.

**Findings:**
- Three options: (a) PSTN phone number, (b) SIP extension on ViciDial, (c) webapp softphone interface.
- **Chosen for Phase 1:** PSTN phone number stored in campaign config. AMI `Originate` dials verifier's number into a ConfBridge room. Simplest path; no additional WebRTC or SIP infrastructure needed.
- Phase 2 option: add a webapp WebRTC softphone (using VAPI's client SDK or a third-party WebRTC lib) so the verifier can accept the conference call in the browser.

**OQ-5 remains partially open:** Does the verifier want a phone call or a browser-based audio interface? Default to phone number; webapp softphone deferred to Phase 2.

**Confidence:** Medium (phone number approach confirmed; browser approach TBD)

---

## R-6: 3-Way Transfer Mechanism (resolves OQ-5)

**Decision:** Use Asterisk `ConfBridge` (via AMI) for 3-way transfer. VAPI call is hung up after verifier joins.

**Flow:**
1. Active call: Prospect ↔ VAPI (SIP channel on ViciDial).
2. Transfer trigger received by ACS backend (via VAPI tool call or webapp button).
3. ACS backend → AMI: create `ConfBridge` room; redirect prospect channel into it.
4. ACS backend → AMI: `Originate` verifier number into same `ConfBridge` room.
5. ACS backend → VAPI API: end the VAPI call (the AI drops).
6. Conference continues: Prospect ↔ Verifier.
7. ACS logs `transferred` disposition.

**Constraint:** ViciDial must be configured to allow AMI ConfBridge operations. This requires verification with a live ViciDial instance.

**Confidence:** Medium — AMI ConfBridge on ViciDial needs validation against actual instance.

---

## R-7: Technology Stack Confirmation

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Backend | Node.js + Express | Node 20 LTS | VAPI SDK, avr-ami, and VAPI webhooks are all Node-native |
| ORM/DB client | Prisma | latest | Type-safe, migration support, PostgreSQL |
| Database | PostgreSQL | 15+ | Relational, indexed, handles 1M+ rows |
| WebSocket server | ws or Socket.io | — | Real-time call board and transcript streaming |
| Auth | JWT + bcrypt | — | Stateless; works with REST API |
| Frontend | React 18 + Vite | — | Fast build, HMR, large ecosystem |
| Styling | Tailwind CSS 3 | — | Utility-first, no custom CSS maintenance |
| Charts | Recharts | — | React-native, lightweight |
| AMI client | `avr-ami` or `asterisk-manager` npm | — | AMI interaction for call control |
| VAPI SDK | `@vapi-ai/server-sdk` | — | Webhook handling, call management |

---

## Open Questions — Updated Status

| OQ | Status | Resolution |
|----|--------|-----------|
| OQ-1 | **RESOLVED** | Use `avr-ami` for AMI control; SIP Trunk for audio; `avr-infra` not needed |
| OQ-2 | **RESOLVED** | AMD via ViciDial native; IVR via VAPI transcript keyword classifier |
| OQ-3 | **RESOLVED** | IVR = regex/keyword on first VAPI transcript turn + AMI hangup |
| OQ-4 | Open (non-blocking) | LLM provider configurable via VAPI settings; recommend GPT-4o or Claude Haiku 4.5 |
| OQ-5 | **RESOLVED (Phase 1)** | Verifier = PSTN phone number in campaign config; browser softphone deferred |
| OQ-6 | Open (non-blocking) | ViciDial version: target 2.14-x, verify campaign/lead API format |
| OQ-7 | Open (non-blocking) | No additional compliance constraints stated beyond no inbound recording |
