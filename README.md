# ACS — AI Calling System

> **ViciDial + AVR Bridge + VAPI** — production-ready outbound AI calling pipeline.  
> Dials leads, detects humans vs machines, routes live calls to a real-time AI agent, and writes dispositions back to ViciDial automatically.

Built and deployed by **Taimoor** on Contabo VPS (`161.97.184.140 · AlmaLinux 8.10`).

---

## System Architecture & Latency Map

![ACS Full System Dry Run](docs/acs-system-diagram.svg)

> **~930 ms** from lead picking up → first AI word spoken  
> (Groq GPT-OSS-20B at ~280 ms vs ~800 ms with Claude Haiku — **520 ms saved**)

---

## Call Flow

```
ai_campaign_runner
  └─ picks leads from vicidial_list (MySQL)
  └─ AMI Originate → Asterisk [ai-campaign-in]
       └─ Answer + MixMonitor (local recording)
       └─ AGI: precheck_amd.py
            ├─ MACHINE/DAIR → disposition.py → status A/DAIR → Hangup
            └─ HUMAN        → Dial(SIP/avr-bridge/s)
                                  └─ avr-asterisk (PJSIP, port 5062)
                                       └─ AudioSocket → avr-core
                                            └─ WebSocket → avr-sts-vapi
                                                 └─ VAPI /call/web (PUBLIC key)
                                                      ├─ STT  ~120 ms
                                                      ├─ LLM  ~280 ms  (Groq GPT-OSS-20B)
                                                      └─ TTS  ~200 ms
       └─ h-exten: disposition.py → update_lead (SCHDL / NI / DROP / ...)
```

---

## Repository Layout

```
agi/
  precheck_amd.py          # AGI: AMD + handoff decision
  disposition.py           # AGI: writes lead status to ViciDial API
  ai_campaign_runner.py    # Async campaign runner (panoramisk + pymysql)

dialplan/
  ai-campaign.conf         # [ai-campaign-in] context -- paste into Asterisk

config/
  config.yaml.example      # Copy to /etc/ai_agent/config.yaml and fill in

infra/
  avr-infra/
    docker-compose-vapi.yml        # 4-container AVR stack
    extensions.container.conf      # avr-asterisk dialplan
  asterisk-host/
    snippets.conf                  # [avr-bridge] SIP peer + [ai-test-go] context

docs/
  acs-system-diagram.svg   # Full architecture + latency map
```

---

## Prerequisites

| Component | Version | Notes |
|---|---|---|
| AlmaLinux / CentOS | 8+ | ViciDial scratch install |
| Asterisk | 18.x-vici | chan_sip, AMD, AudioSocket, AGI |
| ViciDial | 2.14-873a+ | non_agent_api.php enabled |
| Docker Engine | 24+ | For AVR stack |
| Python | 3.11 | AGI scripts + runner |
| SignalWire | any | SIP trunk (`asterisk-acs`) |
| VAPI account | — | Public key + assistant ID |

---

## Deployment

### 1 — Clone

```bash
git clone https://github.com/staimoorulhassan/AI-Calling-Setup-VICIDAIL-VAPI-by-Taimoor-.git
cd AI-Calling-Setup-VICIDAIL-VAPI-by-Taimoor-
```

### 2 — AGI scripts

```bash
cp agi/precheck_amd.py  /var/lib/asterisk/agi-bin/
cp agi/disposition.py   /var/lib/asterisk/agi-bin/
chmod +x /var/lib/asterisk/agi-bin/precheck_amd.py \
          /var/lib/asterisk/agi-bin/disposition.py
chown asterisk:asterisk /var/lib/asterisk/agi-bin/precheck_amd.py \
                         /var/lib/asterisk/agi-bin/disposition.py

python3.11 -m pip install pyst2 pyyaml requests panoramisk pymysql
```

### 3 — Campaign runner

```bash
cp agi/ai_campaign_runner.py /usr/local/bin/ai_campaign_runner
chmod +x /usr/local/bin/ai_campaign_runner
```

### 4 — Config file

```bash
mkdir -p /etc/ai_agent
cp config/config.yaml.example /etc/ai_agent/config.yaml
# Fill in: vicidial api_user/api_pass, ami username/secret
```

Minimum `/etc/ai_agent/config.yaml`:

```yaml
vicidial:
  api_url: "https://127.0.0.1/vicidial/non_agent_api.php"
  api_user: "YOUR_VICIDIAL_API_USER"
  api_pass: "YOUR_VICIDIAL_API_PASS"
  verify_tls: false

ami:
  host: "127.0.0.1"
  port: 5038
  username: "YOUR_AMI_USER"
  secret:   "YOUR_AMI_SECRET"

outbound:
  caller_id_num:  "1XXXXXXXXXX"
  caller_id_name: "AI Agent"
```

