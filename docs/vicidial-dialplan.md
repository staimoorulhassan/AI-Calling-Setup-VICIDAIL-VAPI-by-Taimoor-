# ViciDial + VAPI Integration Guide

This guide covers the ViciDial-side configuration required to connect outbound calls to the VAPI AI agent via SIP trunk.

---

## Architecture Overview

```
ViciDial Dialer
  └─► Asterisk Dialplan (AMD + SIP)
        └─► SIP Trunk → sip.vapi.ai
              └─► VAPI AI Agent (STT / LLM / TTS)
                    └─► VAPI Webhook → ACS Backend
                          └─► avr-ami HTTP API → AMI
```

---

## 1. SIP Trunk Configuration

Add a SIP peer in `/etc/asterisk/sip.conf` (or `pjsip.conf` for PJSIP):

```ini
[vapi-trunk]
type=peer
host=sip.vapi.ai
port=5060
username=YOUR_VAPI_ASSISTANT_ID
secret=YOUR_VAPI_SIP_SECRET
fromuser=YOUR_VAPI_ASSISTANT_ID
fromdomain=sip.vapi.ai
insecure=port,invite
disallow=all
allow=ulaw
allow=alaw
dtmfmode=rfc2833
nat=force_rport,comedia
qualify=yes
```

Reload SIP: `asterisk -rx "sip reload"`

---

## 2. Dialplan (extensions.conf)

Add a context for outbound VAPI calls:

```ini
[acs-outbound]
; AMD fires before this context — only answered calls reach here
exten => _X.,1,NoOp(ACS outbound call to ${EXTEN})
 same => n,Set(CALLERID(num)=${VICI_CALLERID})
 same => n,Set(CALLERID(name)=ACS Agent)
 same => n,Dial(SIP/YOUR_VAPI_ASSISTANT_ID@vapi-trunk/${EXTEN},60,g)
 same => n,Hangup()
```

---

## 3. AMD (Answering Machine Detection)

ViciDial applies AMD natively at the Asterisk level before transferring to the agent context. Configure AMD sensitivity in ViciDial Admin → Campaigns → AMD:

| Setting | Value |
|---------|-------|
| AMD Action | HUP (hang up on machine) |
| Sensitivity | Match your campaign's `amd_sensitivity` field (low/medium/high) |
| Max Machine Wait | 5000 ms |
| Silence Threshold | 256 |

When AMD fires `MACHINE` or `NOTSURE`, ViciDial hangs up the channel before the VAPI SIP leg is established. The ACS backend tracks this via the `voicemail` disposition path in `call.service.ts`.

> **Note:** If `amd_sensitivity = low`, more voicemails will be passed to the agent. If `high`, more live answers may be dropped. Tune per campaign.

---

## 4. Campaign Configuration in ViciDial

In ViciDial Admin → Campaigns:

| Field | Value |
|-------|-------|
| Dial Method | RATIO or PREVIEW |
| Dial Prefix | (empty, or 9 for PSTN) |
| Campaign CID | Your desired outbound Caller ID |
| AMD | ENABLED |
| Transfer Context | `acs-outbound` |
| Agent Script | Optional — operators see prospect info here |

---

## 5. Remote Agent Registration

For remote agents (human verifiers) who join the 3-way ConfBridge:

1. In ViciDial Admin → User Management → Add User, set:
   - User Level: 1 (agent)
   - Phone Login: SIP extension or DID
   - VoIP Phone IP: Agent's IP or `dynamic`
   - Phone Protocol: SIP

2. The verifier's phone number must match the `verifier_phone` field on the Campaign record in the ACS database.

3. When `transfer.service.ts` calls `amiOriginate()`, it dials `verifier_phone` into the active ConfBridge room alongside the prospect.

---

## 6. avr-ami Configuration

The ACS backend communicates with Asterisk via the [avr-ami](https://github.com/agentvoiceresponse/avr-ami) HTTP microservice. Set these in `.env`:

```env
AVR_AMI_URL=http://localhost:6006
AMI_HOST=127.0.0.1
AMI_PORT=5038
AMI_USER=acs_user
AMI_PASSWORD=CHANGE_ME
```

In `/etc/asterisk/manager.conf`, add:

```ini
[acs_user]
secret=CHANGE_ME
deny=0.0.0.0/0.0.0.0
permit=127.0.0.1/255.255.255.255
read=all
write=all
```

Reload AMI: `asterisk -rx "manager reload"`

---

## 7. Verification Checklist

- [ ] SIP peer `vapi-trunk` shows `OK` in `asterisk -rx "sip show peers"`
- [ ] Test call from ViciDial reaches VAPI (`asterisk -rx "sip show channels"` shows active channel)
- [ ] AMD triggers hang-up for a real voicemail — `calls` table shows `disposition = voicemail`
- [ ] IVR phrase in VAPI transcript triggers hang-up — `disposition = ivr`
- [ ] Manual transfer via ACS Dashboard originates verifier into ConfBridge
- [ ] Verifier hears prospect; prospect hears verifier; AI is disconnected
- [ ] `avr-ami` health check (`GET /api/health`) returns `{"ami":{"status":"healthy"}}`
