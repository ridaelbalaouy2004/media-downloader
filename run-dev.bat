@echo off
setlocal

REM ============================================================
REM  Media Downloader - Development Launcher
REM  Run this script to start the app in development mode.
REM ============================================================

set "APPDIR=%~dp0"
cd /d "%APPDIR%"

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [ERROR] node_modules not found. Run 'npm install' first.
    echo.
    echo To install without internet (using cache):
    echo   set ELECTRON_SKIP_BINARY_DOWNLOAD=1
    echo   npm install --prefer-offline
    pause
    exit /b 1
)

REM Check if electron binary is available
REM Try to find Electron in common locations
set "ELECTRON_BIN="

REM Option 1: Local node_modules/electron/dist/electron.exe (standard)
if exist "node_modules\electron\dist\electron.exe" (
    set "ELECTRON_BIN=node_modules\electron\dist\electron.exe"
    goto :found_electron
)

REM Option 2: Antigravity IDE binary (fallback)
if exist "%LOCALAPPDATA%\Programs\Antigravity IDE\Antigravity IDE.exe" (
    set "ELECTRON_OVERRIDE_DIST_PATH=%LOCALAPPDATA%\Programs\Antigravity IDE"
    echo [INFO] Using Antigravity IDE Electron binary as fallback
    goto :found_electron
)

echo [ERROR] Electron binary not found.
echo.
echo Please run the following to download it:
echo   npm install electron --save-dev
echo.
echo Or download electron.exe manually and place in:
echo   node_modules\electron\dist\electron.exe
pause
exit /b 1

:found_electron
echo [OK] Electron binary found
echo [INFO] Building TypeScript...
call npx tsc -p tsconfig.electron.json
if %ERRORLEVEL% neq 0 (
    echo [ERROR] TypeScript compilation failed.
    pause
    exit /b 1
)

echo [OK] TypeScript compiled
echo [INFO] Starting Vite dev server and Electron...
echo.

REM Start Vite in a separate window
start "Vite Dev Server" cmd /c "npx vite"

REM Wait for Vite to start, then launch Electron
call npx wait-on http://localhost:5173 --timeout 30000
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Vite dev server did not start in time.
    pause
    exit /b 1
)

echo [OK] Vite ready - launching app...
call npx electron .

endlocal
