@echo off
title Open Chat - Mock Mode
echo ===================================================
echo Starting Open Chat in MOCK MODE...
echo (No API keys or internet connection required)
echo ===================================================

echo.
echo [1/3] Starting Backend in Mock Mode...
start "Backend API (Mock Mode)" cmd /c "cd backend && .\venv\Scripts\python run_mock.py"

echo [2/3] Starting Frontend (React/Vite)...
start "Frontend UI" cmd /c "cd frontend && npm run dev"

echo.
echo Waiting 5 seconds for servers to start up...
timeout /t 5 /nobreak > nul

echo [3/3] Opening your web browser...
start http://localhost:5173

echo.
echo ===================================================
echo Open Chat is now running in Mock Mode!
echo - Web UI:  http://localhost:5173
echo - Backend: http://127.0.0.1:8000
echo.
echo Close the two background command windows to stop.
echo ===================================================
pause
