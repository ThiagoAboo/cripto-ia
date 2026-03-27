$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "Repositório: $repoRoot"
Write-Host "Node: $(node -v)"

$backendTests = Get-ChildItem -Path (Join-Path $repoRoot 'backend\tests') -Recurse -Filter *.test.cjs -ErrorAction SilentlyContinue
$frontendTests = Get-ChildItem -Path (Join-Path $repoRoot 'frontend\src\lib') -Recurse -Filter *.test.js -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Backend tests encontrados: $($backendTests.Count)"
$backendTests | Select-Object -ExpandProperty FullName

Write-Host ""
Write-Host "Frontend tests encontrados: $($frontendTests.Count)"
$frontendTests | Select-Object -ExpandProperty FullName
