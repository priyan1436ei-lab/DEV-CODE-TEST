@echo off
setlocal
echo ============================================================
echo   DevMind Studio — Windows Standalone Installer (.exe) Build
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js 20+ is required on your build machine.
  echo Download from https://nodejs.org and re-run this script.
  pause
  exit /b 1
)

echo [1/4] Installing application dependencies...
call npm install
if errorlevel 1 goto :error

echo [2/4] Installing Electron and electron-builder...
call npm install -D electron electron-builder
if errorlevel 1 goto :error

echo [3/4] Compiling optimized production bundle...
call npm run build
if errorlevel 1 goto :error

echo [4/4] Building standalone Windows x64 NSIS Installer and Portable .exe...
call npx electron-builder --win --x64 --config electron-builder.yml
if errorlevel 1 goto :error

echo.
echo BUILD COMPLETE!
echo Standalone Windows executables are located in: dist-electron\
dir /b dist-electron\*.exe
pause
exit /b 0

:error
echo.
echo BUILD FAILED. Review the diagnostic messages above.
pause
exit /b 1
