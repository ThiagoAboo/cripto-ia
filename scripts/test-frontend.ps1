param(
  [string]$ProjectRoot = "."
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path $ProjectRoot).Path
$frontend = Join-Path $root "frontend"

if (-not (Test-Path $frontend)) { throw "Pasta não encontrada: $frontend" }

Push-Location $frontend
try {
  Write-Host "== Rodando testes do frontend ==" -ForegroundColor Cyan
  npm test
} finally {
  Pop-Location
}
