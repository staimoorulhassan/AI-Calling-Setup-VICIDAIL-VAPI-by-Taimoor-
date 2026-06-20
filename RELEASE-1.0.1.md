# Release 1.0.1 — AI Calling System (ViciDial + AVR + VAPI)

## What works in this release
- ViciDial Asterisk on AlmaLinux 8 (host) with SignalWire SIP trunk registered
- AVR bridge stack (4 containers on `avr` Docker network):
  - avr-asterisk (PJSIP, AudioSocket on :5001)
  - avr-core (AudioSocket → WebSocket → STS)
  - avr-sts-vapi (WebSocket ↔ VAPI Daily.co)
  - avr-ami
- Working call path verified end-to-end (73s+ conversations):
  `ViciDial Asterisk → SignalWire → caller phone ↔ avr-bridge → avr-asterisk → avr-core → avr-sts-vapi → VAPI assistant`
- VAPI assistant `ann` set to Groq `gpt-oss-20b` (280ms model latency, ~780ms total)
- Apache `/recordings/` endpoint with basic-auth for downloading MixMonitor WAVs
- AGI scripts for cost-saving precheck + ViciDial disposition (new in 1.0.1)

## What's new in 1.0.1
- `agi/precheck_amd.py` — runs Asterisk's built-in AMD; skips VAPI on
  answering machine / dead air (saves VAPI minutes on bad pickups).
- `agi/disposition.py` — writes lead status (A / DAIR / NI / SCHDL / UNWK / DROP)
  back to ViciDial via `non_agent_api.php`.
- `dialplan/ai-campaign.conf` — wires precheck → AI handoff → disposition into
  one campaign context.
- `config/config.yaml.example` — single YAML for ViciDial API + assistant ID.
- `.env.example` — sanitized; no real keys committed.
- Working configs pulled from the live VPS into `infra/`.

## Deploy steps (host)
```bash
# 1. AGI scripts
sudo cp agi/*.py /var/lib/asterisk/agi-bin/
sudo chmod +x /var/lib/asterisk/agi-bin/precheck_amd.py /var/lib/asterisk/agi-bin/disposition.py
sudo pip3 install pyst2 pyyaml requests

# 2. Dialplan
sudo cp dialplan/ai-campaign.conf /etc/asterisk/
echo '#include "ai-campaign.conf"' | sudo tee -a /etc/asterisk/extensions.conf
sudo asterisk -rx 'dialplan reload'

# 3. Config
sudo mkdir -p /etc/ai_agent
sudo cp config/config.yaml.example /etc/ai_agent/config.yaml
sudo $EDITOR /etc/ai_agent/config.yaml    # fill in real ViciDial API user/pass

# 4. AVR stack (already running if you followed earlier setup)
cd /opt/avr/avr-infra
cp .env.example .env
$EDITOR .env                              # fill in real VAPI keys
docker compose -f docker-compose-vapi.yml up -d
```

## Known limitations
- ~800ms end-to-end latency from the AVR-stack architecture. To get below that,
  switch to direct SignalWire → VAPI SIP (avoid the AVR bridge entirely).
- VPS is in Germany; SignalWire in US adds ~150ms each way.
- `precheck_amd` is dialplan-only — won't help on direct-SIP-to-VAPI path.

## Credits
Adapted from production setup on Contabo VPS 161.97.184.140.
