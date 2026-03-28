param(
  [string]$ProjectRoot = "."
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path $ProjectRoot).Path
$backend = Join-Path $root "backend"

if (-not (Test-Path $backend)) { throw "Pasta não encontrada: $backend" }

Push-Location $backend
try {
  Write-Host "== Rodando testes do backend ==" -ForegroundColor Cyan
  npm test
} finally {
  Pop-Location
}
