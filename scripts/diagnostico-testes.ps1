param(
  [string]$ProjectRoot = "."
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path $ProjectRoot).Path

Write-Host "== Diagnóstico de testes (Windows) ==" -ForegroundColor Cyan
Write-Host "Projeto: $root"

$backendPkg = Join-Path $root "backend\package.json"
$frontendPkg = Join-Path $root "frontend\package.json"
$backendTests = Join-Path $root "backend\tests"
$frontendTests = Join-Path $root "frontend\src\lib"

if (-not (Test-Path $backendPkg)) { throw "Arquivo não encontrado: $backendPkg" }
if (-not (Test-Path $frontendPkg)) { throw "Arquivo não encontrado: $frontendPkg" }

Write-Host "`nNode:" -ForegroundColor Yellow
node -v

Write-Host "`nNPM:" -ForegroundColor Yellow
npm -v

Write-Host "`nArquivos de teste do backend:" -ForegroundColor Yellow
if (Test-Path $backendTests) {
  $backendFiles = Get-ChildItem -Path $backendTests -Recurse -Filter *.test.cjs
  if ($backendFiles.Count -eq 0) {
    Write-Host "Nenhum teste backend encontrado." -ForegroundColor Red
  } else {
    $backendFiles | Select-Object -ExpandProperty FullName
  }
} else {
  Write-Host "Pasta não encontrada: $backendTests" -ForegroundColor Red
}

Write-Host "`nArquivos de teste do frontend:" -ForegroundColor Yellow
if (Test-Path $frontendTests) {
  $frontendFiles = Get-ChildItem -Path $frontendTests -Recurse -Filter *.test.js
  if ($frontendFiles.Count -eq 0) {
    Write-Host "Nenhum teste frontend encontrado." -ForegroundColor Red
  } else {
    $frontendFiles | Select-Object -ExpandProperty FullName
  }
} else {
  Write-Host "Pasta não encontrada: $frontendTests" -ForegroundColor Red
}

Write-Host "`nScripts atuais do backend/package.json:" -ForegroundColor Yellow
(Get-Content $backendPkg -Raw | ConvertFrom-Json).scripts | Format-List

Write-Host "`nScripts atuais do frontend/package.json:" -ForegroundColor Yellow
(Get-Content $frontendPkg -Raw | ConvertFrom-Json).scripts | Format-List

Write-Host "`nDiagnóstico concluído." -ForegroundColor Green
