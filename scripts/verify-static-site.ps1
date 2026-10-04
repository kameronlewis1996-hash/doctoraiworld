$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js is required to run the cross-platform static verification suite.' }
& $node.Source (Join-Path $root 'scripts/verify-static-site.cjs')
if ($LASTEXITCODE -ne 0) { throw "Static verification failed with exit code $LASTEXITCODE." }
