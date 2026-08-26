#!/usr/bin/env pwsh
Write-Host "Starting TrueForge..." -ForegroundColor Cyan
Start-Process -NoNewWindow -FilePath "npx" -ArgumentList "tsx", "sandbox-scripts/mock-trueforge.ts"

Write-Host "Starting Attest Web UI on http://localhost:3000..." -ForegroundColor Green
Set-Location -Path "apps/web"
npm run dev
