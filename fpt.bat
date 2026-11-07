@echo off
chcp 65001 >nul
title Free Proxy Tool

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

REM Check if node is installed
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] Node.js not found!
    echo Please install Node.js first: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "%PROJECT_DIR%node_modules" (
    echo.
    echo [INFO] First run, installing dependencies...
    echo.
    call npm install --production
    if errorlevel 1 (
        echo.
        echo [ERROR] Dependency installation failed!
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencies installed successfully!
    echo.
)

REM Parse arguments
if "%~1"=="" (
    REM No arguments - show menu
    goto :menu
)

REM Pass through to node
node index.js %*
exit /b %errorlevel%

:menu
cls
echo.
echo ╔════════════════════════════════════════════╗
echo ║     ⚡ Free Proxy Tool - Proxy Tool        ║
echo ╚════════════════════════════════════════════╝
echo.
echo   1. Start All (Proxy + Panel)
echo   2. Start Proxy Server
echo   3. Start Web GUI
echo   4. Start TUI
echo   5. Test Free Proxies
echo   6. View Statistics
echo   7. View Logs
echo   8. Configuration
echo   9. Help
echo   0. Exit
echo.
set /p choice=Please select [0-9]: 

if "%choice%"=="1" goto :start_gui
if "%choice%"=="2" goto :start_proxy
if "%choice%"=="3" goto :start_gui
if "%choice%"=="4" goto :start_tui
if "%choice%"=="5" goto :test_proxy
if "%choice%"=="6" goto :show_stats
if "%choice%"=="7" goto :show_logs
if "%choice%"=="8" goto :config
if "%choice%"=="9" goto :help
if "%choice%"=="0" goto :eof
if "%choice%"=="" goto :eof

echo Invalid choice!
pause
goto :menu

:start_gui
echo.
echo Starting Web GUI...
node index.js gui
goto :eof

:start_proxy
echo.
echo Starting proxy server...
node index.js start
goto :eof

:start_tui
echo.
echo Starting TUI...
node index.js tui
goto :eof

:test_proxy
echo.
echo Testing proxies...
node index.js proxy --test
pause
goto :menu

:show_stats
echo.
node index.js stats
pause
goto :menu

:show_logs
echo.
node index.js log 50
pause
goto :menu

:config
echo.
node index.js config
echo.
pause
goto :menu

:help
echo.
node index.js help
pause
goto :menu

:eof
