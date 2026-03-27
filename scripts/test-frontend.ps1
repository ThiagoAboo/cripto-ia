$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location (Join-Path $repoRoot 'frontend')
try {
  npm test
} finally {
  Pop-Location
}