### 5 — Dialplan

```bash
cp dialplan/ai-campaign.conf /etc/asterisk/ai-campaign.conf
echo '#include "ai-campaign.conf"' >> /etc/asterisk/extensions.conf
asterisk -rx "dialplan reload"
```

### 6 — Asterisk SIP peer (avr-bridge)

Add the `[avr-bridge]` stanza from `infra/asterisk-host/snippets.conf` to  
`/etc/asterisk/sip-vicidial.conf`, then:

```bash
asterisk -rx "sip reload"
```

### 7 — AVR Docker stack

```bash
cp infra/avr-infra/docker-compose-vapi.yml /opt/avr/avr-infra/
# Edit /opt/avr/avr-infra/.env:
#   VAPI_PUBLIC_KEY=<your-vapi-public-key>
#   VAPI_ASSISTANT_ID=<your-assistant-id>
cd /opt/avr/avr-infra
docker compose -f docker-compose-vapi.yml up -d
```

### 8 — Wire ViciDial campaign

In **ViciDial Admin → Campaigns → [your campaign]**:

| Field | Value |
|---|---|
| Dial Method | RATIO or MANUAL |
| Campaign Dialplan Entry | `exten => _X.,1,Goto(ai-campaign-in,s,1)` |
| Drop In-Group | *(leave blank — dialplan handles it)* |

---

## Running the Campaign

```bash
# Dry run -- verifies DB + AMI connection, no actual calls
ai_campaign_runner --list 786 --campaign AI_CAMP --dry-run --verbose

# Live -- 2 concurrent calls, 1 new call every 30 s
ai_campaign_runner --list 786 --campaign AI_CAMP \
                   --concurrent 2 --rate 30 --statuses NEW,A

# Limit to 50 leads for a batch test
ai_campaign_runner --list 786 --concurrent 3 --limit 50
```

**Lead status flow:**

```
NEW → QUEUE (pre-originate) → AI (post-originate)
  └─ after call:
       A      answering machine (AMD detected)
       DAIR   dead air
       SCHDL  appointment booked (AI tool-call)
       NI     not interested
       DROP   hung up early
```

---

## Recordings

Every bridged call is recorded via `MixMonitor`:

```
/var/spool/asterisk/monitorDONE/ORIG/YYYY-MM-DD/ai-YYYYMMDD-HHMMSS-{lead_id}.wav
```

Browse and download via Apache (basic auth):

```
https://161.97.184.140/recordings/
```

---

## Latency Breakdown

| Stage | Time |
|---|---|
| SIP dial + answer | ~80 ms |
| AMD detection | ~200 ms |
| AudioSocket → avr-core | ~50 ms |
| VAPI STT | ~120 ms |
| Groq GPT-OSS-20B LLM | ~280 ms |
| VAPI TTS | ~200 ms |
| **Total (answer → first AI word)** | **~930 ms** |

> Previous with Claude Haiku 4.5: ~1,450 ms → **520 ms improvement** from model switch alone.

---

## Key Files on VPS

| Path | Purpose |
|---|---|
| `/etc/ai_agent/config.yaml` | AMI, ViciDial API, outbound CID |
| `/opt/avr/avr-infra/.env` | VAPI public key + assistant ID |
| `/opt/avr/avr-infra/docker-compose-vapi.yml` | AVR 4-container stack |
| `/etc/asterisk/ai-campaign.conf` | Campaign dialplan |
| `/etc/asterisk/sip-vicidial.conf` | avr-bridge SIP peer |
| `/var/lib/asterisk/agi-bin/precheck_amd.py` | AMD AGI |
| `/var/lib/asterisk/agi-bin/disposition.py` | Disposition AGI |
| `/usr/local/bin/ai_campaign_runner` | Campaign runner binary |
| `/etc/httpd/conf.d/recordings.conf` | Apache recordings alias |

---

## Security Notes

- `.env` and real `config.yaml` are **never committed** — see `.gitignore`
- VAPI logs and call recording in VAPI are **disabled** — recordings stored locally only
- ViciDial API runs over `https://127.0.0.1` (self-signed cert, `verify_tls: false`)
- AMI access is localhost-only (`127.0.0.1:5038`)

---

## Release

See [RELEASE-1.0.1.md](RELEASE-1.0.1.md) for full v1.0.1 change log and deployment checklist.

---

*Built with ViciDial · Asterisk 18 · AVR Bridge · VAPI · Groq · SignalWire · Docker*
