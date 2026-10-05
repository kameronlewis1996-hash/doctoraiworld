$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$functionRoots = @(
  '.vercel\output\functions\api\documents.func',
  '.vercel\output\functions\api\stripe\[...action].func',
  '.vercel\output\functions\api\staff\[...action].func'
)

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
$pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand -and -not $pnpmCommand) {
  throw 'Neither npm nor pnpm is available to prepare the Vercel function dependencies.'
}

foreach ($relativeRoot in $functionRoots) {
  $functionRoot = Join-Path $projectRoot $relativeRoot
  $configPath = Join-Path $functionRoot '.vc-config.json'
  if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Missing Vercel function output: $relativeRoot"
  }

  Push-Location -LiteralPath $functionRoot
  try {
    $installArgs = @('install', '--omit=dev', '--ignore-scripts', '--package-lock=false', '--install-strategy=hoisted', '--no-audit', '--no-fund')
    if ($npmCommand) {
      & $npmCommand.Source @installArgs
    } else {
      & $pnpmCommand.Source dlx npm@10 @installArgs
    }
    if ($LASTEXITCODE -ne 0) { throw "Dependency preparation failed for $relativeRoot" }
  } finally {
    Pop-Location
  }

  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  $config.filePathMap = [pscustomobject]@{}
  [System.IO.File]::WriteAllText($configPath, (($config | ConvertTo-Json -Depth 50) + [Environment]::NewLine))
}

$blobModule = Join-Path $projectRoot '.vercel\output\functions\api\documents.func\node_modules\@vercel\blob\package.json'
$stripeModule = Join-Path $projectRoot '.vercel\output\functions\api\stripe\[...action].func\node_modules\stripe\package.json'
$staffBlobModule = Join-Path $projectRoot '.vercel\output\functions\api\staff\[...action].func\node_modules\@vercel\blob\package.json'
$staffStripeModule = Join-Path $projectRoot '.vercel\output\functions\api\staff\[...action].func\node_modules\stripe\package.json'
if (-not (Test-Path -LiteralPath $blobModule)) { throw 'The private Blob dependency was not packaged.' }
if (-not (Test-Path -LiteralPath $stripeModule)) { throw 'The Stripe dependency was not packaged.' }
if (-not (Test-Path -LiteralPath $staffBlobModule)) { throw 'The staff private Blob dependency was not packaged.' }
if (-not (Test-Path -LiteralPath $staffStripeModule)) { throw 'The staff Stripe dependency was not packaged.' }

Write-Output 'Prepared private-document and Stripe dependencies inside the Vercel function artifacts.'
