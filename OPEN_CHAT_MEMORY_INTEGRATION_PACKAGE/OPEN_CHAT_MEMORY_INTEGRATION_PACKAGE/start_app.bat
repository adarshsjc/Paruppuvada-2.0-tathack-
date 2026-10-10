@echo off
title Open Chat - Memory Platform
echo ===================================================
echo Starting Open Chat (backend + frontend)...
echo ===================================================
echo Model slot: backend\.env  (USE_MOCK_LLM / OLLAMA_MODEL)
echo First time?  cd backend ^&^& python -m venv venv
echo               backend\venv\Scripts\pip install -r requirements.txt
echo               frontend: npm install
echo ===================================================

echo.
echo [1/3] Seeding memory graph (idempotent)...
start "Seed" cmd /c "cd backend && .\venv\Scripts\python seed_memory.py"

echo [2/3] Starting Backend (FastAPI)...
start "Backend API" cmd /c "cd backend && .\venv\Scripts\python -m uvicorn app.main:app --reload --port 8000"

echo [3/3] Starting Frontend (React/Vite)...
start "Frontend UI" cmd /c "cd frontend && npm run dev"

timeout /t 5 /nobreak > nul
start http://localhost:5173

echo.
echo Running! UI: http://localhost:5173   API: http://127.0.0.1:8000
echo Stop: close the background command windows.
echo ===================================================
pause
