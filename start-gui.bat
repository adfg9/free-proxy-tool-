@echo off
chcp 65001 >nul
title Free Proxy Tool - Web GUI

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found!
    echo Please install Node.js first: https://nodejs.org/
    pause
    exit /b 1
)

if not exist "%PROJECT_DIR%node_modules" (
    echo [INFO] First run, installing dependencies...
    call npm install --production
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed!
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed successfully!
)

echo.
echo ------------------------------------------
echo      Free Proxy Tool - Web GUI
echo ------------------------------------------
echo.
echo [INFO] Starting Web Management Interface...
echo [INFO] Open browser: http://127.0.0.1:3000
echo.
echo Press Ctrl+C to stop
echo.

node index.js gui