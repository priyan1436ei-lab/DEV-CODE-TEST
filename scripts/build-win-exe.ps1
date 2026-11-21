# DevMind Studio — Windows 10/11 Standalone Installer (.exe) Builder
# Run in PowerShell on Windows x64 (requires Node.js 20+)

$ErrorActionPreference = "Stop"

Write-Host "[1/4] Installing workspace dependencies..." -ForegroundColor Cyan
npm install

Write-Host "[2/4] Installing Electron & electron-builder..." -ForegroundColor Cyan
npm install -D electron electron-builder

Write-Host "[3/4] Building optimized Vite production bundle..." -ForegroundColor Cyan
npm run build

Write-Host "[4/4] Packaging Windows NSIS Installer & Portable .exe..." -ForegroundColor Green
npx electron-builder --win --x64 --config electron-builder.yml

Write-Host "`nBuild complete. Standalone Windows installers:" -ForegroundColor Green
Get-ChildItem -Path ".\dist-electron" -Filter "*.exe" | Select-Object Name, @{Name="SizeMB";Expression={[math]::Round($_.Length/1MB, 2)}}, LastWriteTime
