#!/usr/bin/env pwsh
# =============================================================================
#  ACS — Agentic Calling System  ·  One-Shot Setup Wizard
#  Run from repo root:  .\setup.ps1
# =============================================================================
#  What this script does:
#    1. Checks & installs prerequisites  (Node 20, Docker, Git, ngrok)
#    2. Guides you through VAPI account + assistant creation
#    3. Guides you through ViciDial SIP trunk + agent configuration
#    4. Collects all API keys / credentials interactively
#    5. Writes .env files  (avr-sts-vapi, backend, frontend)
#    6. Installs npm packages  (backend + frontend)
#    7. Starts Docker services  (avr-asterisk, avr-ami)
#    8. Builds & runs  avr-sts-vapi  container
#    9. Starts the NestJS backend + Next.js frontend
#   10. Starts ngrok TCP tunnel on port 5060
#   11. Guides you through in-app configuration
# =============================================================================
$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

# ─── working directory ────────────────────────────────────────────────────────
$ROOT     = Split-Path $MyInvocation.MyCommand.Path -Parent
$BACKEND  = Join-Path $ROOT  "avr-app\backend"
$FRONTEND = Join-Path $ROOT  "avr-app\frontend"
$STS_VAPI = Join-Path $ROOT  "avr-sts-vapi"

# ─── helpers ──────────────────────────────────────────────────────────────────
function Write-Banner {
    Clear-Host
    Write-Host ""
    Write-Host "  ╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║    ACS  ·  Agentic Calling System  ·  Setup Wizard  v1.0     ║" -ForegroundColor Cyan
    Write-Host "  ║    ViciDial  +  VAPI  +  AVR Asterisk  +  Admin Webapp       ║" -ForegroundColor Cyan
    Write-Host "  ╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Section { param([int]$n, [string]$title)
    Write-Host ""
    Write-Host ("  ┌─ STEP {0} ─────────────────────────────────────────────────────" -f $n) -ForegroundColor Yellow
    Write-Host ("  │  {0}" -f $title) -ForegroundColor Yellow
    Write-Host "  └────────────────────────────────────────────────────────────────" -ForegroundColor Yellow
    Write-Host ""
}

function Write-Guide { param([string[]]$lines)
    foreach ($l in $lines) {
        if ($l -eq "") { Write-Host "" }
        elseif ($l.StartsWith("##")) { Write-Host ("  " + $l.Substring(2).TrimStart()) -ForegroundColor Cyan }
        elseif ($l.StartsWith("#"))  { Write-Host ("  " + $l.Substring(1).TrimStart()) -ForegroundColor White }
        elseif ($l.StartsWith("!"))  { Write-Host ("  ⚠  " + $l.Substring(1).TrimStart()) -ForegroundColor Red }
        else                         { Write-Host ("  │  " + $l) -ForegroundColor DarkGray }
    }
}

function Write-Ok   { param([string]$m) Write-Host "  ✔  $m" -ForegroundColor Green }
function Write-Skip { param([string]$m) Write-Host "  ⏭  $m" -ForegroundColor DarkGray }
function Write-Fail { param([string]$m) Write-Host "  ✘  $m" -ForegroundColor Red }
function Write-Info { param([string]$m) Write-Host "  ▸  $m" -ForegroundColor Cyan }

function Wait-Enter { param([string]$msg = "Press ENTER to continue...")
    Write-Host ""
    Write-Host "  $msg " -ForegroundColor DarkGray -NoNewline
    $null = Read-Host
    Write-Host ""
}

function Ask {
    param(
        [string]$Prompt,
        [string]$Default  = "",
        [switch]$Secret,
        [switch]$Required
    )
    $hint = if ($Default -ne "") { " [$Default]" } else { "" }
    while ($true) {
        Write-Host "  → $Prompt$hint : " -ForegroundColor White -NoNewline
        if ($Secret) {
            $ss  = Read-Host -AsSecureString
            $val = [System.Net.NetworkCredential]::new("", $ss).Password
        } else {
            $val = Read-Host
        }
        if ([string]::IsNullOrWhiteSpace($val)) { $val = $Default }
        if ($Required -and [string]::IsNullOrWhiteSpace($val)) {
            Write-Host "  ! This value is required." -ForegroundColor Red
            continue
        }
        return $val
    }
}

