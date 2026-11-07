@echo off
chcp 65001 >nul
title Free Proxy Tool - Install Shortcut

set "PROJECT_DIR=%~dp0"
set "GUI_BAT=%PROJECT_DIR%start-gui.bat"

echo.
echo ------------------------------------------
echo      Install Desktop Shortcut
echo ------------------------------------------
echo.

if not exist "%GUI_BAT%" (
    echo [ERROR] start-gui.bat not found!
    pause
    exit /b 1
)

echo [INFO] Creating shortcut on desktop...

powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $shortcut = $WshShell.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Free Proxy Tool.lnk'); $shortcut.TargetPath = '%GUI_BAT%'; $shortcut.WorkingDirectory = '%PROJECT_DIR%'; $shortcut.IconLocation = '%PROJECT_DIR%icon.ico'; $shortcut.Save()"

if errorlevel 1 (
    echo [ERROR] Failed to create shortcut!
    pause
    exit /b 1
)

echo [OK] Shortcut created successfully!
echo.
echo [INFO] You can find the shortcut on your desktop:
echo [INFO] "Free Proxy Tool"
echo.
pause