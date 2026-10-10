@echo off
title Open Chat - Stratify AI Platform
echo ===================================================
echo Starting Open Chat - Stratify AI Platform...
echo ===================================================

echo.
echo [1/3] Starting Backend (FastAPI)...
start "Backend API" cmd /c "cd backend && .\venv\Scripts\activate && uvicorn app.main:app --reload"

echo [2/3] Starting Frontend (React/Vite)...
start "Frontend UI" cmd /c "cd frontend && npm run dev"

echo.
echo Waiting 5 seconds for servers to start up...
timeout /t 5 /nobreak > nul

echo [3/3] Opening your web browser...
start http://localhost:5173

echo.
echo ===================================================
echo The platform is now running! 
echo.
echo - The Backend and Frontend are running in separate background windows.
echo - To stop the servers, just close those two black command windows.
echo ===================================================
pause