function AskYesNo { param([string]$Prompt, [string]$Default = "y")
    $hint = if ($Default -eq "y") { "[Y/n]" } else { "[y/N]" }
    Write-Host "  → $Prompt $hint : " -ForegroundColor White -NoNewline
    $r = (Read-Host).Trim().ToLower()
    if ($r -eq "") { $r = $Default }
    return ($r -eq "y" -or $r -eq "yes")
}

function New-RandomSecret { param([int]$bytes = 32)
    $b = New-Object byte[] $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($b)
    return -join ($b | ForEach-Object { $_.ToString('x2') })
}

function Test-Cmd { param([string]$cmd)
    return $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue)
}

function Invoke-WithRetry { param([scriptblock]$sb, [int]$tries = 3)
    for ($i = 1; $i -le $tries; $i++) {
        try { & $sb; return } catch {
            if ($i -eq $tries) { throw }
            Write-Host "  Retry $i/$tries..." -ForegroundColor DarkYellow
            Start-Sleep 2
        }
    }
}

function Write-EnvFile { param([string]$path, [hashtable]$vars, [string]$header = "")
    $lines = @()
    if ($header) { $lines += "# $header"; $lines += "" }
    foreach ($kv in $vars.GetEnumerator() | Sort-Object Key) {
        $lines += "$($kv.Key)=$($kv.Value)"
    }
    $content = $lines -join "`n"
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
}

# ─── start ────────────────────────────────────────────────────────────────────
Write-Banner

Write-Host "  This wizard will set up the full ACS stack on this machine." -ForegroundColor White
Write-Host "  It will ask you questions, wait at each step, then start everything." -ForegroundColor White
Write-Host ""
Write-Host "  Requirements before you start:" -ForegroundColor Yellow
Write-Host "  │  • A ViciDial instance you can admin (URL + admin password)" -ForegroundColor DarkGray
Write-Host "  │  • A VAPI account  (free tier is fine for testing)" -ForegroundColor DarkGray
Write-Host "  │  • Docker Desktop installed and running" -ForegroundColor DarkGray
Write-Host ""
Wait-Enter "Ready? Press ENTER to begin setup..."

# ═════════════════════════════════════════════════════════════════════════════
Write-Section 1 "Prerequisite Check & Install"
# ═════════════════════════════════════════════════════════════════════════════

# ── Node.js ───────────────────────────────────────────────────────────────────
Write-Info "Checking Node.js..."
if (Test-Cmd "node") {
    $nv = (node --version 2>&1).Trim()
    Write-Ok "Node.js found: $nv"
    if ($nv -notmatch '^v2[0-9]') {
        Write-Host "  ⚠  Node 20+ is recommended (found $nv). Install from https://nodejs.org/" -ForegroundColor Yellow
        Wait-Enter "Install Node 20+ then press ENTER to continue..."
    }
} else {
    Write-Fail "Node.js not found."
    Write-Host ""
    Write-Host "  Installing Node.js 20 via winget..." -ForegroundColor Yellow
    try {
        winget install --id OpenJS.NodeJS.LTS --version "20.*" --accept-package-agreements --accept-source-agreements -e
        Write-Ok "Node.js installed. You may need to restart this terminal."
        Write-Host "  Restart this terminal, then re-run .\setup.ps1" -ForegroundColor Yellow
        exit 0
    } catch {
        Write-Fail "Auto-install failed. Download Node 20 from: https://nodejs.org/en/download"
        Wait-Enter "Install Node 20, then press ENTER to continue..."
    }
}

# ── Docker ────────────────────────────────────────────────────────────────────
Write-Info "Checking Docker..."
if (Test-Cmd "docker") {
    try {
        $dv = (docker version --format "{{.Server.Version}}" 2>&1).Trim()
        Write-Ok "Docker Engine: $dv"
    } catch {
        Write-Fail "Docker is installed but the Engine is not running."
        Write-Host ""
        Write-Guide @(
            "## Start Docker Desktop"
            ""
            "Open Docker Desktop from the Start Menu and wait for it to show"
            "'Docker Desktop is running' in the system tray (bottom right)."
        )
        Wait-Enter "Docker is running? Press ENTER to continue..."
        # retry
        $dv = (docker version --format "{{.Server.Version}}" 2>&1).Trim()
        Write-Ok "Docker Engine: $dv"
    }
} else {
    Write-Fail "Docker not found."
    Write-Guide @(
        "## Install Docker Desktop"
        ""
        "1. Download from: https://www.docker.com/products/docker-desktop/"
        "2. Run the installer and restart Windows if prompted."
        "3. Launch Docker Desktop and wait for it to fully start."
        "4. Come back and press ENTER."
    )
    Wait-Enter "Docker is installed & running? Press ENTER to continue..."
}

