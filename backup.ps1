# ================================================================
# DC Manager Pro - Full Backup Script v3.1
# ================================================================
# Creates a complete backup ZIP including venv, service.cmd, 
# database, static build, frontend source, and scheduled task.
# Default: C:\DC Pro\Backups\
# Retention: 30 days (auto-cleanup)
# ================================================================

param(
    [string]$BackupDir = "C:\DC Pro\Backups"
)

$projectPath = "C:\DC Pro\public"
$stamp       = Get-Date -Format "yyyyMMdd-HHmmss"
$tempStage   = "C:\DCPro_Backup_$stamp"
$zipPath     = Join-Path $BackupDir "DCPro-FULL-$stamp.zip"
$logFile     = Join-Path $projectPath "backend\logs\backup.log"

function Write-Log {
    param([string]$Message)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $entry = "$ts | $Message"
    Write-Host $entry
    # Ensure logs folder exists
    $logDir = Split-Path $logFile -Parent
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    Add-Content -Path $logFile -Value $entry -ErrorAction SilentlyContinue
}

try {
    Write-Log "=========================================="
    Write-Log "DC Manager Pro - Full Backup Starting"
    Write-Log "=========================================="

    # Create backup directory if needed
    if (-not (Test-Path $BackupDir)) {
        New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
        Write-Log "Created backup directory: $BackupDir"
    }

    # Clean temp staging area
    if (Test-Path $tempStage) { Remove-Item $tempStage -Recurse -Force }
    New-Item -ItemType Directory -Path $tempStage -Force | Out-Null
    New-Item -ItemType Directory -Path "$tempStage\backend" -Force | Out-Null
    New-Item -ItemType Directory -Path "$tempStage\backend\database" -Force | Out-Null
    New-Item -ItemType Directory -Path "$tempStage\backend\logs" -Force | Out-Null
    New-Item -ItemType Directory -Path "$tempStage\frontend" -Force | Out-Null

    # ── Backend Python Files ──────────────────────────────
    Write-Log "Backing up backend Python files..."
    $pyFiles = @("app.py", "models.py", "ad_service.py", "dns_service.py", "dhcp_service.py",
                 "requirements.txt", "service.cmd", ".env",
                 "add_user.py", "generate_cert.py", "init_db.py",
                 "setup.bat", "start.bat", "start_production.bat",
                 "test_domains.py", "test_login.py", "test_search.py")
    foreach ($f in $pyFiles) {
        $src = Join-Path "$projectPath\backend" $f
        if (Test-Path $src) {
            Copy-Item $src "$tempStage\backend\$f" -Force
            Write-Log "  Copied: $f"
        }
    }

    # ── SSL Certificates ──────────────────────────────────
    $certFiles = @("cert.crt", "cert.pem", "key.pem")
    foreach ($f in $certFiles) {
        $src = Join-Path "$projectPath\backend" $f
        if (Test-Path $src) {
            Copy-Item $src "$tempStage\backend\$f" -Force
            Write-Log "  Copied cert: $f"
        }
    }

    # ── Database ──────────────────────────────────────────
    Write-Log "Backing up database..."
    $dbSrc = "$projectPath\backend\database\audit.db"
    if (Test-Path $dbSrc) {
        Copy-Item $dbSrc "$tempStage\backend\database\audit.db" -Force
        $dbSize = (Get-Item $dbSrc).Length / 1KB
        Write-Log "  Database size: $([math]::Round($dbSize, 1)) KB"
    } else {
        Write-Log "  WARNING: audit.db not found"
    }

    # ── Logs ──────────────────────────────────────────────
    Write-Log "Backing up logs..."
    $logFiles = @("app.log", "service.log", "backup.log")
    foreach ($f in $logFiles) {
        $src = "$projectPath\backend\logs\$f"
        if (Test-Path $src) {
            Copy-Item $src "$tempStage\backend\logs\$f" -Force
            Write-Log "  Copied log: $f"
        }
    }

    # ── Static Build (React frontend) ────────────────────
    Write-Log "Backing up static frontend build..."
    $staticSrc = "$projectPath\backend\static"
    if (Test-Path $staticSrc) {
        Copy-Item $staticSrc "$tempStage\backend\static" -Recurse -Force
        $staticCount = (Get-ChildItem "$tempStage\backend\static" -Recurse -File).Count
        Write-Log "  Static files: $staticCount"
    } else {
        Write-Log "  WARNING: static folder not found"
    }

    # ── Virtual Environment (venv) ────────────────────────
    Write-Log "Backing up Python virtual environment..."
    $venvSrc = "$projectPath\backend\venv"
    if (Test-Path $venvSrc) {
        Copy-Item $venvSrc "$tempStage\backend\venv" -Recurse -Force
        $venvSize = (Get-ChildItem "$tempStage\backend\venv" -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
        Write-Log "  venv size: $([math]::Round($venvSize, 1)) MB"
    } else {
        Write-Log "  WARNING: venv folder not found"
    }

    # ── Frontend Source ───────────────────────────────────
    Write-Log "Backing up frontend source..."
    $frontendSrc = "$projectPath\frontend"
    if (Test-Path $frontendSrc) {
        # Copy everything EXCEPT node_modules, dist, .vite
        Get-ChildItem $frontendSrc -Force | Where-Object {
            $_.Name -notin @("node_modules", "dist", ".vite")
        } | ForEach-Object {
            if ($_.PSIsContainer) {
                Copy-Item $_.FullName "$tempStage\frontend\$($_.Name)" -Recurse -Force
            } else {
                Copy-Item $_.FullName "$tempStage\frontend\$($_.Name)" -Force
            }
        }
        Write-Log "  Frontend source copied (excluding node_modules, dist, .vite)"
    } else {
        Write-Log "  WARNING: frontend folder not found"
    }

    # ── Scheduled Task Export ─────────────────────────────
    Write-Log "Exporting scheduled tasks..."
    try {
        schtasks /query /tn "DC Manager Pro" /xml > "$tempStage\scheduled-task-app.xml" 2>$null
        Write-Log "  Exported: DC Manager Pro task"
    } catch { Write-Log "  Could not export app task" }

    try {
        schtasks /query /tn "DC Manager Pro - Daily Backup" /xml > "$tempStage\scheduled-task-backup.xml" 2>$null
        Write-Log "  Exported: Daily Backup task"
    } catch { Write-Log "  Could not export backup task" }

    # ── Backup Info File ──────────────────────────────────
    $backupInfo = @{
        version       = "3.1"
        app           = "DC Manager Pro"
        appVersion    = "2.6.0"
        timestamp     = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
        sourcePath    = $projectPath
        hostname      = $env:COMPUTERNAME
        includes      = @(
            "backend (all Python files)",
            "backend/database/audit.db",
            "backend/.env (SECRET_KEY)",
            "backend/static (built React frontend)",
            "backend/venv (Python virtual environment)",
            "backend/logs",
            "backend/service.cmd",
            "backend/SSL certificates",
            "frontend/src (React source code)",
            "frontend/config files",
            "scheduled-task XML exports"
        )
        excludes      = @("node_modules", "dist", ".vite", "__pycache__")
        restoreNotes  = "Run restore.ps1 to restore. SECRET_KEY in .env must match for domain password decryption."
    }
    $backupInfo | ConvertTo-Json -Depth 3 | Set-Content "$tempStage\backup-info.json"

    # ── Restore Instructions ──────────────────────────────
    @"
DC Manager Pro - Backup Restore Instructions
=============================================
Created: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Source:  $projectPath

To restore this backup, run:
  powershell -ExecutionPolicy Bypass -File restore.ps1 -BackupZip "path\to\this.zip"

Or manually:
  1. Stop service: schtasks /end /tn "DC Manager Pro"
  2. Extract this ZIP to C:\DC Pro\public\
  3. Start service: schtasks /run /tn "DC Manager Pro"

CRITICAL: The .env file contains SECRET_KEY needed to decrypt domain passwords.
Without original SECRET_KEY, domain passwords must be re-entered via Settings UI.
"@ | Set-Content "$tempStage\README.md"

    # ── Create ZIP ────────────────────────────────────────
    Write-Log "Creating ZIP archive..."
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    [System.IO.Compression.ZipFile]::CreateFromDirectory($tempStage, $zipPath)
    $zipSize = (Get-Item $zipPath).Length / 1MB
    Write-Log "ZIP created: $zipPath ($([math]::Round($zipSize, 1)) MB)"

    # ── Cleanup Temp ──────────────────────────────────────
    Remove-Item $tempStage -Recurse -Force -ErrorAction SilentlyContinue

    # ── Retention: Delete backups older than 30 days ──────
    Write-Log "Applying 30-day retention policy..."
    $oldBackups = Get-ChildItem $BackupDir -Filter "*.zip" |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) }
    foreach ($old in $oldBackups) {
        Remove-Item $old.FullName -Force
        Write-Log "  Deleted old backup: $($old.Name)"
    }

    Write-Log "=========================================="
    Write-Log "BACKUP COMPLETE: $zipPath"
    Write-Log "=========================================="

} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    # Cleanup temp on failure
    if (Test-Path $tempStage) { Remove-Item $tempStage -Recurse -Force -ErrorAction SilentlyContinue }
    exit 1
}