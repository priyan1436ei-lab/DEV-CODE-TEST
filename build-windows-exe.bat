@echo off
setlocal
echo ========================================================
echo   DevMind AI — Windows 11 Executable (.exe) Builder
echo ========================================================
echo.
echo [1/4] Installing production dependencies...
call npm install
if errorlevel 1 goto :error

echo [2/4] Installing Electron and Electron Builder...
call npm install -D electron electron-builder
if errorlevel 1 goto :error

echo [3/4] Building DevMind AI frontend bundle...
call npm run build
if errorlevel 1 goto :error

echo [4/4] Packaging Windows NSIS installer and Portable .exe...
call npx electron-builder --win --config electron-builder.yml
if errorlevel 1 goto :error

echo.
echo SUCCESS! Your Windows .exe files are ready in: dist-electron\
pause
exit /b 0

:error
echo.
echo BUILD FAILED. Please review the error output above.
pause
exit /b 1