# ── Git ───────────────────────────────────────────────────────────────────────
Write-Info "Checking Git..."
if (Test-Cmd "git") {
    $gv = (git --version 2>&1).Trim()
    Write-Ok "Git: $gv"
} else {
    Write-Fail "Git not found. Installing via winget..."
    try {
        winget install --id Git.Git --accept-package-agreements --accept-source-agreements -e
        Write-Ok "Git installed. Restart this terminal, then re-run .\setup.ps1"
        exit 0
    } catch {
        Write-Fail "Download Git from: https://git-scm.com/download/win"
        Wait-Enter "Git installed? Press ENTER to continue..."
    }
}

# ── ngrok ─────────────────────────────────────────────────────────────────────
Write-Info "Checking ngrok..."
if (Test-Cmd "ngrok") {
    $ngv = (ngrok version 2>&1).Trim()
    Write-Ok "ngrok: $ngv"
} else {
    Write-Host "  ngrok not found. Installing via winget..." -ForegroundColor Yellow
    try {
        winget install --id Ngrok.Ngrok --accept-package-agreements --accept-source-agreements -e
        Write-Ok "ngrok installed."
    } catch {
        Write-Host "  Could not auto-install ngrok." -ForegroundColor Yellow
        Write-Guide @(
            "Manual install: https://ngrok.com/download"
            "Extract ngrok.exe to a folder in your PATH, then press ENTER."
        )
        Wait-Enter
    }
}

# ═════════════════════════════════════════════════════════════════════════════
Write-Section 2 "VAPI Account & Assistant Setup"
# ═════════════════════════════════════════════════════════════════════════════

Write-Guide @(
    "## Do you already have VAPI keys and an assistant?"
    ""
    "If YES — skip this section, you only need to paste the keys later."
    "If NO  — follow the steps below, then press ENTER when done."
)
$needVapi = AskYesNo "Do you need to create/configure VAPI now?"

if ($needVapi) {
    Write-Guide @(
        ""
        "## Step A  ·  Create a VAPI account"
        ""
        "1. Open your browser and go to:  https://dashboard.vapi.ai"
        "2. Sign up with Google / GitHub / email."
        "3. You'll land on the VAPI dashboard."
        ""
        "## Step B  ·  Get your API keys"
        ""
        "1. In the left sidebar click  'API Keys'."
        "2. Copy the  Private Key  (starts with a UUID-looking string)."
        "3. Copy the  Public Key   (also shown on the same page)."
        "   Keep these — you will paste them in a moment."
        ""
        "## Step C  ·  Create an Assistant"
        ""
        "1. In the left sidebar click  'Assistants'."
        "2. Click  'Create Assistant'  →  give it a name (e.g. 'ACS Agent')."
        "3. Set:  First Message = 'Hello, this is an automated call...' (or your own)"
        "4. Set:  System Prompt = your sales/qualification script."
        "5. Under  'Tools'  add a tool called  transferCall  with these params:"
        "   │  phoneNumber  (string, required) — number to transfer to"
        "   │  message      (string, optional) — what AI says before transferring"
        "6. Save the assistant.  Copy its  Assistant ID  from the URL or details panel."
        ""
        "## Step D  ·  Configure SIP Trunk in VAPI (for ViciDial audio)"
        ""
        "1. In VAPI sidebar click  'Phone Numbers' → 'SIP Trunk'."
        "2. Click  'Add SIP Trunk'."
        "3. Hostname: (you will fill this in AFTER ngrok starts in Step 9)."
        "   Leave it blank for now — we'll come back."
        "4. Username / Password: leave blank (ViciDial will send unauthenticated)."
        "5. Assign the SIP trunk to your ACS Assistant."
        ""
        "! You can skip Step D for now and come back after ngrok is running."
    )
    Wait-Enter "VAPI account + assistant ready? Press ENTER to continue..."
} else {
    Write-Skip "Skipping VAPI creation — you already have keys."
}

# ═════════════════════════════════════════════════════════════════════════════
Write-Section 3 "ViciDial Configuration"
# ═════════════════════════════════════════════════════════════════════════════

Write-Guide @(
    "## Do you need to configure ViciDial?"
    ""
    "If YES — follow the steps below."
    "If NO  — your ViciDial is already pointing at this AVR setup."
)
$needVici = AskYesNo "Do you need to configure ViciDial now?"

