# Run project Node commands with a patched project-local runtime or a supported PATH runtime.
# Does not change the machine PATH or replace application-managed runtime files.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePin = (Get-Content -LiteralPath (Join-Path $projectRoot '.node-version') -Raw).Trim()
$portableNode = Join-Path $projectRoot ('.tools\node-v' + $nodePin + '\node.exe')
$nodeCommand = if (Test-Path -LiteralPath $portableNode -PathType Leaf) {
  $portableNode
} else {
  (Get-Command node -CommandType Application -ErrorAction Stop).Source
}
& $nodeCommand (Join-Path $PSScriptRoot 'verify-node-runtime.cjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $nodeCommand @args
exit $LASTEXITCODE
