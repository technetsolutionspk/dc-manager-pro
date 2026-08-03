# ═══════════════════════════════════════════════════════════════════
# DC Manager Pro - Git Update Script v2.6.1
# ═══════════════════════════════════════════════════════════════════
# Usage:
#   powershell -ExecutionPolicy Bypass -File gitupdate.ps1
#   powershell -ExecutionPolicy Bypass -File gitupdate.ps1 -Message "Fix computer move"
# ═══════════════════════════════════════════════════════════════════

param(
    [string]$Message = ""
)

$ErrorActionPreference = "Continue"

function Write-Step([string]$T)  { Write-Host "  [>] " -ForegroundColor Cyan -NoNewline;   Write-Host $T }
function Write-OK([string]$T)    { Write-Host "  [OK] " -ForegroundColor Green -NoNewline; Write-Host $T -ForegroundColor Gray }
function Write-Fail([string]$T)  { Write-Host "  [X] " -ForegroundColor Red -NoNewline;    Write-Host $T -ForegroundColor Gray }
function Write-Info([string]$T)  { Write-Host "  [i] " -ForegroundColor Blue -NoNewline;   Write-Host $T -ForegroundColor Gray }

Clear-Host
Write-Host ""
Write-Host "  ══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   DC Manager Pro - Git Update v2.6.1"       -ForegroundColor Cyan
Write-Host "  ══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ── Ensure we are in a git repo ──────────────────────────
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not (Test-Path ".git")) {
    Write-Fail "Not a git repository: $scriptDir"
    Read-Host "  Press Enter to exit"
    exit 1
}
Write-OK "Repository: $scriptDir"

# ── Show current branch ──────────────────────────────────
$branch = git rev-parse --abbrev-ref HEAD
Write-OK "Branch: $branch"

# ── Show remote URL ──────────────────────────────────────
$remote = git remote get-url origin 2>$null
if ($remote) {
    Write-OK "Remote: $remote"
} else {
    Write-Fail "No remote configured. Add with: git remote add origin <url>"
    Read-Host "  Press Enter to exit"
    exit 1
}

# ── Pull latest first (avoid conflicts) ──────────────────
Write-Step "Fetching remote changes..."
git fetch 2>&1 | Out-Null

$behind = git rev-list --count HEAD..origin/$branch 2>&1
if ($behind -match "^\d+$" -and [int]$behind -gt 0) {
    Write-Info "Remote is $behind commit(s) ahead. Pulling first..."
    git pull --rebase 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Pull failed - resolve conflicts manually"
        exit 1
    }
    Write-OK "Pulled remote changes"
} else {
    Write-OK "Already up to date with remote"
}

# ── Check for local changes ──────────────────────────────
$status = git status --porcelain
if (-not $status) {
    Write-Info "No local changes to commit"
    Write-Host ""
    Write-Host "  Latest commit:" -ForegroundColor Cyan
    git log -1 --pretty=format:"    %h | %an | %ar%n    %s" | Write-Host -ForegroundColor Gray
    Write-Host ""
    Read-Host "  Press Enter to exit"
    exit 0
}

# ── Show what changed ────────────────────────────────────
Write-Host ""
Write-Host "  Changed Files:" -ForegroundColor Yellow
$newCount = 0; $modCount = 0; $delCount = 0
git status --short | ForEach-Object {
    $line = $_
    if     ($line -match "^\?\?") { Write-Host "    [NEW] $line" -ForegroundColor Green;  $newCount++ }
    elseif ($line -match "^ M|^M")  { Write-Host "    [MOD] $line" -ForegroundColor Yellow; $modCount++ }
    elseif ($line -match "^ D|^D")  { Write-Host "    [DEL] $line" -ForegroundColor Red;    $delCount++ }
    elseif ($line -match "^A")    { Write-Host "    [ADD] $line" -ForegroundColor Green;  $newCount++ }
    else                          { Write-Host "         $line"  -ForegroundColor Gray }
}
Write-Host ""
Write-Info "Summary: $newCount new, $modCount modified, $delCount deleted"

# ── Get commit message ───────────────────────────────────
if (-not $Message) {
    Write-Host ""
    Write-Host "  Enter commit message (or press Enter for auto-message):" -ForegroundColor Yellow
    $Message = Read-Host "  Message"
}
if (-not $Message) {
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm'
    $Message = "DC Manager Pro v2.6.1: Update $ts"
}
Write-OK "Message: $Message"

# ── Stage all changes ────────────────────────────────────
Write-Step "Staging changes..."
git add . 2>&1 | Out-Null
Write-OK "Staged all changes"

# ── Commit ───────────────────────────────────────────────
Write-Step "Committing..."
$commitOutput = git commit -m "$Message" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-OK "Committed successfully"
} else {
    Write-Fail "Commit failed"
    Write-Host "        $commitOutput" -ForegroundColor DarkYellow
    exit 1
}

# ── Push ─────────────────────────────────────────────────
Write-Step "Pushing to origin/$branch..."
$pushOutput = git push origin $branch 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-OK "Pushed to origin/$branch"
} else {
    Write-Fail "Push failed - trying with force..."
    $pushForce = git push origin $branch --force 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-OK "Force pushed to origin/$branch"
    } else {
        Write-Fail "Push failed"
        Write-Host "        $pushForce" -ForegroundColor DarkYellow
        exit 1
    }
}

# ── Show latest commit ───────────────────────────────────
Write-Host ""
Write-Host "  ══════════════════════════════════════════" -ForegroundColor Green
Write-Host "   Latest Commit:" -ForegroundColor Green
Write-Host "  ══════════════════════════════════════════" -ForegroundColor Green
git log -1 --pretty=format:"    Hash:    %h%n    Author:  %an%n    Date:    %ar%n    Message: %s" | Write-Host -ForegroundColor Gray
Write-Host ""
Write-Host "  ══════════════════════════════════════════" -ForegroundColor Green
Write-Host "   GitHub: https://github.com/technetsolutionspk/dc-manager-pro" -ForegroundColor Green
Write-Host "  ══════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-OK "Update complete!"
Write-Host ""
Read-Host "  Press Enter to exit"