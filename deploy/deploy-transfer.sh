#!/bin/bash
# Deploy ACS 3-Way Transfer feature to VPS.
# Run from repo root: bash deploy/deploy-transfer.sh
# Handles T002 T004 T006 T007

set -euo pipefail
# Set VPS to your server's IP or hostname before running
VPS="${ACS_VPS:-161.97.184.140}"

echo "=== ACS Transfer Deploy ==="

echo "[1/6] Creating service user and deploying AGI scripts..."
ssh root@"$VPS" '
  id acs &>/dev/null || useradd -r -s /sbin/nologin -d /opt/acs acs
  mkdir -p /opt/acs/agi
  chown -R acs:acs /opt/acs
'
scp agi/transfer_webhook.py agi/transfer_bridge.py agi/whisper.py root@"$VPS":/opt/acs/agi/
ssh root@"$VPS" "chown acs:acs /opt/acs/agi/*.py"

echo "[2/6] Installing Python dependencies..."
ssh root@"$VPS" "python3.11 -m pip install flask pyyaml panoramisk --quiet"

echo "[3/6] Deploying dialplan..."
scp dialplan/ai-transfer.conf root@"$VPS":/etc/asterisk/ai-transfer.conf

echo "[4/6] Adding dialplan include..."
ssh root@"$VPS" '
if ! grep -qF "ai-transfer.conf" /etc/asterisk/extensions.conf; then
  echo "#include \"/etc/asterisk/ai-transfer.conf\"" >> /etc/asterisk/extensions.conf
  echo "  Added include."
else
  echo "  Include already present."
fi
asterisk -rx "dialplan reload"
'

echo "[5/6] Installing acs-webhook systemd service..."
scp deploy/acs-webhook.service root@"$VPS":/etc/systemd/system/acs-webhook.service
ssh root@"$VPS" '
systemctl daemon-reload
systemctl enable acs-webhook
systemctl restart acs-webhook
systemctl is-active acs-webhook && echo "  Service: RUNNING" || echo "  Service: FAILED"
'

echo "[6/6] Opening firewall port 8088..."
ssh root@"$VPS" "firewall-cmd --add-port=8088/tcp --permanent && firewall-cmd --reload"

echo ""
echo "=== T002: Manual step ==="
echo "Edit /etc/ai_agent/config.yaml on VPS — add:"
echo "  transfer:"
echo "    verifier_number: \"+1XXXXXXXXXX\""
echo "    whisper_sound: \"acs-transfer\""
echo "    conf_bridge_timeout: 30"
echo "    webhook_port: 8088"
echo "    webhook_secret: \"<strong-random-string>\""
echo ""
echo "=== T008: Smoke test ==="
echo "curl -X POST http://$VPS:8088/webhooks/vapi/tool-call \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"message\":{\"type\":\"tool-call\",\"toolCallList\":[{\"id\":\"t1\",\"name\":\"request_transfer\",\"parameters\":{}}],\"call\":{\"id\":\"smoke-test-001\"}}}'"
