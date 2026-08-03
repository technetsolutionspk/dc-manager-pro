param(
    [string]$InstallDir = "C:\Program Files\AD Manager Pro"
)

$ErrorActionPreference = "Continue"
$Version = "2.4.0"
$AppPort = "8080"

function Write-Step([string]$N, [string]$T) {
    Write-Host "  [$N] " -ForegroundColor Yellow -NoNewline
    Write-Host $T
}

function Write-OK([string]$T) {
    Write-Host "  [OK] " -ForegroundColor Green -NoNewline
    Write-Host $T -ForegroundColor Gray
}

function Write-Fail([string]$T) {
    Write-Host "  [X] " -ForegroundColor Red -NoNewline
    Write-Host $T -ForegroundColor Gray
}

function Write-Info([string]$T) {
    Write-Host "  [i] " -ForegroundColor Blue -NoNewline
    Write-Host $T -ForegroundColor Gray
}

function Read-Input([string]$Prompt, [string]$Default, [switch]$Required, [switch]$Secure) {
    while ($true) {
        $dt = ""
        if ($Default) { $dt = " [$Default]" }
        Write-Host "  ${Prompt}${dt}: " -ForegroundColor Yellow -NoNewline
        if ($Secure) {
            $ss = Read-Host -AsSecureString
            $bp = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss)
            $val = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bp)
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bp)
        } else { $val = Read-Host }
        if (-not $val) { $val = "" }
        $val = $val.Trim()
        if ($val -eq "" -and $Default) { return $Default }
        if ($val -eq "" -and $Required) { Write-Fail "Required field"; continue }
        if ($val -eq "") { return "" }
        return $val
    }
}

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $pr = New-Object Security.Principal.WindowsPrincipal($id)
    return $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Find-Python {
    $tries = @("python","python3","C:\Python312\python.exe","C:\Python311\python.exe")
    $tries += "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
    $tries += "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
    $tries += "$env:ProgramFiles\Python312\python.exe"
    $tries += "$env:ProgramFiles\Python311\python.exe"
    foreach ($p in $tries) {
        try { $o = & $p --version 2>&1; if ($o -match "Python 3\.") { return $p } } catch {}
    }
    return $null
}

function Find-Node {
    try { $o = & node --version 2>&1; if ($o -match "v\d+") { return "node" } } catch {}
    if (Test-Path "$env:ProgramFiles\nodejs\node.exe") { return "$env:ProgramFiles\nodejs\node.exe" }
    return $null
}

function Refresh-Path {
    $m = [System.Environment]::GetEnvironmentVariable("Path","Machine")
    $u = [System.Environment]::GetEnvironmentVariable("Path","User")
    $env:Path = "$m;$u"
}

function Add-FW([string]$Name, [int]$Port) {
    try { & netsh advfirewall firewall delete rule name="$Name" 2>&1 | Out-Null } catch {}
    try { & netsh advfirewall firewall add rule name="$Name" dir=in action=allow protocol=TCP localport=$Port profile=domain,private 2>&1 | Out-Null; return $true } catch { return $false }
}

function Remove-FW([string]$Name) {
    try { & netsh advfirewall firewall delete rule name="$Name" 2>&1 | Out-Null } catch {}
}

function Remove-Task([string]$Name) {
    try { & schtasks /end /tn $Name 2>&1 | Out-Null } catch {}
    try { & schtasks /delete /tn $Name /f 2>&1 | Out-Null } catch {}
}

function Get-IPs {
    $ips = @()
    try {
        $adapters = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()
        foreach ($a in $adapters) {
            if ($a.OperationalStatus -eq "Up" -and $a.NetworkInterfaceType -ne "Loopback") {
                $props = $a.GetIPProperties()
                foreach ($addr in $props.UnicastAddresses) {
                    if ($addr.Address.AddressFamily -eq "InterNetwork" -and $addr.Address.ToString() -ne "127.0.0.1") {
                        $ips += $addr.Address.ToString()
                    }
                }
            }
        }
    } catch {}
    return $ips
}

