$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host '== Diagnóstico =='
& (Join-Path $PSScriptRoot 'diagnostico-testes.ps1')

Write-Host ""
Write-Host '== Backend =='
Push-Location (Join-Path $repoRoot 'backend')
try {
  npm test
} finally {
  Pop-Location
}

Write-Host ""
Write-Host '== Frontend =='
Push-Location (Join-Path $repoRoot 'frontend')
try {
  npm test
} finally {
  Pop-Location
}
