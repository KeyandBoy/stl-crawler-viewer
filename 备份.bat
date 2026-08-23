@echo off
setlocal enabledelayedexpansion

title STL Crawler Backup Tool

echo ==========================================
echo      STL Crawler Independent Backup
echo ==========================================
echo.

set "PROJECT_DIR=E:\computerProgram2\stl-crawler-independent1.0\stl-crawler-independent"
set "BACKUP_ROOT=E:\computerProgram2\backup"

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%i"
set "BACKUP_NAME=stl-crawler-independent_backup_%STAMP%"
set "BACKUP_DIR=%BACKUP_ROOT%\%BACKUP_NAME%"
set "ZIP_PATH=%BACKUP_ROOT%\%BACKUP_NAME%.zip"

echo [1/6] Check project directory...
if not exist "%PROJECT_DIR%" (
    echo [ERROR] Project directory does not exist:
    echo %PROJECT_DIR%
    echo.
    pause
    exit /b 1
)

echo [2/6] Create backup directory...
if not exist "%BACKUP_ROOT%" mkdir "%BACKUP_ROOT%"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo [3/6] Copy project files...
echo Excluding: node_modules .next .git dist build coverage .turbo .vercel .env.local log files
robocopy "%PROJECT_DIR%" "%BACKUP_DIR%" /E /XD node_modules .next .git dist build coverage .turbo .vercel /XF .env.local *.log npm-debug.log* yarn-debug.log* pnpm-debug.log* /R:2 /W:1 /NFL /NDL /NP

set "ROBO_EXIT=%ERRORLEVEL%"
if %ROBO_EXIT% GEQ 8 (
    echo [ERROR] robocopy failed. Code: %ROBO_EXIT%
    echo.
    pause
    exit /b 1
)

echo [4/6] Write backup note...
(
    echo STL Crawler Independent Backup
    echo Source: %PROJECT_DIR%
    echo Backup folder: %BACKUP_DIR%
    echo Backup time: %date% %time%
    echo Excluded: node_modules, .next, .git, dist, build, coverage, .turbo, .vercel, .env.local, log files
    echo.
    echo Restore steps:
    echo 1. Unzip this backup to a target folder.
    echo 2. Open CMD in the project folder.
    echo 3. Run: npm install
    echo 4. Run: npm run dev
) > "%BACKUP_DIR%\backup_note.txt"

echo [5/6] Create zip file...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%BACKUP_DIR%\*' -DestinationPath '%ZIP_PATH%' -Force"
if errorlevel 1 (
    echo [WARN] Zip creation failed, but folder backup is complete.
    echo Folder: %BACKUP_DIR%
    echo.
    pause
    exit /b 0
)

echo [6/6] Backup complete.
echo.
echo Backup folder:
echo %BACKUP_DIR%
echo.
echo Zip file:
echo %ZIP_PATH%
echo.
pause
