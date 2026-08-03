# ═══════════════════════════════════════════════════════════════════
# AD Manager Pro - Domain Controller Permission Setup Script
# Version: 2.3.0
# ═══════════════════════════════════════════════════════════════════
#
# PURPOSE:
#   Grants an AD service account all permissions required to fully
#   manage users, groups, computers, OUs, GPOs, and photos via LDAP.
#
# REQUIREMENTS:
#   - Must be run on a Domain Controller
#   - Must be run as Domain Admin (or Enterprise Admin)
#   - The service account must already exist in Active Directory
#
# USAGE:
#   powershell -ExecutionPolicy Bypass -File setup_permissions.ps1
#
# ═══════════════════════════════════════════════════════════════════

param(
    [string]$ServiceAccount = "",
    [switch]$Quiet
)

$ErrorActionPreference = "Continue"
$Version = "2.3.0"

# ─────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────
function Write-Header([string]$Text) {
    Write-Host ""
    Write-Host "  ════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "   $Text" -ForegroundColor Cyan
    Write-Host "  ════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Section([string]$Text) {
    Write-Host ""
    Write-Host "  ── $Text ──────────────────────────────" -ForegroundColor Yellow
}

function Write-OK([string]$Text) {
    Write-Host "  [OK]   " -ForegroundColor Green -NoNewline
    Write-Host $Text -ForegroundColor Gray
}

function Write-Fail([string]$Text) {
    Write-Host "  [FAIL] " -ForegroundColor Red -NoNewline
    Write-Host $Text -ForegroundColor Gray
}

function Write-Info([string]$Text) {
    Write-Host "  [i]    " -ForegroundColor Blue -NoNewline
    Write-Host $Text -ForegroundColor Gray
}

function Write-Warn([string]$Text) {
    Write-Host "  [!]    " -ForegroundColor Yellow -NoNewline
    Write-Host $Text -ForegroundColor Gray
}

