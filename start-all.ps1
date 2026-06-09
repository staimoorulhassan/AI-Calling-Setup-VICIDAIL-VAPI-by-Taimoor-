# ACS Full Stack Startup Script
# Run from: C:\Users\Taimoor\OneDrive\Desktop\Agentic Calling System ACS by Tamur\
# Usage: .\start-all.ps1

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$BACKEND = "$ROOT\avr-app\backend"
$FRONTEND = "$ROOT\avr-app\frontend"
$VAPI_STS = "$ROOT\avr-sts-vapi"

Write-Host "=== ACS Startup ===" -ForegroundColor Cyan

# 1. Docker network
Write-Host "`n[1] Ensuring avr Docker network..." -ForegroundColor Yellow
docker network create avr 2>$null
Write-Host "    avr network ready"

# 2. Build avr-sts-vapi image (with ViciDial support)
Write-Host "`n[2] Building avr-sts-vapi image..." -ForegroundColor Yellow
Set-Location $VAPI_STS
docker build --platform linux/amd64 -t agentvoiceresponse/avr-sts-vapi .
if ($LASTEXITCODE -ne 0) { Write-Host "    BUILD FAILED" -ForegroundColor Red; exit 1 }
Write-Host "    Image built" -ForegroundColor Green

# 3. Start avr-asterisk
Write-Host "`n[3] Starting avr-asterisk..." -ForegroundColor Yellow
docker rm -f avr-asterisk 2>$null
docker run -d `
  --name avr-asterisk `
  --network avr `
  -p 5060:5060 `
  -p 5060:5060/udp `
  -p 8088:8088 `
  -p 8089:8089 `
  -p 5038:5038 `
  -v "$ROOT/avr-app/asterisk/pjsip.conf:/etc/asterisk/my_pjsip.conf" `
  -v "$ROOT/avr-app/asterisk/extensions.conf:/etc/asterisk/my_extensions.conf" `
  -v "$ROOT/avr-app/asterisk/ari.conf:/etc/asterisk/my_ari.conf" `
  -v "$ROOT/avr-app/asterisk/manager.conf:/etc/asterisk/my_manager.conf" `
  -v "$ROOT/avr-app/asterisk/queues.conf:/etc/asterisk/my_queues.conf" `
  agentvoiceresponse/avr-asterisk
if ($LASTEXITCODE -ne 0) { Write-Host "    avr-asterisk FAILED" -ForegroundColor Red; exit 1 }
Write-Host "    avr-asterisk started" -ForegroundColor Green

# 4. Start avr-ami
Write-Host "`n[4] Starting avr-ami..." -ForegroundColor Yellow
docker rm -f avr-ami 2>$null
docker run -d `
  --name avr-ami `
  --network avr `
  -p 6006:6006 `
  -e PORT=6006 `
  -e AMI_HOST=avr-asterisk `
  -e AMI_PORT=5038 `
  -e AMI_USERNAME=avr `
  -e AMI_PASSWORD=avr `
  agentvoiceresponse/avr-ami
if ($LASTEXITCODE -ne 0) { Write-Host "    avr-ami FAILED" -ForegroundColor Red; exit 1 }
Write-Host "    avr-ami started" -ForegroundColor Green

# 5. Start backend
Write-Host "`n[5] Starting NestJS backend (port 3001)..." -ForegroundColor Yellow
Set-Location $BACKEND
$backendJob = Start-Process -FilePath "node" `
  -ArgumentList "--enable-source-maps dist\main" `
  -WorkingDirectory $BACKEND `
  -NoNewWindow `
  -PassThru
Write-Host "    Backend PID $($backendJob.Id)" -ForegroundColor Green

# 6. Start frontend
Write-Host "`n[6] Starting Next.js frontend (port 3000)..." -ForegroundColor Yellow
Set-Location $FRONTEND
$frontendJob = Start-Process -FilePath "npm" `
  -ArgumentList "run dev" `
  -WorkingDirectory $FRONTEND `
  -NoNewWindow `
  -PassThru
Write-Host "    Frontend PID $($frontendJob.Id)" -ForegroundColor Green

Write-Host "`n=== All services started ===" -ForegroundColor Cyan
Write-Host "  Frontend:  http://localhost:3000" -ForegroundColor White
Write-Host "  Backend:   http://localhost:3001" -ForegroundColor White
Write-Host "  AMI:       http://localhost:6006" -ForegroundColor White
Write-Host "  Asterisk:  SIP port 5060, ARI port 8088" -ForegroundColor White
Write-Host ""
Write-Host "Login: admin@agentvoiceresponse.com / agentvoiceresponse" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Run: ngrok tcp 5060   (to expose Asterisk to ViciDial)"
Write-Host "  2. In avr-app: create Provider (vapi) + Agent + start agent"
Write-Host "  3. In avr-app: create Trunk (vici-trunk) + Number linked to agent"
Write-Host "  4. Configure ViciDial carrier with ngrok address"

Set-Location $ROOT
