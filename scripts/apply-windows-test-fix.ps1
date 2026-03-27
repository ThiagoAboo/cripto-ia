param(
  [Parameter(Mandatory = $false)]
  [string]$RepoPath
)

$ErrorActionPreference = 'Stop'

function Resolve-RepoPath {
  param([string]$ProvidedRepoPath)

  if ($ProvidedRepoPath -and $ProvidedRepoPath.Trim()) {
    return $ProvidedRepoPath
  }

  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $scriptParent = Split-Path -Parent $scriptDir

  if (Test-Path (Join-Path $scriptParent 'backend\package.json')) {
    return $scriptParent
  }

  throw 'RepoPath não foi informado e não foi possível detectar o repositório automaticamente. Use -RepoPath "D:\Projetos\cripto-ia".'
}

function Copy-WithBackup {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  if (-not (Test-Path $Source)) {
    throw "Arquivo de origem não encontrado: $Source"
  }

  if (-not (Test-Path $Destination)) {
    throw "Destino não encontrado: $Destination"
  }

  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backup = "$Destination.bak-$timestamp"
  Copy-Item $Destination $backup -Force
  Copy-Item $Source $Destination -Force
  Write-Host "Backup criado: $backup"
  Write-Host "Arquivo atualizado: $Destination"
}

$ResolvedRepoPath = Resolve-RepoPath -ProvidedRepoPath $RepoPath

if (-not (Test-Path $ResolvedRepoPath)) {
  throw "RepoPath não encontrado: $ResolvedRepoPath"
}

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $packageRoot

$backendSource = Join-Path $root 'backend\package.json'
$frontendSource = Join-Path $root 'frontend\package.json'

$backendDest = Join-Path $ResolvedRepoPath 'backend\package.json'
$frontendDest = Join-Path $ResolvedRepoPath 'frontend\package.json'

Copy-WithBackup -Source $backendSource -Destination $backendDest
Copy-WithBackup -Source $frontendSource -Destination $frontendDest

Write-Host ''
Write-Host 'Correção aplicada com sucesso.'
Write-Host "Repositório: $ResolvedRepoPath"
Write-Host 'Agora rode:'
Write-Host "  .\scripts\diagnostico-testes.ps1 -RepoPath `"$ResolvedRepoPath`""
Write-Host "  .\scripts\test-all.ps1 -RepoPath `"$ResolvedRepoPath`""