if ($needVici) {
    Write-Guide @(
        ""
        "## Step A  ·  Create an Agent user for AVR (if not done)"
        ""
        "1. Log in to ViciDial Admin:  https://<your-vicidial-url>/vicidial/admin.php"
        "2. Go to  Users  →  Add New User"
        "3. Set:  User ID  = 9001  (or any free ID)"
        "   Set:  Password = your agent password"
        "   Set:  User Level = 1 (Agent)"
        "   Enable:  Agent API Access = 1"
        "4. Save."
        ""
        "## Step B  ·  Create a SIP carrier pointing to AVR Asterisk"
        ""
        "1. Go to  Admin  →  Carriers  →  Add New Carrier"
        "2. Carrier Name:  AVR-ASTERISK"
        "3. Protocol:      SIP"
        "4. Server IP:     <ngrok TCP host>  (you'll update this in Step 9)"
        "   Port:          <ngrok TCP port>"
        "5. For now enter any placeholder — you MUST update after ngrok starts."
        ""
        "## Step C  ·  Configure your Campaign to use AVR"
        ""
        "1. Go to  Campaigns  →  edit your outbound campaign"
        "2. Set  Transfer-Conf Number  =  the verifier phone number"
        "3. Set  AMD (Answering Machine Detection):  enabled  (Conservative)"
        "4. Set  Carrier:  AVR-ASTERISK"
        "5. Save."
        ""
        "## Step D  ·  Enable Remote Agents mode"
        ""
        "1. Go to  Admin  →  System Settings"
        "2. Enable  'Allow Remote Agents'"
        "3. Save."
        ""
        "! IMPORTANT: After ngrok starts (Step 9) you MUST update the Carrier"
        "  IP + port to the ngrok address before making any calls."
    )
    Wait-Enter "ViciDial configured (or noted what to do)? Press ENTER to continue..."
} else {
    Write-Skip "Skipping ViciDial setup guide."
}

# ═════════════════════════════════════════════════════════════════════════════
Write-Section 4 "Collect Credentials"
# ═════════════════════════════════════════════════════════════════════════════

Write-Info "Paste your credentials below. Passwords are masked."
Write-Host ""

# ── VAPI ──────────────────────────────────────────────────────────────────────
Write-Host "  ── VAPI ────────────────────────────────────────────────────────" -ForegroundColor DarkGray
$vapiPrivKey    = Ask "VAPI Private Key"    -Secret -Required
$vapiPubKey     = Ask "VAPI Public Key"     -Secret
$vapiAssistant  = Ask "VAPI Assistant ID"   -Required

# ── ViciDial ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ── ViciDial ─────────────────────────────────────────────────────" -ForegroundColor DarkGray
$viciUrl        = Ask "ViciDial URL  (e.g. https://crm.example.com)"  -Default "https://primesol.autelecom.net" -Required
$viciUser       = Ask "ViciDial admin username"                        -Default "admin"
$viciPass       = Ask "ViciDial admin password"                        -Secret -Required
$viciAgentUser  = Ask "ViciDial agent user ID  (e.g. 9001)"            -Default "9001"
$viciAgentPass  = Ask "ViciDial agent password"                        -Secret -Required

# ── avr-app backend ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ── avr-app backend ─────────────────────────────────────────────" -ForegroundColor DarkGray
$adminUser      = Ask "Admin webapp email"     -Default "admin@agentvoiceresponse.com"
$adminPass      = Ask "Admin webapp password"  -Default "agentvoiceresponse" -Secret
$jwtAuto        = AskYesNo "Auto-generate JWT secret?" -Default "y"
if ($jwtAuto) {
    $jwtSecret  = New-RandomSecret 32
    Write-Ok "JWT_SECRET auto-generated (64-hex chars)"
} else {
    $jwtSecret  = Ask "JWT_SECRET"  -Secret -Required
}
$webhookSecret  = New-RandomSecret 16
Write-Ok "WEBHOOK_SECRET auto-generated"

# ── AMD sensitivity ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ── AMD Sensitivity (FR-21) ─────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  │  disabled | conservative | normal | aggressive" -ForegroundColor DarkGray
$amdSens        = Ask "Default AMD sensitivity"  -Default "conservative"
$validAmd       = @("disabled","conservative","normal","aggressive")
if ($amdSens -notin $validAmd) { $amdSens = "conservative" }

