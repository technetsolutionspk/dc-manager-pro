@echo off
REM ============================================================
REM DC Manager Pro — Windows Setup Script
REM Run as Administrator on a Windows machine with AD access
REM ============================================================

setlocal EnableDelayedExpansion
title DC Manager Pro Setup

echo.
echo  ==========================================
echo   DC Manager Pro
echo   Active Directory Management Platform v1.0
echo   Setup Script for Windows
echo  ==========================================
echo.

REM ── Check Python ─────────────────────────────────────────────
echo [1/8] Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python 3.11+ from https://python.org
    echo        Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)
python -c "import sys; exit(0 if sys.version_info >= (3,11) else 1)" >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python 3.11 or higher is required.
    echo        Current version:
    python --version
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do echo    OK: %%i

REM ── Create directory structure ────────────────────────────────
echo.
echo [2/8] Creating directory structure...
if not exist "backend"    mkdir backend
if not exist "database"   mkdir database
if not exist "certs"      mkdir certs
if not exist "logs"       mkdir logs
echo    OK: Directories created

REM ── Create virtual environment ────────────────────────────────
echo.
echo [3/8] Creating Python virtual environment...
if not exist "venv" (
    python -m venv venv
    echo    OK: Virtual environment created
) else (
    echo    OK: Virtual environment already exists
)

REM ── Activate venv and install deps ───────────────────────────
echo.
echo [4/8] Installing Python dependencies...
call venv\Scripts\activate.bat

REM Use python -m pip instead of pip to avoid permission issues
echo    Upgrading pip...
venv\Scripts\python.exe -m pip install --upgrade pip --quiet
if errorlevel 1 (
    echo    WARNING: Could not upgrade pip, continuing anyway...
)

echo    Installing packages from requirements.txt...
venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo ERROR: Failed to install dependencies
    echo        Check your internet connection and requirements.txt
    pause
    exit /b 1
)
echo    OK: Dependencies installed

REM ── Generate self-signed SSL cert ────────────────────────────
echo.
echo [5/8] Generating self-signed SSL certificate...
if not exist "certs\cert.pem" (
    venv\Scripts\python.exe generate_cert.py
    if errorlevel 1 (
        echo    ERROR: Certificate generation failed
        pause
        exit /b 1
    )
) else (
    echo    OK: Certificate already exists
)

REM ── Create config file ────────────────────────────────────────
echo.
echo [6/8] Creating configuration file...
if not exist ".env" (
    echo # DC Manager Pro Configuration > .env
    echo # REQUIRED: Update these values for your environment >> .env
    echo. >> .env
    echo # Active Directory Settings >> .env
    echo AD_SERVER_PRIMARY=192.168.1.10 >> .env
    echo AD_SERVER_SECONDARY=192.168.1.11 >> .env
    echo AD_DOMAIN=corp.local >> .env
    echo AD_BASE_DN=DC=corp,DC=local >> .env
    echo AD_SERVICE_ACCOUNT=svc-dcmanager@corp.local >> .env
    echo AD_SERVICE_PASSWORD=CHANGE_ME_ServiceAccountP@ssw0rd >> .env
    echo AD_USE_LDAPS=true >> .env
    echo AD_PORT=636 >> .env
    echo. >> .env
    echo # Security >> .env
    echo SECRET_KEY=CHANGE_ME_generate_a_random_secret_key_here >> .env
    echo. >> .env
    echo # Application >> .env
    echo APP_PORT=8443 >> .env
    echo APP_HOST=0.0.0.0 >> .env
    echo    OK: .env file created - PLEASE EDIT with your AD settings!
) else (
    echo    OK: .env file already exists
)

REM ── Initialize database ────────────────────────────────────────
echo.
echo [7/8] Initializing database...
if not exist "database" mkdir database
venv\Scripts\python.exe init_db.py
if errorlevel 1 (
    echo    OK: Database will initialize on first run
)

REM ── Summary ───────────────────────────────────────────────────
echo.
echo [8/8] Setup complete!
echo.
echo  ==========================================
echo  NEXT STEPS:
echo  ==========================================
echo.
echo  1. Edit .env file with your Active Directory settings:
echo     notepad .env
echo.
echo  2. Add authorized users to the database:
echo     python -c "from app import *; db=SessionLocal(); db.add(AppUser(username='j.smith', display_name='John Smith', email='j.smith@corp.com', role='Admin', active=True)); db.commit()"
echo.
echo  3. Start the backend:
echo     start.bat
echo.
echo  4. Open browser: https://localhost:8443
echo.
echo  IMPORTANT SECURITY NOTES:
echo  - Change the SECRET_KEY in .env before production use
echo  - Use a dedicated service account with minimal permissions
echo  - Enable LDAPS (port 636) for encrypted communication
echo  - Install the self-signed cert in Trusted Root CA store
echo.
pause