@echo off
REM Starts the Next dev server detached on a fixed port, logging to devserver.log.
REM Used by the audit harness, which needs a predictable origin to crawl.
cd /d "%~dp0.."
start "guard-dev" /B cmd /c "pnpm dev --webpack --port 3000 > devserver.log 2>&1"
exit /b 0