function Test-Admin {
    $identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-DomainInfo {
    try {
        $domain   = [System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain()
        $domainDn = "DC=" + ($domain.Name -replace "\.", ",DC=")
        return @{
            Name = $domain.Name
            DN   = $domainDn
            NetBIOS = $domain.Name.Split(".")[0].ToUpper()
        }
    } catch {
        return $null
    }
}

function Test-ServiceAccount([string]$SamName, [string]$DomainDn) {
    try {
        $entry    = New-Object System.DirectoryServices.DirectoryEntry("LDAP://$DomainDn")
        $searcher = New-Object System.DirectoryServices.DirectorySearcher($entry)
        $searcher.Filter = "(&(objectClass=user)(sAMAccountName=$SamName))"
        $searcher.PropertiesToLoad.Add("distinguishedName") | Out-Null
        $result = $searcher.FindOne()
        if ($result) {
            return $result.Properties["distinguishedname"][0]
        }
        return $null
    } catch {
        return $null
    }
}

function Invoke-Dsacls {
    param(
        [string]$Target,
        [string]$Account,
        [string]$Rights,
        [string]$Description,
        [switch]$Silent
    )
    $cmd = "dsacls `"$Target`" /G `"${Account}:${Rights}`""
    try {
        $output = cmd /c $cmd 2>&1
        $success = $LASTEXITCODE -eq 0 -or ($output -match "successfully")

        if ($success) {
            if (-not $Silent) { Write-OK $Description }
            return $true
        } else {
            Write-Fail "$Description"
            $errLine = ($output | Where-Object { $_ -match "error|fail|denied" } | Select-Object -First 1)
            if ($errLine) { Write-Host "         $errLine" -ForegroundColor DarkYellow }
            return $false
        }
    } catch {
        Write-Fail "$Description - Exception: $_"
        return $false
    }
}

function Invoke-DsaclsInherit {
    param(
        [string]$Target,
        [string]$Account,
        [string]$InheritFlag,
        [string]$Rights,
        [string]$Description,
        [switch]$Silent
    )
    $cmd = "dsacls `"$Target`" /I:$InheritFlag /G `"${Account}:${Rights}`""
    try {
        $output = cmd /c $cmd 2>&1
        $success = $LASTEXITCODE -eq 0 -or ($output -match "successfully")

        if ($success) {
            if (-not $Silent) { Write-OK $Description }
            return $true
        } else {
            Write-Fail "$Description"
            $errLine = ($output | Where-Object { $_ -match "error|fail|denied|incorrect" } | Select-Object -First 1)
            if ($errLine) { Write-Host "         $errLine" -ForegroundColor DarkYellow }
            return $false
        }
    } catch {
        Write-Fail "$Description - Exception: $_"
        return $false
    }
}

# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════
Clear-Host
Write-Header "AD Manager Pro - Permission Setup v$Version"

# ── Check Admin ──────────────────────────────────────────────
if (-not (Test-Admin)) {
    Write-Fail "This script must be run as Administrator (Domain Admin recommended)"
    Read-Host "  Press Enter to exit"
    exit 1
}
Write-OK "Running as Administrator"

# ── Detect Domain ────────────────────────────────────────────
Write-Section "Detecting Domain"
$domainInfo = Get-DomainInfo
if (-not $domainInfo) {
    Write-Fail "Could not detect domain. Are you on a Domain Controller?"
    Read-Host "  Press Enter to exit"
    exit 1
}
Write-OK "Domain: $($domainInfo.Name)"
Write-OK "Base DN: $($domainInfo.DN)"
Write-OK "NetBIOS: $($domainInfo.NetBIOS)"

# ── Get Service Account ──────────────────────────────────────
Write-Section "Service Account"
if (-not $ServiceAccount) {
    Write-Host "  Enter the service account username (sAMAccountName)" -ForegroundColor Yellow
    Write-Host "  Example: svc-admanager" -ForegroundColor DarkGray
    $ServiceAccount = Read-Host "  Account"
}

if (-not $ServiceAccount) {
    Write-Fail "Service account name is required"
    exit 1
}

# Strip domain if user included it
if ($ServiceAccount -match "@") { $ServiceAccount = $ServiceAccount.Split("@")[0] }
if ($ServiceAccount -match "\\") { $ServiceAccount = $ServiceAccount.Split("\")[-1] }

$accountDn = Test-ServiceAccount -SamName $ServiceAccount -DomainDn $domainInfo.DN
if (-not $accountDn) {
    Write-Fail "Service account '$ServiceAccount' not found in $($domainInfo.Name)"
    Write-Info "Create it first with: New-ADUser -Name '$ServiceAccount' -SamAccountName '$ServiceAccount'"
    Read-Host "  Press Enter to exit"
    exit 1
}
Write-OK "Found: $accountDn"

# ── Build account identifier for dsacls ──────────────────────
$accountId = "$($domainInfo.NetBIOS)\$ServiceAccount"
$baseDn    = $domainInfo.DN

# ── Confirmation ─────────────────────────────────────────────
Write-Section "Summary"
Write-Info "Domain:          $($domainInfo.Name)"
Write-Info "Base DN:         $baseDn"
Write-Info "Service Account: $accountId"
Write-Info "Account DN:      $accountDn"
Write-Host ""
Write-Warn "This will grant the service account extensive AD permissions."
Write-Warn "These permissions allow full management of users, groups, computers,"
Write-Warn "OUs, GPOs, and user photos across the entire domain."
Write-Host ""

if (-not $Quiet) {
    $confirm = Read-Host "  Proceed? (yes/no)"
    if ($confirm -ne "yes") {
        Write-Info "Cancelled by user"
        exit 0
    }
}

# ═══════════════════════════════════════════════════════════════════
# APPLY PERMISSIONS
# ═══════════════════════════════════════════════════════════════════
$successCount = 0
$failCount    = 0

# ─────────────────────────────────────────────────────────────────
# DOMAIN ROOT - Read Access
# ─────────────────────────────────────────────────────────────────
Write-Section "Domain Root - Read Access"

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "GR" `
    -Description "Generic Read on entire domain") { $successCount++ } else { $failCount++ }

if (Invoke-Dsacls -Target $baseDn -Account $accountId -Rights "RP;gPLink" `
    -Description "Read gPLink attribute (for GPO detection)") { $successCount++ } else { $failCount++ }

# ─────────────────────────────────────────────────────────────────
# USER OBJECTS - Full Management
# ─────────────────────────────────────────────────────────────────
Write-Section "User Objects - Full Management"

if (Invoke-Dsacls -Target $baseDn -Account $accountId -Rights "CC;user" `
    -Description "Create user objects") { $successCount++ } else { $failCount++ }

if (Invoke-Dsacls -Target $baseDn -Account $accountId -Rights "DC;user" `
    -Description "Delete user objects (from OUs)") { $successCount++ } else { $failCount++ }

if (Invoke-Dsacls -Target $baseDn -Account $accountId -Rights "SD;;user" `
    -Description "Standard delete on user objects") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "WP;;user" `
    -Description "Write all properties on user objects") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "WD;;user" `
    -Description "Write DACL on user objects (for renames/moves)") { $successCount++ } else { $failCount++ }

# ─────────────────────────────────────────────────────────────────
# USER OBJECTS - Specific Attributes (Password, Photo, Status)
# ─────────────────────────────────────────────────────────────────
Write-Section "User Objects - Sensitive Attributes"

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "CA;Reset Password;user" `
    -Description "Reset Password extended right") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "WP;pwdLastSet;user" `
    -Description "Write pwdLastSet (force password change at logon)") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "WP;unicodePwd;user" `
    -Description "Write unicodePwd (set passwords via LDAPS)") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "WP;userAccountControl;user" `
    -Description "Write userAccountControl (enable/disable accounts)") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "WP;lockoutTime;user" `
    -Description "Write lockoutTime (unlock user accounts)") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "WP;thumbnailPhoto;user" `
    -Description "Write thumbnailPhoto (user photos)") { $successCount++ } else { $failCount++ }

# ─────────────────────────────────────────────────────────────────
# GROUP OBJECTS - Full Management
# ─────────────────────────────────────────────────────────────────
Write-Section "Group Objects - Full Management"

if (Invoke-Dsacls -Target $baseDn -Account $accountId -Rights "CC;group" `
    -Description "Create group objects") { $successCount++ } else { $failCount++ }

