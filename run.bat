@echo off
echo ===================================================
echo             STARTING TESTLY AI PLATFORM
echo ===================================================
echo.

echo [1/2] Launching FastAPI Backend Server...
start "Testly AI - Backend Server" cmd /k "cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo.
echo [2/2] Launching Vite React Frontend Server...
start "Testly AI - Frontend Dashboard" cmd /k "cd frontend && npm run dev"

echo.
echo ===================================================
echo  Both services launched in separate windows!
echo.
echo  - Frontend Dashboard: http://localhost:5173
echo  - Backend Agent API:  http://localhost:8000
echo ===================================================
pause
