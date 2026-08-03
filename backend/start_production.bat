@echo off
REM ============================================================
REM DC Manager Pro - Production Server (HTTP)
REM ============================================================

title DC Manager Pro - Production

REM ── Navigate to backend directory ─────────────────────────────
cd /d "C:\AD Pro\public\backend"

REM ── Check virtual environment exists ─────────────────────────
if not exist "venv\Scripts\python.exe" (
    echo ERROR: Virtual environment not found.
    exit /b 1
)

REM ── Check app.py exists ───────────────────────────────────────
if not exist "app.py" (
    echo ERROR: app.py not found.
    exit /b 1
)

REM ── Check .env exists ─────────────────────────────────────────
if not exist ".env" (
    echo ERROR: .env file not found.
    exit /b 1
)

REM ── Start production server (HTTP only, no SSL) ───────────────
venv\Scripts\python.exe -m uvicorn app:app ^
    --host 0.0.0.0 ^
    --port 8080 ^
    --workers 4 ^
    --log-level info >> logs\service.log 2>&1