if (Invoke-Dsacls -Target $baseDn -Account $accountId -Rights "DC;group" `
    -Description "Delete group objects (from OUs)") { $successCount++ } else { $failCount++ }

if (Invoke-Dsacls -Target $baseDn -Account $accountId -Rights "SD;;group" `
    -Description "Standard delete on group objects") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "WP;;group" `
    -Description "Write all properties on group objects") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "WP;member;group" `
    -Description "Write member attribute (manage group membership)") { $successCount++ } else { $failCount++ }

# ─────────────────────────────────────────────────────────────────
# COMPUTER OBJECTS - Full Management (Fixed for Move Operations)
# ─────────────────────────────────────────────────────────────────
Write-Section "Computer Objects - Full Management"

if (Invoke-Dsacls -Target $baseDn -Account $accountId -Rights "CC;computer" `
    -Description "Create computer objects") { $successCount++ } else { $failCount++ }

if (Invoke-Dsacls -Target $baseDn -Account $accountId -Rights "DC;computer" `
    -Description "Delete computer objects (from OUs)") { $successCount++ } else { $failCount++ }

if (Invoke-Dsacls -Target $baseDn -Account $accountId -Rights "SD;;computer" `
    -Description "Standard delete on computer objects") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "WP;;computer" `
    -Description "Write all properties on computers (required for MOVE)") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "WD;;computer" `
    -Description "Write DACL on computers (required for MOVE)") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "WP;userAccountControl;computer" `
    -Description "Write userAccountControl (enable/disable computers)") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "WP;description;computer" `
    -Description "Write description on computers") { $successCount++ } else { $failCount++ }

# ─────────────────────────────────────────────────────────────────
# ORGANIZATIONAL UNITS - Full Management
# ─────────────────────────────────────────────────────────────────
Write-Section "Organizational Units - Full Management"

if (Invoke-Dsacls -Target $baseDn -Account $accountId -Rights "CC;organizationalUnit" `
    -Description "Create OU objects") { $successCount++ } else { $failCount++ }

if (Invoke-Dsacls -Target $baseDn -Account $accountId -Rights "DC;organizationalUnit" `
    -Description "Delete OU objects") { $successCount++ } else { $failCount++ }

if (Invoke-Dsacls -Target $baseDn -Account $accountId -Rights "SD;;organizationalUnit" `
    -Description "Standard delete on OU objects") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "WP;;organizationalUnit" `
    -Description "Write all properties on OUs (for renames)") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "WP;description;organizationalUnit" `
    -Description "Write description on OUs") { $successCount++ } else { $failCount++ }

# ─────────────────────────────────────────────────────────────────
# CROSS-OU MOVES - Critical for Move Operations
# ─────────────────────────────────────────────────────────────────
Write-Section "Cross-OU Moves - Required for Move Operations"

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "CCDC;user;organizationalUnit" `
    -Description "Create/Delete user children in any OU (for user MOVE)") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "CCDC;computer;organizationalUnit" `
    -Description "Create/Delete computer children in any OU (for computer MOVE)") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $baseDn -Account $accountId -InheritFlag "S" -Rights "CCDC;group;organizationalUnit" `
    -Description "Create/Delete group children in any OU (for group MOVE)") { $successCount++ } else { $failCount++ }

# ─────────────────────────────────────────────────────────────────
# GPO CONTAINER - Read Access
# ─────────────────────────────────────────────────────────────────
Write-Section "Group Policy Objects - Read Access"

$policiesDn = "CN=Policies,CN=System,$baseDn"
$systemDn   = "CN=System,$baseDn"

if (Invoke-DsaclsInherit -Target $systemDn -Account $accountId -InheritFlag "T" -Rights "GR" `
    -Description "Generic Read on CN=System") { $successCount++ } else { $failCount++ }

