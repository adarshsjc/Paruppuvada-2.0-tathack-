@echo off
setlocal
title Autonomous AI Agent Platform
cd /d "%~dp0"

echo ===================================================
echo Preparing Autonomous AI Agent Platform...
echo ===================================================

if not exist "backend\venv\Scripts\python.exe" (
    echo Creating backend virtual environment...
    py -3 -m venv "backend\venv"
    if errorlevel 1 goto setup_failed
)

echo Installing or verifying backend dependencies...
"backend\venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r "backend\requirements.txt"
if errorlevel 1 goto setup_failed

if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    pushd "frontend"
    call npm ci
    if errorlevel 1 (
        popd
        goto setup_failed
    )
    popd
)

echo Starting backend and frontend...
start "Backend API" /D "%~dp0backend" cmd /k ""%~dp0backend\venv\Scripts\python.exe" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
start "Frontend UI" /D "%~dp0frontend" cmd /k "npm run dev -- --host 127.0.0.1 --strictPort"

echo Waiting for both servers to respond...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(45); do { try { Invoke-RestMethod 'http://127.0.0.1:8000/health' -TimeoutSec 2 | Out-Null; Invoke-WebRequest 'http://127.0.0.1:5173' -TimeoutSec 2 -UseBasicParsing | Out-Null; exit 0 } catch {}; Start-Sleep -Seconds 1 } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
    echo The servers did not become ready. Check the Backend API and Frontend UI windows for errors.
    pause
    exit /b 1
)

echo The platform is ready at http://127.0.0.1:5173
start "" "http://127.0.0.1:5173"
exit /b 0

:setup_failed
echo Setup failed. Check that Python, Node.js, and npm are installed and that this computer can reach their package registries.
pause
exit /b 1
