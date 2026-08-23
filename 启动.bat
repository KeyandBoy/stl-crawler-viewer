@echo off
setlocal enabledelayedexpansion

title STL Model Crawler ^& Viewer Launcher

echo ==========================================================
echo        STL Model Crawler ^& Viewer One-click Start
echo ==========================================================
echo.

set "PROJECT_DIR=E:\computerProgram2\stl-crawler-independent1.0\stl-crawler-independent"
set "URL=http://localhost:3000"
set "PORT=3000"

echo [1/7] Checking project directory...
if not exist "%PROJECT_DIR%" (
    echo [ERROR] Project directory not found:
    echo %PROJECT_DIR%
    pause
    exit /b 1
)

cd /d "%PROJECT_DIR%"
echo [OK] Current directory:
cd
echo.

echo [2/7] Checking package.json...
if not exist package.json (
    echo [ERROR] package.json not found.
    pause
    exit /b 1
)
echo [OK] package.json found.
echo.

echo [3/7] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found in PATH.
    pause
    exit /b 1
)
node -v
echo.

echo [4/7] Checking npm...
where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm was not found in PATH.
    pause
    exit /b 1
)
call npm.cmd -v
echo.

echo [5/7] Checking node_modules...
if not exist node_modules (
    echo [INFO] node_modules not found. Running npm install...
    call npm.cmd install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
) else (
    echo [OK] node_modules exists. Skip npm install.
)
echo.

echo [6/7] Checking port %PORT%...
netstat -ano | findstr ":%PORT%" >nul 2>nul
if not errorlevel 1 (
    echo [WARN] Port %PORT% is already in use.
    echo If startup fails, close the old node.exe process and run again.
) else (
    echo [OK] Port %PORT% seems available.
)
echo.

echo [7/7] Starting STL Model Crawler ^& Viewer...
echo URL: %URL%
echo Press Ctrl+C in this window to stop the server.
echo.

start "Open STL Model Crawler Viewer" cmd /c "timeout /t 5 /nobreak >nul && start "" "%URL%""

call npm.cmd run dev

echo.
echo Server stopped or startup failed.
pause