# ================================================================
# INSTALL
# ================================================================
Clear-Host
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   AD Manager Pro v$Version Installer" -ForegroundColor Cyan
Write-Host "   Enterprise AD Management Platform" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Admin)) {
    Write-Fail "Must run as Administrator"
    Read-Host "  Press Enter to exit"
    exit 1
}
Write-OK "Running as Administrator"

Write-Host ""
Write-Host "  This installer will:" -ForegroundColor White
Write-Host "    1. Install Python 3.12 if needed"
Write-Host "    2. Install Node.js 20 if needed"
Write-Host "    3. Setup AD Manager Pro"
Write-Host "    4. Configure AD settings"
Write-Host "    5. Build web frontend"
Write-Host "    6. Create Windows service"
Write-Host "    7. Configure firewall"
Write-Host "    8. Start application"
Write-Host ""
Write-Host "  Runs on HTTP port $AppPort" -ForegroundColor Green
Write-Host ""

$InstallDir = Read-Input -Prompt "Install directory" -Default $InstallDir

Write-Host ""
Write-Host "  -- STEP 1: AD Configuration --" -ForegroundColor Cyan
$adServer = Read-Input -Prompt "Primary DC IP or Hostname" -Required
$adServer2 = Read-Input -Prompt "Secondary DC (Enter to skip)" -Default ""
$adDomain = Read-Input -Prompt "Domain name (e.g. company.local)" -Required
$parts = $adDomain.Split(".")
$dnArr = @()
foreach ($p in $parts) { $dnArr += "DC=$p" }
$autoDn = $dnArr -join ","
$adBaseDn = Read-Input -Prompt "Base DN" -Default $autoDn
$adAccount = Read-Input -Prompt "Service account UPN" -Default "svc-admanager@$adDomain"
$adPassword = Read-Input -Prompt "Service account password" -Required -Secure
$useLdaps = Read-Input -Prompt "Use LDAPS (true/false)" -Default "true"
$adPort = "389"
if ($useLdaps -eq "true") { $adPort = "636" }

Write-Host ""
Write-Host "  -- STEP 2: First Admin User --" -ForegroundColor Cyan
Write-Info "Must have a valid AD account"
$adminUser = Read-Input -Prompt "AD username" -Required
$adminName = Read-Input -Prompt "Display name" -Default $adminUser
$adminEmail = Read-Input -Prompt "Email" -Default "$adminUser@$adDomain"

Write-Host ""
Write-Host "  -- Summary --" -ForegroundColor Cyan
Write-Info "Install Dir : $InstallDir"
Write-Info "DC Server   : $adServer"
Write-Info "Domain      : $adDomain"
Write-Info "Base DN     : $adBaseDn"
Write-Info "Account     : $adAccount"
Write-Info "LDAPS       : $useLdaps (port $adPort)"
Write-Info "Admin       : $adminUser"
Write-Info "App Port    : $AppPort (HTTP)"
Write-Host ""
$go = Read-Input -Prompt "Proceed with install (yes/no)" -Default "yes"
if ($go -ne "yes") { Write-Info "Cancelled"; exit 0 }

# ================================================================
# STEP 3: Prerequisites
# ================================================================
Write-Host ""
Write-Host "  -- STEP 3: Prerequisites --" -ForegroundColor Cyan
Write-Step "3.1" "Checking Python..."
$pythonCmd = Find-Python
if (-not $pythonCmd) {
    Write-Info "Downloading Python 3.12.4..."
    $pyInst = Join-Path $env:TEMP "python-3.12.4-amd64.exe"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile("https://www.python.org/ftp/python/3.12.4/python-3.12.4-amd64.exe", $pyInst)
        Write-OK "Downloaded"
    } catch {
        Write-Fail "Download failed: $_"
        Write-Host "  Install Python manually from https://python.org" -ForegroundColor Yellow
        Read-Host "  Press Enter after installing"
    }
    if (Test-Path $pyInst) {
        Write-Info "Installing Python (2-3 min)..."
        Start-Process -FilePath $pyInst -ArgumentList "/quiet","InstallAllUsers=1","PrependPath=1","Include_test=0" -Wait -NoNewWindow
        Write-OK "Python installed"
        Refresh-Path
        Start-Sleep -Seconds 2
        try { Remove-Item $pyInst -Force } catch {}
    }
    $pythonCmd = Find-Python
    if (-not $pythonCmd) { Write-Fail "Python not found"; Read-Host "  Press Enter to exit"; exit 1 }
}
$pyV = & $pythonCmd --version 2>&1
Write-OK "Python: $pyV"

