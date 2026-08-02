@echo off
TITLE G.U.A.R.D. Launcher
echo ===================================================
echo     Starting G.U.A.R.D. Edge-AI Proctoring
echo ===================================================

REM %~dp0 is this script's own folder, so the launcher works no matter which
REM directory it is invoked from.
set "ROOT=%~dp0"

echo [1/2] Booting FastAPI Backend (Port 8080)...
start "GUARD Backend" cmd /k "cd /d "%ROOT%" && call venv\Scripts\activate && set DISABLE_VOICE_ENGINE=true && python backend\edge_main.py"

REM Invoke the installed Next binary via node rather than `npx next`: npx will
REM silently download a transient copy when it cannot resolve the local one,
REM which masks a broken install and can boot a version other than the one the
REM lockfile pins.
echo [2/2] Booting Next.js Frontend (Port 3000)...
start "GUARD Frontend" cmd /k "cd /d "%ROOT%frontend" && node node_modules\next\dist\bin\next dev --webpack"

echo.
echo Launch sequence initiated! Separate terminal windows have been opened.
echo - Landing page:       http://localhost:3000
echo - Dashboard:          http://localhost:3000/dashboard
echo - Dashboard (demo):   http://localhost:3000/dashboard?demo=1
echo - Backend API:        http://localhost:8080
echo.
pause
