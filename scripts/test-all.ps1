param(
  [string]$ProjectRoot = "."
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path $ProjectRoot).Path

& (Join-Path $PSScriptRoot "diagnostico-testes.ps1") -ProjectRoot $root
& (Join-Path $PSScriptRoot "test-backend.ps1") -ProjectRoot $root
& (Join-Path $PSScriptRoot "test-frontend.ps1") -ProjectRoot $root

Write-Host "`nTodos os testes foram executados." -ForegroundColor Green