Write-Step "3.2" "Checking Node.js..."
$nodeCmd = Find-Node
if (-not $nodeCmd) {
    Write-Info "Downloading Node.js 20 LTS..."
    $ndInst = Join-Path $env:TEMP "node-v20.15.0-x64.msi"
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile("https://nodejs.org/dist/v20.15.0/node-v20.15.0-x64.msi", $ndInst)
        Write-OK "Downloaded"
    } catch {
        Write-Fail "Download failed: $_"
        Read-Host "  Press Enter after installing manually"
    }
    if (Test-Path $ndInst) {
        Write-Info "Installing Node.js (1-2 min)..."
        Start-Process -FilePath "msiexec.exe" -ArgumentList "/i","`"$ndInst`"","/quiet","/norestart" -Wait -NoNewWindow
        Write-OK "Node.js installed"
        Refresh-Path
        Start-Sleep -Seconds 2
        try { Remove-Item $ndInst -Force } catch {}
    }
    $nodeCmd = Find-Node
    if (-not $nodeCmd) { Write-Fail "Node.js not found"; Read-Host "  Press Enter to exit"; exit 1 }
}
$ndV = & $nodeCmd --version 2>&1
Write-OK "Node.js: $ndV"

Write-Step "3.3" "Checking npm..."
try { $npmV = & npm --version 2>&1; Write-OK "npm: v$npmV" } catch { Write-Fail "npm not found"; exit 1 }

# ================================================================
# STEP 4: Directories
# ================================================================
Write-Host ""
Write-Host "  -- STEP 4: Creating Directories --" -ForegroundColor Cyan
$backendDir = Join-Path $InstallDir "backend"
$frontendDir = Join-Path $InstallDir "frontend"
$dirs = @($InstallDir, $backendDir, (Join-Path $backendDir "database"), (Join-Path $backendDir "logs"), (Join-Path $backendDir "static"), $frontendDir)
foreach ($d in $dirs) { if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null } }
Write-OK "Directories created"

# ================================================================
# STEP 5: Copy Files
# ================================================================
Write-Host ""
Write-Host "  -- STEP 5: Copying Files --" -ForegroundColor Cyan
$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bSrc = Join-Path $sourceDir "backend"
$fSrc = Join-Path $sourceDir "frontend"
if (-not (Test-Path (Join-Path $bSrc "app.py"))) { Write-Fail "Backend not found at $bSrc"; exit 1 }
if (-not (Test-Path (Join-Path $fSrc "package.json"))) { Write-Fail "Frontend not found at $fSrc"; exit 1 }
$bSrcN = $bSrc.ToLower().TrimEnd("\")
$bDstN = $backendDir.ToLower().TrimEnd("\")
$fSrcN = $fSrc.ToLower().TrimEnd("\")
$fDstN = $frontendDir.ToLower().TrimEnd("\")
if ($bSrcN -ne $bDstN) {
    $skipB = @("venv","__pycache__","database","logs","static","certs",".env")
    foreach ($item in (Get-ChildItem $bSrc)) {
        $sk = $false; foreach ($s in $skipB) { if ($item.Name -eq $s) { $sk = $true } }
        if (-not $sk) { try { Copy-Item $item.FullName -Destination $backendDir -Recurse -Force } catch {} }
    }
    Write-OK "Backend files copied"
} else { Write-OK "Backend already in place" }
if ($fSrcN -ne $fDstN) {
    $skipF = @("node_modules","dist",".vite")
    foreach ($item in (Get-ChildItem $fSrc)) {
        $sk = $false; foreach ($s in $skipF) { if ($item.Name -eq $s) { $sk = $true } }
        if (-not $sk) { try { Copy-Item $item.FullName -Destination $frontendDir -Recurse -Force } catch {} }
    }
    Write-OK "Frontend files copied"
} else { Write-OK "Frontend already in place" }

# ================================================================
# STEP 6: Configuration
# ================================================================
Write-Host ""
Write-Host "  -- STEP 6: Configuration --" -ForegroundColor Cyan
Write-Step "6.1" "Generating secret key..."
$secretKey = ""
try { $secretKey = & $pythonCmd -c "import secrets; print(secrets.token_hex(64))" 2>&1; $secretKey = [string]$secretKey; if ($secretKey.Length -lt 32) { throw "bad" } } catch {
    $secretKey = [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")
}
Write-OK "Secret key generated"

Write-Step "6.2" "Writing .env..."
$envL = @("AD_SERVER_PRIMARY=$adServer","AD_SERVER_SECONDARY=$adServer2","AD_DOMAIN=$adDomain","AD_BASE_DN=$adBaseDn","AD_TARGET_OU=$adBaseDn","AD_SERVICE_ACCOUNT=$adAccount","AD_SERVICE_PASSWORD=$adPassword","AD_USE_LDAPS=$useLdaps","AD_PORT=$adPort","SECRET_KEY=$secretKey","APP_HOST=0.0.0.0","APP_PORT=$AppPort")
[System.IO.File]::WriteAllLines((Join-Path $backendDir ".env"), $envL)
Write-OK "Configuration saved"

Write-Step "6.3" "Writing requirements.txt..."
$reqL = @("fastapi","uvicorn[standard]","python-jose[cryptography]","passlib[bcrypt]","python-multipart","sqlalchemy","ldap3","python-dotenv","cryptography")
$reqFile = Join-Path $backendDir "requirements.txt"
[System.IO.File]::WriteAllLines($reqFile, $reqL)
Write-OK "requirements.txt created"

# ================================================================
# STEP 7: Python Environment
# ================================================================
Write-Host ""
Write-Host "  -- STEP 7: Python Environment --" -ForegroundColor Cyan
$savedLoc = Get-Location
Set-Location $backendDir
$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"
$pipExe = Join-Path $backendDir "venv\Scripts\pip.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Step "7.1" "Creating virtual environment..."
    & $pythonCmd -m venv venv 2>&1 | Out-Null
    Write-OK "Virtual environment created"
} else { Write-OK "Virtual environment exists" }

Write-Step "7.2" "Installing Python packages (2-3 min)..."
& $pipExe install --upgrade pip --quiet 2>&1 | Out-Null
& $pipExe install -r $reqFile 2>&1 | Out-Null
$chk = & $pythonExe -c "import fastapi; print('OK')" 2>&1
if ([string]$chk -match "OK") { Write-OK "Packages installed and verified" }
else {
    Write-Fail "Verification failed. Retrying..."
    & $pipExe install fastapi uvicorn sqlalchemy ldap3 python-jose passlib python-multipart python-dotenv cryptography 2>&1 | Out-Null
    $chk2 = & $pythonExe -c "import fastapi; print('OK')" 2>&1
    if ([string]$chk2 -match "OK") { Write-OK "Packages installed on retry" }
    else { Write-Fail "Package install failed" }
}
Set-Location $savedLoc

# ================================================================
# STEP 8: Build Frontend
# ================================================================
Write-Host ""
Write-Host "  -- STEP 8: Building Frontend --" -ForegroundColor Cyan
$savedLoc = Get-Location
Set-Location $frontendDir

Write-Step "8.1" "Configuring..."
[System.IO.File]::WriteAllText((Join-Path $frontendDir ".env.production"), "VITE_API_URL=")
Write-OK "Configured"

$nmPath = Join-Path $frontendDir "node_modules"
if (-not (Test-Path $nmPath)) {
    Write-Step "8.2" "Installing npm packages (3-5 min)..."
    & npm install 2>&1 | Out-Null
    Write-OK "npm packages installed"
} else { Write-OK "npm packages already installed" }

Write-Step "8.3" "Installing esbuild..."
& npm install esbuild --save-dev 2>&1 | Out-Null
Write-OK "esbuild ready"

Write-Step "8.4" "Building production frontend..."
& npm run build 2>&1 | Out-Null
$distIndex = Join-Path $frontendDir "dist\index.html"
if (Test-Path $distIndex) { Write-OK "Frontend built successfully" }
else {
    Write-Fail "Build failed. Retrying..."
    $vc = Join-Path $frontendDir "node_modules\.vite"
    if (Test-Path $vc) { Remove-Item $vc -Recurse -Force -ErrorAction SilentlyContinue }
    & npm run build 2>&1 | Out-Null
    if (Test-Path $distIndex) { Write-OK "Frontend built on retry" }
    else { Write-Fail "Build failed. Run manually: cd $frontendDir && npm run build" }
}
Set-Location $savedLoc

# Deploy frontend
$distDir = Join-Path $frontendDir "dist"
$staticDir = Join-Path $backendDir "static"
$distIndex = Join-Path $distDir "index.html"
if (Test-Path $distIndex) {
    try { Get-ChildItem $staticDir -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue } catch {}
    Copy-Item -Path (Join-Path $distDir "*") -Destination $staticDir -Recurse -Force
    if (Test-Path (Join-Path $staticDir "index.html")) { Write-OK "Frontend deployed and verified" }
    else { Write-Fail "Deploy copy failed" }
} else { Write-Fail "No frontend to deploy" }

# ================================================================
# STEP 9: Admin User
# ================================================================
Write-Host ""
Write-Host "  -- STEP 9: Creating Admin User --" -ForegroundColor Cyan
$savedLoc = Get-Location
Set-Location $backendDir
$tmpPy = Join-Path $env:TEMP "adm_setup_user.py"
$pyL = @()
$pyL += "import sys, os"
$pyL += "os.chdir(r'" + $backendDir + "')"
$pyL += "sys.path.insert(0, r'" + $backendDir + "')"
$pyL += "try:"
$pyL += "    from models import AppUser, SessionLocal"
$pyL += "    db = SessionLocal()"
$pyL += "    ex = db.query(AppUser).filter(AppUser.username == '" + $adminUser + "').first()"
$pyL += "    if not ex:"
$pyL += "        u = AppUser()"
$pyL += "        u.username = '" + $adminUser + "'"
$pyL += "        u.display_name = '" + $adminName + "'"
$pyL += "        u.email = '" + $adminEmail + "'"
$pyL += "        u.role = 'Admin'"
$pyL += "        u.active = True"
$pyL += "        db.add(u)"
$pyL += "        db.commit()"
$pyL += "        print('CREATED')"
$pyL += "    else:"
$pyL += "        print('EXISTS')"
$pyL += "    db.close()"
$pyL += "except Exception as e:"
$pyL += "    print('ERROR: ' + str(e))"
[System.IO.File]::WriteAllLines($tmpPy, $pyL)
try {
    $r = & $pythonExe $tmpPy 2>&1
    $rs = [string]$r
    if ($rs -match "CREATED") { Write-OK "Admin user '$adminUser' created" }
    elseif ($rs -match "EXISTS") { Write-OK "Admin user '$adminUser' already exists" }
    else { Write-Fail "Could not create admin: $rs" }
} catch { Write-Fail "Admin creation error: $_" }
try { Remove-Item $tmpPy -Force } catch {}
Set-Location $savedLoc

# ================================================================
# STEP 10: Start Scripts
# ================================================================
Write-Host ""
Write-Host "  -- STEP 10: Creating Scripts --" -ForegroundColor Cyan

# service.cmd for scheduled task
$svcLines = @("@echo off", "cd /d `"$backendDir`"", "`"$pythonExe`" -m uvicorn app:app --host 0.0.0.0 --port $AppPort --workers 4 --log-level info >> `"$backendDir\logs\service.log`" 2>&1")
[System.IO.File]::WriteAllLines((Join-Path $backendDir "service.cmd"), $svcLines)

# start.bat for development
$devLines = @("@echo off", "title AD Manager Pro - Development", "cd /d `"$backendDir`"", "if not exist `"venv\Scripts\activate.bat`" (echo ERROR: No venv & pause & exit /b 1)", "echo.", "echo  AD Manager Pro - Development Server", "echo  URL: http://localhost:$AppPort", "echo  Press CTRL+C to stop", "echo.", "call venv\Scripts\activate.bat", "python -m uvicorn app:app --host 0.0.0.0 --port $AppPort --reload --log-level info", "pause")
[System.IO.File]::WriteAllLines((Join-Path $backendDir "start.bat"), $devLines)