# ═════════════════════════════════════════════════════════════════════════════
Write-Section 5 "Write .env Files"
# ═════════════════════════════════════════════════════════════════════════════

function Confirm-Overwrite { param([string]$path)
    if (Test-Path $path) {
        Write-Host "  ⚠  $path already exists." -ForegroundColor Yellow
        return (AskYesNo "Overwrite it?" -Default "y")
    }
    return $true
}

# ── avr-sts-vapi/.env ────────────────────────────────────────────────────────
$stsEnvPath = Join-Path $STS_VAPI ".env"
if (Confirm-Overwrite $stsEnvPath) {
    $stsVars = [ordered]@{
        PORT                = "6042"
        VAPI_PRIVATE_KEY    = $vapiPrivKey
        VAPI_PUBLIC_KEY     = $vapiPubKey
        VAPI_ASSISTANT_ID   = $vapiAssistant
        VICIDIAL_URL        = $viciUrl
        VICIDIAL_USER       = $viciUser
        VICIDIAL_PASS       = $viciPass
        VICIDIAL_AGENT_USER = $viciAgentUser
        VICIDIAL_AGENT_PASS = $viciAgentPass
        AMD_SENSITIVITY     = $amdSens
    }
    $stsLines = @("# avr-sts-vapi — generated by setup.ps1", "")
    foreach ($kv in $stsVars.GetEnumerator()) { $stsLines += "$($kv.Key)=$($kv.Value)" }
    [System.IO.File]::WriteAllText($stsEnvPath, ($stsLines -join "`n"), [System.Text.Encoding]::UTF8)
    Write-Ok "avr-sts-vapi/.env written"
} else {
    Write-Skip "avr-sts-vapi/.env kept as-is"
}

# ── avr-app/backend/.env ─────────────────────────────────────────────────────
$backEnvPath = Join-Path $BACKEND ".env"
if (Confirm-Overwrite $backEnvPath) {
    $backLines = @(
        "# avr-app backend — generated by setup.ps1"
        ""
        "# General"
        "PORT=3001"
        "JWT_SECRET=$jwtSecret"
        "CORE_DEFAULT_IMAGE=agentvoiceresponse/avr-core:latest"
        ""
        "# Database"
        "DB_TYPE=sqlite"
        "DB_DATABASE=../data/data.db"
        ""
        "# Admin user (auto-created on first boot)"
        "ADMIN_USERNAME=$adminUser"
        "ADMIN_PASSWORD=$adminPass"
        ""
        "# Frontend origin (for CORS)"
        "FRONTEND_URL=http://localhost:3000"
        ""
        "# Webhooks"
        "WEBHOOK_URL=http://localhost:3001/webhooks"
        "WEBHOOK_SECRET=$webhookSecret"
        ""
        "# Asterisk"
        "ASTERISK_CONFIG_PATH=../asterisk"
        "ASTERISK_MONITOR_PATH=../recordings"
        "ARI_URL=http://localhost:8088/ari"
        "ARI_USERNAME=avr"
        "ARI_PASSWORD=avr"
        "AMI_URL=http://localhost:6006"
        ""
        "# Docker"
        "DOCKER_SOCKET_PATH=//./pipe/docker_engine"
    )
    [System.IO.File]::WriteAllText($backEnvPath, ($backLines -join "`n"), [System.Text.Encoding]::UTF8)
    Write-Ok "avr-app/backend/.env written"
} else {
    Write-Skip "avr-app/backend/.env kept as-is"
}

# ── avr-app/frontend/.env.local ───────────────────────────────────────────────
$frontEnvPath = Join-Path $FRONTEND ".env.local"
if (Confirm-Overwrite $frontEnvPath) {
    $frontLines = @(
        "# avr-app frontend — generated by setup.ps1"
        ""
        "NEXT_PUBLIC_API_URL=http://localhost:3001"
        "NEXT_PUBLIC_WEBRTC_CLIENT_URL=http://localhost:8080/index.html"
    )
    [System.IO.File]::WriteAllText($frontEnvPath, ($frontLines -join "`n"), [System.Text.Encoding]::UTF8)
    Write-Ok "avr-app/frontend/.env.local written"
} else {
    Write-Skip "avr-app/frontend/.env.local kept as-is"
}

Wait-Enter "Config files written. Press ENTER to install npm packages..."

# ═════════════════════════════════════════════════════════════════════════════
Write-Section 6 "Install npm Dependencies"
# ═════════════════════════════════════════════════════════════════════════════

