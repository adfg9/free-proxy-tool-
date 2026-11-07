@echo off
chcp 65001 >nul
title Free Proxy Browser

set "BROWSER_DIR=%~dp0"
set "PROJECT_DIR=%BROWSER_DIR%.."
set "ELECTRON_EXE=%PROJECT_DIR%\node_modules\electron\dist\electron.exe"
set "BROWSER_SCRIPT=%BROWSER_DIR%electron-browser.js"

if not exist "%ELECTRON_EXE%" (
    echo [ERROR] Electron not found: %ELECTRON_EXE%
    echo Run: cd %PROJECT_DIR% ^&^& npm install
    pause
    exit /b 1
)

echo.
echo ===== Free Proxy Browser - Standalone Blink Browser =====
echo.
echo [OK] Electron: %ELECTRON_EXE%
echo [OK] Script:   %BROWSER_SCRIPT%
echo.
echo Starting browser... (Ctrl+C to stop)
echo.

"%ELECTRON_EXE%" "%BROWSER_SCRIPT%"

echo.
echo Browser closed.
pause