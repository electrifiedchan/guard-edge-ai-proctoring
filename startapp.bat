@echo off
TITLE G.U.A.R.D. Launcher
echo ===================================================
echo     Starting G.U.A.R.D. Edge-AI Proctoring
echo ===================================================

echo [1/2] Booting FastAPI Backend (Port 8080)...
start "GUARD Backend" cmd /k "call backend\.venv\Scripts\activate && python backend\edge_main.py"

echo [2/2] Booting Next.js Frontend (Port 3000)...
start "GUARD Frontend" cmd /k "cd frontend && pnpm dev"

echo.
echo Launch sequence initiated! Separate terminal windows have been opened.
echo - Frontend Dashboard: http://localhost:3000
echo - Backend API:        http://localhost:8080
echo.
pause