Write-Info "Installing backend packages (avr-app/backend)..."
Push-Location $BACKEND
try {
    npm install --prefer-offline 2>&1 | Select-Object -Last 5
    Write-Ok "Backend packages installed"
} catch {
    Write-Fail "npm install failed in backend: $_"
    Write-Host "  Fix the error then re-run this script." -ForegroundColor Yellow
    exit 1
} finally { Pop-Location }

Write-Info "Installing frontend packages (avr-app/frontend)..."
Push-Location $FRONTEND
try {
    npm install --prefer-offline 2>&1 | Select-Object -Last 5
    Write-Ok "Frontend packages installed"
} catch {
    Write-Fail "npm install failed in frontend: $_"
    exit 1
} finally { Pop-Location }

Write-Info "Installing avr-sts-vapi packages..."
Push-Location $STS_VAPI
try {
    npm install --prefer-offline 2>&1 | Select-Object -Last 5
    Write-Ok "avr-sts-vapi packages installed"
} catch {
    Write-Fail "npm install failed in avr-sts-vapi: $_"
    exit 1
} finally { Pop-Location }

# ═════════════════════════════════════════════════════════════════════════════
Write-Section 7 "Build NestJS Backend"
# ═════════════════════════════════════════════════════════════════════════════

Write-Info "Building NestJS backend (npm run build)..."
Push-Location $BACKEND
try {
    npm run build 2>&1 | Select-Object -Last 10
    if ($LASTEXITCODE -ne 0) { throw "Build exited $LASTEXITCODE" }
    Write-Ok "Backend compiled to dist/"
} catch {
    Write-Fail "Backend build failed: $_"
    Write-Host "  Run: cd avr-app\backend && npm run build  to see full output." -ForegroundColor Yellow
    exit 1
} finally { Pop-Location }

# ═════════════════════════════════════════════════════════════════════════════
Write-Section 8 "Start Docker Infrastructure"
# ═════════════════════════════════════════════════════════════════════════════

Write-Info "Ensuring Docker 'avr' network..."
docker network create avr 2>$null
Write-Ok "Network 'avr' ready"

# ── avr-asterisk ─────────────────────────────────────────────────────────────
Write-Info "Starting avr-asterisk container..."
docker rm -f avr-asterisk 2>$null | Out-Null
$asteriskVols = @()
$confDir = Join-Path $ROOT "avr-app\asterisk"
if (Test-Path $confDir) {
    $asteriskVols = @(
        "-v", "${confDir}/pjsip.conf:/etc/asterisk/my_pjsip.conf",
        "-v", "${confDir}/extensions.conf:/etc/asterisk/my_extensions.conf",
        "-v", "${confDir}/ari.conf:/etc/asterisk/my_ari.conf",
        "-v", "${confDir}/manager.conf:/etc/asterisk/my_manager.conf",
        "-v", "${confDir}/queues.conf:/etc/asterisk/my_queues.conf"
    )
}
$asteriskArgs = @(
    "run", "-d",
    "--name", "avr-asterisk",
    "--network", "avr",
    "--restart", "unless-stopped",
    "-p", "5060:5060",
    "-p", "5060:5060/udp",
    "-p", "8088:8088",
    "-p", "8089:8089",
    "-p", "5038:5038"
) + $asteriskVols + @("agentvoiceresponse/avr-asterisk")

docker @asteriskArgs 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Fail "avr-asterisk failed to start. Check: docker logs avr-asterisk"
} else {
    Write-Ok "avr-asterisk started  (SIP:5060  ARI:8088  AMI:5038)"
}

# ── avr-ami ───────────────────────────────────────────────────────────────────
Write-Info "Starting avr-ami container..."
docker rm -f avr-ami 2>$null | Out-Null
docker run -d `
    --name avr-ami `
    --network avr `
    --restart unless-stopped `
    -p 6006:6006 `
    -e PORT=6006 `
    -e AMI_HOST=avr-asterisk `
    -e AMI_PORT=5038 `
    -e AMI_USERNAME=avr `
    -e AMI_PASSWORD=avr `
    agentvoiceresponse/avr-ami 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Fail "avr-ami failed to start. Check: docker logs avr-ami"
} else {
    Write-Ok "avr-ami started  (HTTP:6006)"
}

