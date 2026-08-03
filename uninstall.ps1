# AD Manager Pro - Uninstaller
# Run as: powershell -ExecutionPolicy Bypass -File uninstall.ps1

$ErrorActionPreference = "Continue"
$InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-OK([string]$T) { Write-Host "  [OK] " -ForegroundColor Green -NoNewline; Write-Host $T -ForegroundColor Gray }
function Write-Fail([string]$T) { Write-Host "  [X] " -ForegroundColor Red -NoNewline; Write-Host $T -ForegroundColor Gray }
function Write-Info([string]$T) { Write-Host "  [i] " -ForegroundColor Blue -NoNewline; Write-Host $T -ForegroundColor Gray }
function Write-Step([string]$N, [string]$T) { Write-Host "  [$N] " -ForegroundColor Yellow -NoNewline; Write-Host $T }

# Check admin
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$pr = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Fail "Must run as Administrator"
    Read-Host "  Press Enter to exit"
    exit 1
}

Clear-Host
Write-Host ""
Write-Host "  ============================================" -ForegroundColor Red
Write-Host "   AD Manager Pro - Uninstaller" -ForegroundColor Red
Write-Host "  ============================================" -ForegroundColor Red
Write-Host ""
Write-Host "  Install location: $InstallDir" -ForegroundColor White
Write-Host ""
Write-Host "  This will remove:" -ForegroundColor White
Write-Host "    - Windows scheduled task" -ForegroundColor Gray
Write-Host "    - Firewall rules" -ForegroundColor Gray
Write-Host "    - All application files" -ForegroundColor Gray
Write-Host ""

Write-Host "  Are you sure you want to uninstall? (yes/no): " -ForegroundColor Yellow -NoNewline
$confirm = Read-Host
if ($confirm -ne "yes") { Write-Info "Cancelled"; exit 0 }

# Ask about database backup
Write-Host "  Keep database backup (audit logs, settings)? (yes/no) [yes]: " -ForegroundColor Yellow -NoNewline
$keepDb = Read-Host
if (-not $keepDb) { $keepDb = "yes" }

Write-Host ""

#  Step 1: Stop scheduled tasks 
Write-Step "1" "Stopping scheduled tasks..."
try { & schtasks /end /tn "AD Manager Pro" 2>&1 | Out-Null } catch {}
try { & schtasks /end /tn "AD Manager Pro HTTP" 2>&1 | Out-Null } catch {}
Start-Sleep -Seconds 2
Write-OK "Tasks stopped"

#  Step 2: Delete scheduled tasks 
Write-Step "2" "Removing scheduled tasks..."
try { & schtasks /delete /tn "AD Manager Pro" /f 2>&1 | Out-Null } catch {}
try { & schtasks /delete /tn "AD Manager Pro HTTP" /f 2>&1 | Out-Null } catch {}
Write-OK "Tasks removed"

#  Step 3: Remove firewall rules 
Write-Step "3" "Removing firewall rules..."
try { & netsh advfirewall firewall delete rule name="AD Manager Pro" 2>&1 | Out-Null } catch {}
try { & netsh advfirewall firewall delete rule name="AD Manager Pro HTTPS" 2>&1 | Out-Null } catch {}
try { & netsh advfirewall firewall delete rule name="AD Manager Pro HTTP" 2>&1 | Out-Null } catch {}
Write-OK "Firewall rules removed"

#  Step 4: Kill Python processes 
Write-Step "4" "Stopping all Python processes..."
try {
    Get-Process | Where-Object { $_.ProcessName -like "*python*" } | Stop-Process -Force -ErrorAction SilentlyContinue
} catch {}
Write-Host "  [i] Waiting for processes to fully stop..." -ForegroundColor Blue
Start-Sleep -Seconds 5

# Double check
$remaining = Get-Process | Where-Object { $_.ProcessName -like "*python*" }
if ($remaining) {
    Write-Info "Python still running, force killing..."
    $remaining | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
}
Write-OK "Processes stopped"

#  Step 5: Backup database if requested 
if ($keepDb -eq "yes") {
    Write-Step "5" "Backing up database..."
    $dbFile = Join-Path $InstallDir "backend\database\audit.db"
    $desktop = [System.Environment]::GetFolderPath("Desktop")
    $dbBackup = Join-Path $desktop "admanagerpro_audit.db.backup"
    if (Test-Path $dbFile) {
        try {
            Copy-Item $dbFile $dbBackup -Force
            Write-OK "Database backed up to: $dbBackup"
        } catch {
            Write-Fail "Could not backup database: $_"
        }
    } else {
        Write-Info "No database file found"
    }
} else {
    Write-Info "Database backup skipped"
}

#  Step 6: Change directory AWAY from install folder 
Write-Step "6" "Removing application files..."

# CRITICAL: Must leave the install directory before deleting it
Set-Location "C:\"

# Small delay to release any file handles
Start-Sleep -Seconds 2

# Try removing everything
if (Test-Path $InstallDir) {
    try {
        Remove-Item $InstallDir -Recurse -Force -ErrorAction Stop
        Write-OK "All files removed"
    } catch {
        Write-Info "First attempt failed, retrying..."
        Start-Sleep -Seconds 3
        try {
            # Try using cmd.exe rmdir which handles long paths better
            & cmd /c "rmdir /s /q `"$InstallDir`"" 2>&1 | Out-Null
            if (-not (Test-Path $InstallDir)) {
                Write-OK "All files removed (using rmdir)"
            } else {
                # Try removing contents first then folder
                Get-ChildItem $InstallDir -Force -ErrorAction SilentlyContinue | ForEach-Object {
                    try { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue } catch {}
                }
                Start-Sleep -Seconds 2
                try { Remove-Item $InstallDir -Force -ErrorAction SilentlyContinue } catch {}
                if (-not (Test-Path $InstallDir)) {
                    Write-OK "All files removed"
                } else {
                    Write-Fail "Some files could not be removed"
                    Write-Info "Remaining files:"
                    Get-ChildItem $InstallDir -Recurse -Force -ErrorAction SilentlyContinue | Select-Object FullName
                    Write-Info "Try rebooting and manually deleting: $InstallDir"
                }
            }
        } catch {
            Write-Fail "Could not remove files: $_"
            Write-Info "Try rebooting and manually deleting: $InstallDir"
        }
    }
} else {
    Write-Info "Install directory not found (already removed)"
}

#  Final Status 
Write-Host ""
if (-not (Test-Path $InstallDir)) {
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host "   Uninstall Complete!" -ForegroundColor Green
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Everything has been removed:" -ForegroundColor White
    Write-Host "    - Scheduled tasks deleted" -ForegroundColor Gray
    Write-Host "    - Firewall rules removed" -ForegroundColor Gray
    Write-Host "    - Application files deleted" -ForegroundColor Gray
    if ($keepDb -eq "yes") {
        Write-Host "    - Database backed up to Desktop" -ForegroundColor Gray
    }
} else {
    Write-Host "  ============================================" -ForegroundColor Yellow
    Write-Host "   Partial Uninstall" -ForegroundColor Yellow
    Write-Host "  ============================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Services and firewall rules removed." -ForegroundColor White
    Write-Host "  Some files remain at: $InstallDir" -ForegroundColor Yellow
    Write-Host "  Reboot and delete the folder manually." -ForegroundColor Yellow
}

Write-Host ""
Read-Host "  Press Enter to exit"
