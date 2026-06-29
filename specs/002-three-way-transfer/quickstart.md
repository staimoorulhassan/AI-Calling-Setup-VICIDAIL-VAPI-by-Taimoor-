# Quickstart: 3-Way Transfer

## 1. Deploy to VPS

```bash
cd /path/to/acs-clean
bash deploy/deploy-transfer.sh
```

This installs AGI scripts, Flask, dialplan, and the systemd service.

## 2. Configure VPS

SSH into VPS and add the `transfer` block to `/etc/ai_agent/config.yaml`:

```yaml
transfer:
  verifier_number: "+17543463674"   # your real verifier number
  whisper_sound: "acs-transfer"
  conf_bridge_timeout: 30
  webhook_port: 8088
  webhook_secret: "your-strong-secret"
```

Then restart the webhook server:
```bash
systemctl restart acs-webhook
systemctl status acs-webhook
```

## 3. Generate whisper sound (optional)

```bash
bash deploy/generate-whisper-sound.sh
```

If flite/espeak is unavailable, record the phrase manually:
> "Connecting you to our customer. Please stand by."

Save as `/var/lib/asterisk/sounds/custom/acs-transfer.wav`.

## 4. Open firewall for port 8088

```bash
firewall-cmd --add-port=8088/tcp --permanent && firewall-cmd --reload
```

## 5. Smoke test (no live call needed)

```bash
curl -X POST http://161.97.184.140:8088/webhooks/vapi/tool-call \
  -H 'Content-Type: application/json' \
  -H 'x-vapi-secret: your-strong-secret' \
  -d '{
    "message": {
      "type": "tool-call",
      "toolCallList": [{"id":"t1","name":"request_transfer","parameters":{"lead_name":"Test Lead","product_name":"Solar"}}],
      "call": {"id": "smoke-test-001"}
    }
  }'
# Expected: {"results":[{"toolCallId":"t1","result":"Transfer initiated..."}],"status":"initiated"}
# (Will get 410 if no active channel — that's correct behavior for dry run)
```

## 6. Live end-to-end test

1. Run campaign: `python3 agi/ai_campaign_runner.py --list 786 --campaign AI_CAMP --concurrent 1 --rate 30 --statuses NEW`
2. Answer the call as the lead
3. When AI asks about interest, say "Yes, I want to proceed"
4. VAPI fires `request_transfer` → webhook hits → verifier phone rings
5. Verifier answers → hears whisper → lead and verifier talk
6. After all hang up: `SELECT status FROM vicidial_list WHERE lead_id=<id>` → `SCHDL`

## 7. Register VAPI tool (Phase 8)

In VAPI dashboard → Assistant `ann` → Tools → Add Function:

| Field | Value |
|---|---|
| Name | `request_transfer` |
| Description | Transfer the lead to a human verifier when they express clear interest in moving forward. |
| Server URL | `http://161.97.184.140:8088/webhooks/vapi/tool-call` |
| Parameter: `lead_name` | type: string, optional |
| Parameter: `product_name` | type: string, optional |

Also set **Server Secret** to match `transfer.webhook_secret` in config.yaml.