if (Invoke-DsaclsInherit -Target $policiesDn -Account $accountId -InheritFlag "T" -Rights "GR" `
    -Description "Generic Read on CN=Policies (all GPOs)") { $successCount++ } else { $failCount++ }

# ─────────────────────────────────────────────────────────────────
# BUILT-IN CONTAINERS - Read/Write for Default Placements
# ─────────────────────────────────────────────────────────────────
Write-Section "Built-in Containers"

$usersContainer     = "CN=Users,$baseDn"
$computersContainer = "CN=Computers,$baseDn"

if (Test-Path "AD:\$usersContainer") {
    if (Invoke-DsaclsInherit -Target $usersContainer -Account $accountId -InheritFlag "T" -Rights "GR" `
        -Description "Read CN=Users container") { $successCount++ } else { $failCount++ }

    if (Invoke-Dsacls -Target $usersContainer -Account $accountId -Rights "CC;user" `
        -Description "Create users in CN=Users") { $successCount++ } else { $failCount++ }

    if (Invoke-Dsacls -Target $usersContainer -Account $accountId -Rights "DC;user" `
        -Description "Delete users from CN=Users") { $successCount++ } else { $failCount++ }
} else {
    Write-Warn "CN=Users container not accessible via AD: drive - skipping"
}

if (Test-Path "AD:\$computersContainer") {
    if (Invoke-DsaclsInherit -Target $computersContainer -Account $accountId -InheritFlag "T" -Rights "GR" `
        -Description "Read CN=Computers container") { $successCount++ } else { $failCount++ }

    if (Invoke-Dsacls -Target $computersContainer -Account $accountId -Rights "CC;computer" `
        -Description "Create computers in CN=Computers") { $successCount++ } else { $failCount++ }

    if (Invoke-Dsacls -Target $computersContainer -Account $accountId -Rights "DC;computer" `
        -Description "Delete computers from CN=Computers") { $successCount++ } else { $failCount++ }
} else {
    Write-Warn "CN=Computers container not accessible via AD: drive - skipping"
}

# ═══════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════
Write-Header "Setup Complete"

$total = $successCount + $failCount
Write-Host "  Total operations: $total" -ForegroundColor Cyan
Write-Host "  Successful:       $successCount" -ForegroundColor Green
if ($failCount -gt 0) {
    Write-Host "  Failed:           $failCount" -ForegroundColor Red
} else {
    Write-Host "  Failed:           $failCount" -ForegroundColor Gray
}
Write-Host ""

# ─────────────────────────────────────────────────────────────────
# Verification
# ─────────────────────────────────────────────────────────────────
Write-Section "Verifying Permissions"
try {
    $verifyOutput = cmd /c "dsacls `"$baseDn`"" 2>&1
    $accountPerms = $verifyOutput | Select-String $ServiceAccount
    Write-OK "Found $($accountPerms.Count) ACE entries for $ServiceAccount"
    Write-Info "Run this to view details:"
    Write-Host "        dsacls `"$baseDn`" | Select-String `"$ServiceAccount`"" -ForegroundColor DarkGray
} catch {
    Write-Warn "Verification query failed: $_"
}

# ─────────────────────────────────────────────────────────────────
# Post-Install Notes
# ─────────────────────────────────────────────────────────────────
Write-Section "Important Notes"
Write-Info "LDAPS Required for Password Operations:"
Write-Host "         Password resets require LDAP over SSL (port 636)." -ForegroundColor DarkGray
Write-Host "         Install AD Certificate Services on this DC if not already done." -ForegroundColor DarkGray
Write-Host ""
Write-Info "Test the Configuration:"
Write-Host "         1. Log into AD Manager Pro" -ForegroundColor DarkGray
Write-Host "         2. Go to Settings > Active Directory > Test Connection" -ForegroundColor DarkGray
Write-Host "         3. Try to create/edit a test user" -ForegroundColor DarkGray
Write-Host "         4. Try to move a user or computer between OUs" -ForegroundColor DarkGray
Write-Host ""
Write-Info "Rollback (Remove All Permissions):"
Write-Host "         dsacls `"$baseDn`" /R `"$accountId`"" -ForegroundColor DarkGray
Write-Host ""

if ($failCount -gt 0) {
    Write-Warn "Some permissions failed. Review the errors above."
    Write-Warn "Common causes: account not in Domain Admins during script execution,"
    Write-Warn "or trying to modify protected system containers."
} else {
    Write-OK "All permissions applied successfully!"
}

Write-Host ""
if (-not $Quiet) {
    Read-Host "  Press Enter to exit"
}