# ── avr-sts-vapi ──────────────────────────────────────────────────────────────
Write-Info "Building avr-sts-vapi Docker image..."
Push-Location $STS_VAPI
docker build --platform linux/amd64 -t agentvoiceresponse/avr-sts-vapi . 2>&1 | Select-Object -Last 5
if ($LASTEXITCODE -ne 0) {
    Write-Fail "avr-sts-vapi build failed. Check Dockerfile in avr-sts-vapi/"
} else {
    Write-Ok "avr-sts-vapi image built"
    docker rm -f avr-sts-vapi 2>$null | Out-Null
    $envVars = @(
        "-e", "PORT=6042",
        "-e", "VAPI_PRIVATE_KEY=$vapiPrivKey",
        "-e", "VAPI_PUBLIC_KEY=$vapiPubKey",
        "-e", "VAPI_ASSISTANT_ID=$vapiAssistant",
        "-e", "VICIDIAL_URL=$viciUrl",
        "-e", "VICIDIAL_USER=$viciUser",
        "-e", "VICIDIAL_PASS=$viciPass",
        "-e", "VICIDIAL_AGENT_USER=$viciAgentUser",
        "-e", "VICIDIAL_AGENT_PASS=$viciAgentPass",
        "-e", "AMD_SENSITIVITY=$amdSens"
    )
    $stsArgs = @(
        "run", "-d",
        "--name", "avr-sts-vapi",
        "--network", "avr",
        "--restart", "unless-stopped",
        "-p", "6042:6042"
    ) + $envVars + @("agentvoiceresponse/avr-sts-vapi")
    docker @stsArgs 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "avr-sts-vapi container failed. Check: docker logs avr-sts-vapi"
    } else {
        Write-Ok "avr-sts-vapi started  (WS:6042)"
    }
}
Pop-Location

# ── wait for containers ───────────────────────────────────────────────────────
Write-Info "Waiting 5 s for containers to initialise..."
Start-Sleep 5

# ═════════════════════════════════════════════════════════════════════════════
Write-Section 9 "Start avr-app (Backend + Frontend)"
# ═════════════════════════════════════════════════════════════════════════════

Write-Info "Starting NestJS backend on port 3001..."
$backendProc = Start-Process -FilePath "node" `
    -ArgumentList "--enable-source-maps", "dist/main" `
    -WorkingDirectory $BACKEND `
    -NoNewWindow -PassThru
Write-Ok "Backend started  (PID $($backendProc.Id))"

Write-Info "Waiting 3 s for backend to boot..."
Start-Sleep 3

Write-Info "Starting Next.js frontend on port 3000..."
$frontendProc = Start-Process -FilePath "npm" `
    -ArgumentList "run", "dev" `
    -WorkingDirectory $FRONTEND `
    -NoNewWindow -PassThru
Write-Ok "Frontend started  (PID $($frontendProc.Id))"

# ═════════════════════════════════════════════════════════════════════════════
Write-Section 10 "Start ngrok TCP Tunnel (port 5060)"
# ═════════════════════════════════════════════════════════════════════════════

Write-Guide @(
    "ngrok will expose your local Asterisk SIP port (5060) to the internet."
    "ViciDial needs this address to reach your AVR Asterisk instance."
    ""
    "! You need an ngrok account + authtoken for TCP tunnels (free plan is fine)."
    "  If you haven't set one up: https://dashboard.ngrok.com/get-started/setup"
    "  Run once:  ngrok config add-authtoken <your-token>"
)
Wait-Enter "ngrok authtoken configured? Press ENTER to start the tunnel..."

Write-Info "Starting ngrok TCP tunnel on port 5060..."
$ngrokProc = Start-Process -FilePath "ngrok" `
    -ArgumentList "tcp", "5060" `
    -NoNewWindow -PassThru

Write-Info "Waiting 4 s for ngrok to connect..."
Start-Sleep 4

# ── fetch ngrok public address ────────────────────────────────────────────────
$ngrokAddr = ""
try {
    $ngrokApi   = Invoke-RestMethod "http://localhost:4040/api/tunnels" -TimeoutSec 6
    $tcpTunnel  = $ngrokApi.tunnels | Where-Object { $_.proto -eq "tcp" } | Select-Object -First 1
    if ($tcpTunnel) {
        $ngrokAddr = $tcpTunnel.public_url -replace "tcp://", ""
        Write-Ok "ngrok tunnel:  tcp://$ngrokAddr"
        $ngrokHost, $ngrokPort = $ngrokAddr -split ":"
    }
} catch {
    Write-Host "  Could not read ngrok address automatically. Check http://localhost:4040" -ForegroundColor Yellow
    $ngrokAddr = Ask "Enter ngrok address (host:port)" -Default "0.tcp.ngrok.io:12345"
    $ngrokHost, $ngrokPort = $ngrokAddr -split ":"
}

