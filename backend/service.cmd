@echo off
cd /d "C:\DC Pro\public\backend"
"C:\AD Pro\public\backend\venv\Scripts\python.exe" -m uvicorn app:app --host 0.0.0.0 --port 8080 --workers 1 --log-level info >> "C:\DC Pro\public\backend\logs\service.log" 2>&1