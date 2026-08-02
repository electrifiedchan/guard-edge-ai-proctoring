@echo off
REM Runs the site audit and tees output to audit-run.log next to package.json.
REM Exists because cmd's `&` chaining eats the redirection when invoked inline.
cd /d "%~dp0.."
node scripts\audit.mjs > audit-run.log 2>&1
echo [EXIT=%ERRORLEVEL%] >> audit-run.log
exit /b %ERRORLEVEL%
