@echo off
REM ============================================================
REM DC Manager Pro - Start Backend Server (HTTP)
REM ============================================================

title DC Manager Pro - Backend Server

echo.
echo  ==========================================
echo   DC Manager Pro - Starting Backend
echo  ==========================================
echo.

REM ── Check virtual environment exists ─────────────────────────
if not exist "venv\Scripts\activate.bat" (
    echo ERROR: Virtual environment not found.
    echo        Please run setup.bat first.
    pause
    exit /b 1
)

REM ── Check .env file exists ────────────────────────────────────
if not exist ".env" (
    echo ERROR: .env file not found.
    echo        Please run setup.bat first.
    pause
    exit /b 1
)

REM ── Check app.py exists ───────────────────────────────────────
if not exist "app.py" (
    echo ERROR: app.py not found.
    echo        Make sure you are in the correct folder.
    pause
    exit /b 1
)

REM ── Activate virtual environment ──────────────────────────────
echo    Activating virtual environment...
call venv\Scripts\activate.bat

REM ── Show startup info ─────────────────────────────────────────
echo    OK: Virtual environment activated
echo.
echo  ==========================================
echo   Server Information
echo  ==========================================
echo.
echo   URL:      http://localhost:8080
echo   API Docs: http://localhost:8080/docs
echo   Status:   Starting...
echo.
echo   Press CTRL+C to stop the server
echo  ==========================================
echo.

REM ── Start the server (HTTP only, no SSL) ──────────────────────
venv\Scripts\python.exe -m uvicorn app:app ^
    --host 0.0.0.0 ^
    --port 8080 ^
    --reload ^
    --log-level info

REM ── If server stops ───────────────────────────────────────────
echo.
echo  ==========================================
echo   Server stopped.
echo  ==========================================
echo.
pause