# start_production.bat for manual start
$prodLines = @("@echo off", "title AD Manager Pro - Production", "cd /d `"$backendDir`"", "`"$pythonExe`" -m uvicorn app:app --host 0.0.0.0 --port $AppPort --workers 4 --log-level info >> `"$backendDir\logs\service.log`" 2>&1")
[System.IO.File]::WriteAllLines((Join-Path $backendDir "start_production.bat"), $prodLines)

Write-OK "Scripts created"

# ================================================================
# STEP 11: Windows Service (XML method)
# ================================================================
Write-Host ""
Write-Host "  -- STEP 11: Windows Service --" -ForegroundColor Cyan

Remove-Task "AD Manager Pro"
Remove-Task "AD Manager Pro HTTP"
try { Get-Process | Where-Object { $_.ProcessName -like "*python*" } | Stop-Process -Force -ErrorAction SilentlyContinue } catch {}
Start-Sleep -Seconds 3

$svcCmd = Join-Path $backendDir "service.cmd"
$xmlL = @()
$xmlL += "<?xml version=""1.0"" encoding=""UTF-16""?>"
$xmlL += "<Task version=""1.2"" xmlns=""http://schemas.microsoft.com/windows/2004/02/mit/task"">"
$xmlL += "  <RegistrationInfo><Description>AD Manager Pro HTTP Service Port $AppPort</Description></RegistrationInfo>"
$xmlL += "  <Triggers><BootTrigger><Enabled>true</Enabled></BootTrigger></Triggers>"
$xmlL += "  <Principals><Principal id=""Author""><UserId>S-1-5-18</UserId><RunLevel>HighestAvailable</RunLevel></Principal></Principals>"
$xmlL += "  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>true</AllowHardTerminate><StartWhenAvailable>true</StartWhenAvailable><AllowStartOnDemand>true</AllowStartOnDemand><Enabled>true</Enabled><Hidden>false</Hidden><RunOnlyIfIdle>false</RunOnlyIfIdle><RestartOnFailure><Interval>PT1M</Interval><Count>5</Count></RestartOnFailure><ExecutionTimeLimit>P365D</ExecutionTimeLimit></Settings>"
$xmlL += "  <Actions Context=""Author""><Exec><Command>$svcCmd</Command><WorkingDirectory>$backendDir</WorkingDirectory></Exec></Actions>"
$xmlL += "</Task>"
$xmlFile = Join-Path $env:TEMP "admpro_task.xml"
[System.IO.File]::WriteAllLines($xmlFile, $xmlL)

