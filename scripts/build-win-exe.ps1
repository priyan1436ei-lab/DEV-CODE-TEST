# DevMind AI — Windows 11 .EXE Build Script
# Run in PowerShell on Windows 11 (requires Node.js 20+)

$ErrorActionPreference = "Stop"

Write-Host "1/4 Installing dependencies..." -ForegroundColor Cyan
npm install

Write-Host "2/4 Installing Electron & electron-builder..." -ForegroundColor Cyan
npm install -D electron electron-builder

Write-Host "3/4 Building production frontend bundle..." -ForegroundColor Cyan
npm run build

Write-Host "4/4 Packaging Windows 11 NSIS Installer & Portable .EXE..." -ForegroundColor Green
npx electron-builder --win --x64 --config electron-builder.yml

Write-Host "`nDone! Find your .exe files inside the ./release folder:" -ForegroundColor Green
Get-ChildItem -Path ".\release" -Filter "*.exe" | Select-Object Name, Length, LastWriteTime