# ═════════════════════════════════════════════════════════════════════════════
Write-Section 11 "In-App Configuration Guide"
# ═════════════════════════════════════════════════════════════════════════════

Write-Guide @(
    "## Open the ACS webapp at:  http://localhost:3000"
    ""
    "Login:  $adminUser  /  $adminPass"
    ""
    "## Step A  ·  Create a Provider"
    ""
    "1. Go to  Providers  →  Add Provider"
    "2. Type:  STS  (Speech-to-Speech)"
    "3. Name:  VAPI"
    "4. Config (JSON):"
    "   {"
    "     ""image"": ""agentvoiceresponse/avr-sts-vapi:latest"","
    "     ""env"": {"
    "       ""VAPI_PRIVATE_KEY"": ""$vapiPrivKey"","
    "       ""VAPI_ASSISTANT_ID"": ""$vapiAssistant"""
    "     }"
    "   }"
    "5. Save."
    ""
    "## Step B  ·  Create an Agent"
    ""
    "1. Go to  Agents  →  Add Agent"
    "2. Name:  ACS Agent"
    "3. Mode:  STS"
    "4. STS Provider:  VAPI  (the one you just created)"
    "5. AMD Sensitivity:  $amdSens"
    "6. Save, then click  START  to launch the agent containers."
    ""
    "## Step C  ·  Add a SIP Trunk"
    ""
    "1. Go to  Trunks  →  Add Trunk"
    "2. Name:  ViciDial"
    "3. Host:  $viciUrl"
    "4. Save."
    ""
    "## Step D  ·  Add a Number"
    ""
    "1. Go to  Numbers  →  Add Number"
    "2. Number:  your ViciDial outbound DID"
    "3. Assign to:  ACS Agent"
    "4. Save."
    ""
    "## Step E  ·  Update ViciDial Carrier with ngrok address"
    ""
    "1. Log in to ViciDial Admin"
    "2. Go to  Carriers  →  AVR-ASTERISK"
    "3. Set  Server IP:  $ngrokHost"
    "   Set  Port:       $ngrokPort"
    "4. Save."
    ""
    "## Step F  ·  Update VAPI SIP Trunk with ngrok address"
    ""
    "1. Log in to dashboard.vapi.ai"
    "2. Go to  Phone Numbers  →  your SIP Trunk"
    "3. Set  Hostname:  $ngrokHost"
    "   Set  Port:      $ngrokPort"
    "4. Save."
)

Wait-Enter "In-app setup done? Press ENTER to see the final summary..."

# ═════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "  ╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║                    ACS  SETUP  COMPLETE                      ║" -ForegroundColor Green
Write-Host "  ╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Service URLs:" -ForegroundColor Cyan
Write-Host "  │  Admin webapp   →  http://localhost:3000" -ForegroundColor White
Write-Host "  │  Backend API    →  http://localhost:3001" -ForegroundColor White
Write-Host "  │  AMI bridge     →  http://localhost:6006" -ForegroundColor White
Write-Host "  │  VAPI STS WS    →  ws://localhost:6042" -ForegroundColor White
Write-Host "  │  Asterisk SIP   →  $ngrokHost`:$ngrokPort  (ngrok)" -ForegroundColor White
Write-Host "  │  ngrok console  →  http://localhost:4040" -ForegroundColor White
Write-Host ""
Write-Host "  Login:" -ForegroundColor Cyan
Write-Host "  │  $adminUser  /  (the password you set)" -ForegroundColor White
Write-Host ""
Write-Host "  To start everything again later, run:" -ForegroundColor Cyan
Write-Host "  │  .\start-all.ps1" -ForegroundColor White
Write-Host ""
Write-Host "  Logs:" -ForegroundColor Cyan
Write-Host "  │  docker logs -f avr-asterisk" -ForegroundColor White
Write-Host "  │  docker logs -f avr-ami" -ForegroundColor White
Write-Host "  │  docker logs -f avr-sts-vapi" -ForegroundColor White
Write-Host ""
Write-Host "  Backend PID:   $($backendProc.Id)    Frontend PID:  $($frontendProc.Id)" -ForegroundColor DarkGray
Write-Host ""
