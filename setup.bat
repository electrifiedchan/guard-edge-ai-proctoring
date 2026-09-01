@echo off
REM ===================================================================
REM  G.U.A.R.D. - one-time setup entry point.  Double-click this file.
REM ===================================================================
REM
REM This wrapper exists only to launch setup.ps1. The real work is in
REM PowerShell because batch cannot do the three things this setup needs:
REM compare version numbers, download files over HTTPS, and fail with a
REM readable error instead of a blank window.
REM
REM -ExecutionPolicy Bypass applies to THIS process only, so running the
REM setup does not loosen the machine-wide script policy on the PC it runs
REM on - no admin rights, no permanent change.
REM
REM Usage:
REM   setup.bat                 full setup
REM   setup.bat -SkipOllama     skip the ~2 GB local model download
REM   setup.bat -Force          redo steps that already look finished
REM
REM If it fails, the message below points at two ways out. The second one -
REM handing setup-log.txt and setup.ps1 to an AI coding agent - works because
REM setup.ps1 is the authoritative list of every step in plain text, and
REM setup-log.txt records exactly which step stopped. An agent given both has
REM everything it needs to finish the job without guessing.

setlocal
set "HERE=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%setup.ps1" %*
set "RC=%ERRORLEVEL%"

echo.
if not "%RC%"=="0" (
    echo ---------------------------------------------------------------
    echo  Setup did NOT finish cleanly.
    echo.
    echo  What failed, and where, is recorded in:  setup-log.txt
    echo.
    echo  Two ways forward:
    echo.
    echo   1. Send setup-log.txt to whoever gave you this project.
    echo.
    echo   2. Finish it with an AI coding agent. Open THIS folder in
    echo      Claude Code, Cursor, Copilot, or any similar tool and ask:
    echo.
    echo        "Read setup-log.txt and setup.ps1, then finish setting
    echo         up this project so startapp.bat runs."
    echo.
    echo      setup.ps1 spells out every step in plain text and the log
    echo      says which one stopped, so the agent has enough to work
    echo      with. This is a supported fallback, not a last resort.
    echo ---------------------------------------------------------------
)
pause
exit /b %RC%