schtasks /delete /tn "AD Manager Pro" /f 2>$null
$taskResult = & schtasks /create /tn "AD Manager Pro" /xml $xmlFile /f 2>&1
if ([string]$taskResult -match "SUCCESS") { Write-OK "Service created (auto-starts on boot)" }
else { Write-Fail "Could not create service: $taskResult" }
try { Remove-Item $xmlFile -Force } catch {}

# ================================================================
# STEP 12: Firewall
# ================================================================
Write-Host ""
Write-Host "  -- STEP 12: Firewall --" -ForegroundColor Cyan
Remove-FW "AD Manager Pro HTTPS"
Remove-FW "AD Manager Pro HTTP"
$fwOk = Add-FW -Name "AD Manager Pro" -Port ([int]$AppPort)
if ($fwOk) { Write-OK "Firewall rule: TCP port $AppPort" }
else { Write-Fail "Could not create rule. Allow port $AppPort manually." }

# ================================================================
# STEP 13: Start Application
# ================================================================
Write-Host ""
Write-Host "  -- STEP 13: Starting Application --" -ForegroundColor Cyan

schtasks /run /tn "AD Manager Pro" 2>&1 | Out-Null
Write-OK "Start command sent"
Write-Info "Waiting for startup..."
$started = $false
for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 1
    Write-Host "`r  [i] Waiting $i/30 sec..." -ForegroundColor Blue -NoNewline
    try {
        $wc = New-Object System.Net.WebClient
        $resp = $wc.DownloadString("http://localhost:${AppPort}/api/health")
        if ($resp -match "healthy") { $started = $true; break }
    } catch {}
}
Write-Host ""
if ($started) { Write-OK "Application is running and healthy!" }
else {
    Write-Info "May still be starting. Try: http://localhost:${AppPort}"
    Write-Info "Check logs: type `"$backendDir\logs\service.log`""
}

# ================================================================
# Copy uninstall script (NOT the installer itself)
# ================================================================
$uninstSource = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "uninstall.ps1"
if (Test-Path $uninstSource) {
    try { Copy-Item $uninstSource (Join-Path $InstallDir "uninstall.ps1") -Force; Write-OK "Uninstall script copied" } catch {}
} else {
    Write-Info "No separate uninstall.ps1 found in source"
}

# ================================================================
# DONE
# ================================================================
$hn = $env:COMPUTERNAME
$ips = Get-IPs
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "   Installation Complete!" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Access URLs:" -ForegroundColor Cyan
Write-Host "    http://${hn}:$AppPort" -ForegroundColor White
foreach ($ip in $ips) { Write-Host "    http://${ip}:$AppPort" -ForegroundColor Gray }
Write-Host "    http://localhost:$AppPort" -ForegroundColor Gray
Write-Host ""
Write-Host "  Optional: Windows LAPS Integration:" -ForegroundColor Cyan
Write-Host "    To enable LAPS password viewing, on your Domain Controller run:" -ForegroundColor Gray
Write-Host "    Add-ADGroupMember -Identity 'IT Admins' -Members '$hn`$'" -ForegroundColor DarkGray
Write-Host "    Then REBOOT this server for the change to take effect" -ForegroundColor Yellow
Write-Host "    Verify with: See documentation.md section 11" -ForegroundColor Gray
Write-Host ""
Write-Host "  Login:" -ForegroundColor Cyan
Write-Host "    Username: $adminUser" -ForegroundColor White
Write-Host "    Password: Your AD password" -ForegroundColor White
Write-Host ""
Write-Host "  Install Path: $InstallDir" -ForegroundColor White
Write-Host ""
Write-Host "  Commands:" -ForegroundColor Cyan
Write-Host "    Start : schtasks /run /tn `"AD Manager Pro`"" -ForegroundColor Gray
Write-Host "    Stop  : schtasks /end /tn `"AD Manager Pro`"" -ForegroundColor Gray
Write-Host "    Logs  : type `"$backendDir\logs\service.log`"" -ForegroundColor Gray
Write-Host ""
Write-Host "  Uninstall:" -ForegroundColor Cyan
Write-Host "    powershell -ExecutionPolicy Bypass -File `"$InstallDir\uninstall.ps1`"" -ForegroundColor Gray
Write-Host ""
Write-Host "  API Docs: http://${hn}:$AppPort/docs" -ForegroundColor Gray
Write-Host ""
Read-Host "  Press Enter to finish"
