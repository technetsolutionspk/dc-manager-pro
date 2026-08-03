# ================================================================
# DC Manager Pro - Full Restore Script v3.1
# ================================================================
# Restores from a backup ZIP created by backup.ps1
# Includes: venv, service.cmd, database, static, frontend source
# ================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$BackupZip = "",
    [string]$ProjectPath = "C:\DC Pro\public",
    [string]$BackupDir = "C:\DC Pro\Backups"
)

$tempRestore = "C:\DCPro_Restore_Temp"

function Write-Log {
    param([string]$Message)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "$ts | $Message"
}

try {
    Write-Log "=========================================="
    Write-Log "DC Manager Pro - Full Restore Starting"
    Write-Log "=========================================="

    # ── Select Backup ZIP ─────────────────────────────────
    if (-not $BackupZip -or -not (Test-Path $BackupZip)) {
        Write-Log "No backup specified or file not found. Listing available backups..."
        $backups = Get-ChildItem $BackupDir -Filter "*.zip" |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 10

        if ($backups.Count -eq 0) {
            Write-Log "ERROR: No backups found in $BackupDir"
            exit 1
        }

        Write-Host ""
        Write-Host "Available Backups:" -ForegroundColor Cyan
        Write-Host "==================" -ForegroundColor Cyan
        for ($i = 0; $i -lt $backups.Count; $i++) {
            $size = [math]::Round($backups[$i].Length / 1MB, 1)
            Write-Host "  [$($i+1)] $($backups[$i].Name)  ($size MB)  $($backups[$i].LastWriteTime)"
        }
        Write-Host ""

        $choice = Read-Host "Select backup number (1-$($backups.Count)) or press Enter for latest"
        if (-not $choice) { $choice = "1" }
        $idx = [int]$choice - 1
        if ($idx -lt 0 -or $idx -ge $backups.Count) {
            Write-Log "ERROR: Invalid selection"
            exit 1
        }
        $BackupZip = $backups[$idx].FullName
    }

    Write-Log "Restoring from: $BackupZip"
    $zipSize = [math]::Round((Get-Item $BackupZip).Length / 1MB, 1)
    Write-Log "Backup size: $zipSize MB"

    # ── Confirm ───────────────────────────────────────────
    Write-Host ""
    Write-Host "WARNING: This will overwrite ALL files in $ProjectPath" -ForegroundColor Yellow
    Write-Host "The current installation will be replaced with the backup." -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host "Type YES to confirm restore"
    if ($confirm -ne "YES") {
        Write-Log "Restore cancelled by user."
        exit 0
    }

    # ── Stop Service ──────────────────────────────────────
    Write-Log "Stopping DC Manager Pro service..."
    schtasks /end /tn "DC Manager Pro" 2>$null
    Start-Sleep -Seconds 3

    # ── Extract Backup ────────────────────────────────────
    Write-Log "Extracting backup..."
    if (Test-Path $tempRestore) { Remove-Item $tempRestore -Recurse -Force }
    New-Item -ItemType Directory -Path $tempRestore -Force | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($BackupZip, $tempRestore)

    # ── Show backup info ──────────────────────────────────
    $infoFile = Join-Path $tempRestore "backup-info.json"
    if (Test-Path $infoFile) {
        $info = Get-Content $infoFile | ConvertFrom-Json
        Write-Log "Backup version: $($info.version)"
        Write-Log "Backup date: $($info.timestamp)"
        Write-Log "Source host: $($info.hostname)"
    }

    # ── Create Target Folders ─────────────────────────────
    Write-Log "Creating folder structure..."
    $folders = @(
        "$ProjectPath\backend",
        "$ProjectPath\backend\database",
        "$ProjectPath\backend\logs",
        "$ProjectPath\backend\static",
        "$ProjectPath\frontend",
        "$ProjectPath\frontend\src",
        "$ProjectPath\frontend\src\pages",
        "$ProjectPath\frontend\src\components"
    )
    foreach ($f in $folders) {
        New-Item -ItemType Directory -Path $f -Force -ErrorAction SilentlyContinue | Out-Null
    }

    # ── Restore Backend Python Files ──────────────────────
    Write-Log "Restoring backend files..."
    $backendSrc = Join-Path $tempRestore "backend"
    if (Test-Path $backendSrc) {
        Get-ChildItem $backendSrc -File | ForEach-Object {
            Copy-Item $_.FullName "$ProjectPath\backend\$($_.Name)" -Force
            Write-Log "  Restored: $($_.Name)"
        }
    }

    # ── Restore Database ──────────────────────────────────
    Write-Log "Restoring database..."
    $dbSrc = "$tempRestore\backend\database\audit.db"
    if (Test-Path $dbSrc) {
        Copy-Item $dbSrc "$ProjectPath\backend\database\audit.db" -Force
        Write-Log "  Restored: audit.db"
    } else {
        Write-Log "  WARNING: audit.db not found in backup"
    }

    # ── Restore Logs Folder ───────────────────────────────
    Write-Log "Restoring logs..."
    $logsSrc = "$tempRestore\backend\logs"
    if (Test-Path $logsSrc) {
        Get-ChildItem $logsSrc -File | ForEach-Object {
            Copy-Item $_.FullName "$ProjectPath\backend\logs\$($_.Name)" -Force
            Write-Log "  Restored: $($_.Name)"
        }
    }

    # ── Restore Static Build ─────────────────────────────
    Write-Log "Restoring static frontend build..."
    $staticSrc = "$tempRestore\backend\static"
    if (Test-Path $staticSrc) {
        # Remove old static and copy fresh
        Remove-Item "$ProjectPath\backend\static" -Recurse -Force -ErrorAction SilentlyContinue
        Copy-Item $staticSrc "$ProjectPath\backend\static" -Recurse -Force
        $count = (Get-ChildItem "$ProjectPath\backend\static" -Recurse -File).Count
        Write-Log "  Restored: $count static files"
    }

    # ── Restore venv ──────────────────────────────────────
    Write-Log "Restoring Python virtual environment..."
    $venvSrc = "$tempRestore\backend\venv"
    if (Test-Path $venvSrc) {
        # Remove old venv and copy fresh
        Remove-Item "$ProjectPath\backend\venv" -Recurse -Force -ErrorAction SilentlyContinue
        Copy-Item $venvSrc "$ProjectPath\backend\venv" -Recurse -Force
        Write-Log "  Restored: venv"
    } else {
        Write-Log "  WARNING: venv not found in backup"
        Write-Log "  You may need to recreate: python -m venv venv && pip install -r requirements.txt"
    }

    # ── Restore Frontend Source ───────────────────────────
    Write-Log "Restoring frontend source..."
    $frontendSrc = "$tempRestore\frontend"
    if (Test-Path $frontendSrc) {
        Get-ChildItem $frontendSrc -Force | ForEach-Object {
            $dest = "$ProjectPath\frontend\$($_.Name)"
            if ($_.PSIsContainer) {
                Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
                Copy-Item $_.FullName $dest -Recurse -Force
            } else {
                Copy-Item $_.FullName $dest -Force
            }
        }
        Write-Log "  Restored: frontend source"
    }

    # ── Restore Scheduled Task ────────────────────────────
    Write-Log "Restoring scheduled tasks..."
    $taskXml = "$tempRestore\scheduled-task-app.xml"
    if (Test-Path $taskXml) {
        Copy-Item $taskXml "$ProjectPath\scheduled-task-app.xml" -Force
        Write-Log "  Saved: scheduled-task-app.xml (import manually if needed)"
    }
    $backupTaskXml = "$tempRestore\scheduled-task-backup.xml"
    if (Test-Path $backupTaskXml) {
        Copy-Item $backupTaskXml "$ProjectPath\scheduled-task-backup.xml" -Force
        Write-Log "  Saved: scheduled-task-backup.xml"
    }

    # ── Cleanup Temp ──────────────────────────────────────
    Write-Log "Cleaning up..."
    Remove-Item $tempRestore -Recurse -Force -ErrorAction SilentlyContinue

    # ── Start Service ─────────────────────────────────────
    Write-Log "Starting DC Manager Pro service..."
    schtasks /run /tn "DC Manager Pro"
    Start-Sleep -Seconds 5

    # ── Verify ────────────────────────────────────────────
    Write-Log "Verifying..."
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:8080/api/health" -ErrorAction Stop
        Write-Log "=========================================="
        Write-Log "✅ RESTORE COMPLETE"
        Write-Log "   Status: $($health.status)"
        Write-Log "   Domain: $($health.domain)"
        Write-Log "   Server: $($health.server)"
        Write-Log "=========================================="
    } catch {
        Write-Log "=========================================="
        Write-Log "⚠️ RESTORE COMPLETE but health check failed"
        Write-Log "   The service may need more time to start."
        Write-Log "   Try: Invoke-RestMethod http://localhost:8080/api/health"
        Write-Log "=========================================="
    }

    Write-Host ""
    Write-Host "Post-Restore Checklist:" -ForegroundColor Cyan
    Write-Host "  1. Login as Admin"
    Write-Host "  2. Settings > Domains: verify domain profiles"
    Write-Host "  3. Settings > Domains: test connection"
    Write-Host "  4. Check Dashboard loads correctly"
    Write-Host "  5. Check DNS/DHCP pages"
    Write-Host "  6. Verify audit logs"
    Write-Host ""

} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    if (Test-Path $tempRestore) { Remove-Item $tempRestore -Recurse -Force -ErrorAction SilentlyContinue }
    exit 1
}