@echo off
REM Runs the backend test scripts against the project venv (which is where the
REM deps live). Kept as a .bat so paths with spaces don't have to survive
REM several layers of shell quoting.
set "ROOT=%~dp0.."
cd /d "%~dp0"
"%ROOT%\venv\Scripts\python.exe" test_session_lifecycle.py
if errorlevel 1 exit /b 1
echo.
"%ROOT%\venv\Scripts\python.exe" test_dashboard_summary.py
if errorlevel 1 exit /b 1
