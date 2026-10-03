$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$required = @(
  'index.html', 'welcome.css', 'welcome.js', 'care-design.css', 'health-hub.html', 'health-hub.css', 'health-hub.js', 'self-cache.js', 'accessibility.css', 'feature-icons.js', 'privacy.html', 'download.html',
  'medication-list-template.html', 'medication-list-template.css', 'medication-list-template.js',
  'subscription.html', 'subscription.css', 'subscription.js',
  'terms.html', 'staff.html', 'staff-grants.js',
  'branding.js', 'logo-loader.js', 'site-shell.css', 'site-shell.js', 'pwa.js', 'service-worker.js', 'manifest.webmanifest', 'sitemap.xml',
  'doctorai-public-logo-transparent.png', 'doctorai-head-logo-transparent.png', 'doctorai-app-icon.png',
  'google-g-logo.svg', 'vercel.json',
  '.env.example', 'scripts/csp-hashes.js', 'scripts/check-js.js', 'scripts/verify-server-core.js', 'scripts/verify-medication-safety.js', 'scripts/verify-medication-scan.js', 'scripts/verify-nzf-fhir.js',
  'api/chat.js', 'api/auth/config.js', 'api/auth/google.js', 'api/auth/mobile.js', 'scripts/verify-stripe-pricing.js',
  'api/health/[...action].js', 'server-src/health/state.js', 'server-src/health/profiles.js', 'api/documents.js', 'api/medication/[...action].js',
  'api/medication/_handlers/ingredient-search.js', 'api/medication/_handlers/nzf-interactions.js',
  'api/medication/_handlers/nzf-product-search.js', 'api/medication/_handlers/safety-check.js',
  'api/medication/_handlers/scan.js', 'api/medication/_lib/nzf-fhir.cjs', 'api/medication/_lib/drugbank.cjs', 'api/research.js',
  'api/staff/access.js', 'api/staff/[...action].js', 'api/stripe/[...action].js', 'server-src/_lib/doctorai-core.cjs',
  'server-src/staff/grant-pro.js', 'server-src/staff/redeem-pro.js', 'server-src/staff/revoke-pro.mjs',
  'server-src/stripe/plan-catalog.cjs', 'server-src/stripe/public-plans.js', 'server-src/stripe/create-checkout-session.js', 'server-src/stripe/create-portal-session.js',
  'server-src/stripe/entitlement.js', 'server-src/stripe/verify-checkout-session.js', 'server-src/stripe/webhook.js'
)

$failures = [System.Collections.Generic.List[string]]::new()
foreach ($relative in $required) {
  $path = Join-Path $root $relative
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { $failures.Add("Missing required file: $relative"); continue }
  if ((Get-Item -Force -LiteralPath $path).Length -le 0) { $failures.Add("Empty required file: $relative") }
}

$hubScriptPath = Join-Path $root 'health-hub.js'
$hubStylePath = Join-Path $root 'health-hub.css'
$hubHtmlPath = Join-Path $root 'health-hub.html'
$hubScriptText = Get-Content -Raw -LiteralPath $hubScriptPath
$hubStyleText = Get-Content -Raw -LiteralPath $hubStylePath
$hubHtmlText = Get-Content -Raw -LiteralPath $hubHtmlPath
if ((Get-Item -Force -LiteralPath $hubScriptPath).Length -eq 65536 -or $hubScriptText -notmatch '\}\)\(\);\s*$') { $failures.Add('health-hub.js is truncated or missing its executable ending') }
if ((Get-Item -Force -LiteralPath $hubStylePath).Length -lt 120000 -or $hubStyleText -notmatch '#view-today \.prescription-alert-home' -or $hubStyleText -notmatch '\.mobile-bottom-nav') { $failures.Add('health-hub.css is incomplete or missing the verified home/mobile layout') }
if ($hubHtmlText -notmatch 'data-view-panel="symptoms"' -or $hubHtmlText -notmatch 'data-modal="symptom"') { $failures.Add('The Symptom Diary view or add action is missing') }
if ($hubHtmlText -notmatch 'health-hub\.js\?v=69' -or $hubScriptText -notmatch 'data-scan-attempted' -or $hubScriptText -notmatch 'focusMedicationSafetyPanel' -or $hubScriptText -notmatch 'Confirm the exact product and ingredient matches') { $failures.Add('Saving a scanned medication must lead people to the saved-list safety panel without running a check automatically') }
if ($hubHtmlText -notmatch 'health-hub\.css\?v=70' -or $hubStyleText -notmatch '\.medication-edit-link' -or $hubScriptText -notmatch 'data-edit-medication=' -or $hubScriptText -notmatch 'data-edit-medication\]') { $failures.Add('Saved medications must expose the current stylesheet and an in-place edit action') }
if ($hubScriptText -notmatch "source:\s*'symptom-diary'" -or $hubScriptText -notmatch 'data-modal-form="symptom"' -or $hubScriptText -match 'state\.symptoms') { $failures.Add('Symptom Diary must use the canonical timeline store with working form handling') }
if ($hubScriptText -notmatch 'Intensity \(optional\)' -or $hubScriptText -notmatch 'Not recorded / not sure' -or $hubScriptText -notmatch 'Date \*' -or $hubScriptText -notmatch 'date > localToday') { $failures.Add('Symptom Diary must offer an honest optional intensity value, require a date, and reject future dates') }
if ($hubHtmlText -notmatch 'data-symptom-guidance' -or $hubScriptText -notmatch 'data-modal-form="symptom-guidance"' -or $hubScriptText -notmatch 'setSymptomGuidanceResult') { $failures.Add('Symptom Diary is missing the non-diagnostic urgency safety check') }
if ($hubHtmlText -notmatch 'symptom-pattern-card' -or $hubHtmlText -notmatch 'symptom-pattern-list' -or $hubScriptText -notmatch 'getSymptomPatternInsights' -or $hubScriptText -notmatch 'commonContextPicks') { $failures.Add('Symptom Diary is missing private pattern hints and common context tracking') }
if ($hubHtmlText -match 'data-symptom-filter|Current status|ongoing symptoms|Improving|Resolved' -or $hubScriptText -match 'symptomStatusLabels|data-resolve-symptom|symptomFilter') { $failures.Add('Symptom Diary still exposes status-based tracking instead of a simple log') }
if ($hubScriptText -match '<option value="symptom">Symptom / wellbeing</option>') { $failures.Add('Generic timeline entry must not bypass the structured Symptom Diary form') }
if ($hubScriptText -notmatch 'cloudSyncDirty' -or $hubScriptText -notmatch 'revision === cloudSyncRevision') { $failures.Add('Cloud sync must preserve symptom changes queued while another save is in flight') }
if ($hubScriptText -notmatch '/api/medication/nzf-product-search' -or $hubScriptText -notmatch '/api/medication/nzf-interactions' -or $hubScriptText -notmatch 'nzfProductConfirmed' -or $hubScriptText -notmatch 'validMedicationBarcodeGtin') { $failures.Add('Medication product matching, confirmed product storage, or NZF interaction checking is missing') }
if (-not $hubScriptText.Contains("ingredientSearchConsentInput.name = 'drugbankSearchConsent';") -or -not $hubScriptText.Contains("ingredientSearchButton.dataset.medicationMatchIngredients = 'true';") -or -not $hubScriptText.Contains("ingredientResults.dataset.medicationMatchResults = 'true';") -or -not $hubScriptText.Contains("event.target.closest('[data-medication-match-ingredients]')") -or -not $hubScriptText.Contains("resolvedInput.value = '[]';") -or -not $hubScriptText.Contains("form.elements.drugbankSearchConsent.checked = false;")) { $failures.Add('Ingredient matching must require explicit consent, render selectable results, and clear stale mappings and consent') }
if ($hubScriptText -notmatch 'data-medication-safety-profile' -or $hubScriptText -notmatch 'data-run-ingredient-safety-check' -or $hubScriptText -notmatch '/api/medication/safety-check' -or $hubScriptText -notmatch 'buildDrugBankSafetyPayload') { $failures.Add('The ingredient, allergy, condition, and symptom screening path is not integrated into the saved medication flow') }
if ($hubScriptText -notmatch 'Symptom diary entries \(local reference only; not sent automatically\)' -or $hubScriptText -notmatch 'not sent automatically') { $failures.Add('The safety-term review must let people reconcile saved symptom diary entries without sending them automatically') }
if ($hubHtmlText -notmatch 'Neither scan verifies medicine safety' -or $hubScriptText -notmatch 'Allergy, condition, and symptom screening remains disabled until an approved licensed provider and modules are configured') { $failures.Add('Medication scan or interaction coverage limits are not stated clearly') }
if ($hubHtmlText -notmatch 'data-medication-image-consent' -or $hubScriptText -notmatch 'medicationImageConsent' -or $hubScriptText -notmatch 'consent: true') { $failures.Add('Medication image scans are missing the explicit per-scan consent gate') }
if ($hubHtmlText -match 'image/heic|image/heif|\.heic|\.heif' -or $hubScriptText -match 'heic|heif') { $failures.Add('Medication photo picker must advertise only formats the browser decoder accepts reliably') }
$privacyText = Get-Content -Raw -LiteralPath (Join-Path $root 'privacy.html')
if ($privacyText -notmatch 'OpenAI for text extraction only after you check the separate scan-consent box' -or $privacyText -notmatch 'up to 30 days by default' -or $privacyText -notmatch 'We have not confirmed a shorter-retention exception' -or $privacyText -notmatch 'NZF/NZULM product searches and interaction checks are currently disabled' -or $privacyText -notmatch 'disabled DrugBank ingredient-level screening prototype requires') { $failures.Add('Privacy Notice is out of sync with medication scan consent, provider retention, or disabled database providers') }
if ($hubStyleText -notmatch '\.symptom-diary-layout' -or $hubStyleText -notmatch '#view-symptoms\.view') { $failures.Add('Symptom Diary desktop or mobile styling is missing') }
$workerText = Get-Content -Raw -LiteralPath (Join-Path $root 'service-worker.js')
if ($hubHtmlText -notmatch 'data-open-medication-scanner' -or $hubHtmlText -notmatch 'id="medication-scanner-video"' -or $hubScriptText -notmatch 'BarcodeDetector' -or $hubScriptText -notmatch 'stopMedicationScannerCamera') { $failures.Add('The live medication barcode scanner or camera cleanup is missing') }
if ($hubScriptText -match 'Tesseract|cdn\.jsdelivr\.net' -or $hubScriptText -notmatch 'MAX_SCAN_DATA_URL') { $failures.Add('Medication scanning must use bounded same-origin processing without the old CDN OCR fallback') }
$medicationDispatcherText = Get-Content -Raw -LiteralPath (Join-Path $root 'api/medication/[...action].js')
if ($medicationDispatcherText -notmatch "'ingredient-search'" -or $medicationDispatcherText -notmatch "'nzf-interactions'" -or $medicationDispatcherText -notmatch "'nzf-product-search'" -or $medicationDispatcherText -notmatch "'safety-check'" -or $medicationDispatcherText -notmatch 'scan:') { $failures.Add('Medication API dispatcher must preserve all existing medication endpoints') }
$drugBankText = Get-Content -Raw -LiteralPath (Join-Path $root 'api/medication/_lib/drugbank.cjs')
if ($drugBankText -notmatch 'DRUGBANK_NZ_INGREDIENT_SCOPE_APPROVED' -or $drugBankText -notmatch 'DRUGBANK_SAFETY_CRITICAL_USE_APPROVED') { $failures.Add('DrugBank checks must remain disabled without explicit consumer-use and NZ ingredient-scope approvals') }
$medicationScanApiText = Get-Content -Raw -LiteralPath (Join-Path $root 'api/medication/_handlers/scan.js')
if ($medicationScanApiText -notmatch 'body\.consent\s*!==\s*true' -or $medicationScanApiText -notmatch 'store:\s*false' -or $medicationScanApiText -notmatch "type:\s*'json_schema'" -or $medicationScanApiText -notmatch 'AbortSignal\.timeout' -or $medicationScanApiText -notmatch 'MAX_IMAGE_DATA_URL') { $failures.Add('Medication scan API is missing explicit image consent or structured, no-store, bounded processing') }
if ($workerText -notmatch "doctorai-shell-v113" -or $workerText -notmatch "welcome\.css\?v=2" -or $workerText -notmatch "health-hub\.css\?v=70" -or $workerText -notmatch "health-hub\.js\?v=69" -or $workerText -notmatch "self-cache\.js\?v=2" -or $workerText -notmatch "subscription\.css\?v=9" -or $workerText -notmatch "subscription\.js\?v=14" -or $workerText -notmatch "accessibility\.css\?v=9" -or $workerText -notmatch "care-design\.css\?v=7" -or $workerText -notmatch "site-shell\.css\?v=2" -or $workerText -notmatch "'/medication-list-template'" -or $workerText -notmatch "'/medication-list-template\.css'" -or $workerText -notmatch "'/medication-list-template\.js'") { $failures.Add('The PWA cache does not contain the current site assets') }

$subscriptionScriptText = Get-Content -Raw -LiteralPath (Join-Path $root 'subscription.js')
$stripeDispatcherText = Get-Content -Raw -LiteralPath (Join-Path $root 'api/stripe/[...action].js')
$stripePlanCatalogText = Get-Content -Raw -LiteralPath (Join-Path $root 'server-src/stripe/plan-catalog.cjs')
if ($subscriptionScriptText -notmatch '/api/stripe/plans' -or $subscriptionScriptText -notmatch 'planPricing' -or $stripeDispatcherText -notmatch 'plans:' -or $stripePlanCatalogText -notmatch 'environmentModeMatches') { $failures.Add('Subscription pricing must load from validated active Stripe Price IDs, keep live credentials out of Preview, and gate checkout when unavailable') }

$pngSignature = [byte[]](0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a)
foreach ($relative in @('doctorai-public-logo-transparent.png', 'doctorai-head-logo-transparent.png', 'doctorai-app-icon.png')) {
  $path = Join-Path $root $relative
  if (Test-Path -LiteralPath $path) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    if ($bytes.Length -lt 8 -or (Compare-Object $pngSignature $bytes[0..7] -SyncWindow 0)) { $failures.Add("Invalid PNG signature: $relative") }
    if ($bytes.Length -eq 65536 -or $bytes.Length -eq 131072) { $failures.Add("PNG appears truncated at a 64 KiB boundary: $relative") }
  }
}

$templateHtml = Get-Content -Raw -LiteralPath (Join-Path $root 'medication-list-template.html')
$templateJs = Get-Content -Raw -LiteralPath (Join-Path $root 'medication-list-template.js')
if ($templateHtml -notmatch '<title>Free Medication List Template for Appointments \| DoctorAI</title>' -or $templateHtml -notmatch '<link rel="canonical" href="https://www\.doctoraiworld\.com/medication-list-template">' -or $templateHtml -notmatch '<h1>Medication list template for your next appointment</h1>') { $failures.Add('The medication-list resource must have a specific title, canonical URL, and descriptive H1') }
if ($templateHtml -notmatch 'fda\.gov/consumers/consumer-updates/create-and-keep-medication-list-your-health' -or $templateHtml -notmatch 'medlineplus\.gov/ency/patientinstructions/000600\.htm') { $failures.Add('The medication-list resource must cite its FDA and MedlinePlus source guidance') }
if ($templateHtml -notmatch 'does not verify medicine safety or check drug interactions' -or $templateHtml -notmatch 'Do not start, stop, or change a medicine based on this page') { $failures.Add('The medication-list resource must state product limits and avoid treatment directions') }
$nameSearchForm = [regex]::Match($templateHtml, '(?s)<form id="medicine-name-search" role="search"[^>]*>.*?</form>')
$nameSearchInputs = [regex]::Matches($templateHtml, '<input\b[^>]*>')
if (-not $nameSearchForm.Success -or $nameSearchInputs.Count -ne 1 -or $nameSearchInputs[0].Value -notmatch 'id="medicine-name-query"[^>]*type="search"' -or $templateHtml -match '<textarea\b' -or $templateJs -notmatch "fetch\('/data/medication/nz-medicine-names\.json\?v=20261001'" -or $templateJs -notmatch 'credentials:\s*''omit''' -or $templateJs -notmatch 'names\.filter\(name => normalise\(name\)\.includes\(query\)\)' -or $templateJs -notmatch 'window\.print\(\)') { $failures.Add('The medication-list resource must keep its sole medicine-name field as an optional local catalogue lookup; it must not collect list details') }
$sitemapText = Get-Content -Raw -LiteralPath (Join-Path $root 'sitemap.xml')
if ($sitemapText -notmatch '<loc>https://www\.doctoraiworld\.com/</loc>' -or $sitemapText -notmatch '<loc>https://www\.doctoraiworld\.com/medication-list-template</loc>') { $failures.Add('The sitemap must include the homepage and medication-list resource') }
$homeHtml = Get-Content -Raw -LiteralPath (Join-Path $root 'index.html')
if ($homeHtml -notmatch 'href="/medication-list-template"') { $failures.Add('The homepage must link to the medication-list resource') }
$htmlFiles = @('index.html', 'health-hub.html', 'subscription.html', 'terms.html', 'privacy.html', 'download.html', 'staff.html', 'research.html', 'mobile-auth.html', 'medication-list-template.html')
foreach ($relative in $htmlFiles) {
  $text = Get-Content -Raw -LiteralPath (Join-Path $root $relative)
  foreach ($match in [regex]::Matches($text, '(?:src|href)=["'']([^"''#?]+)')) {
    $reference = $match.Groups[1].Value
    if ($reference -match '^(?:https?:|mailto:|data:|#|/api/)' -or $reference -in @('/','/health-hub','/subscription','/terms','/privacy','/staff','/research','/care-planner','/download','/mobile-auth','/medication-list-template','/appointment-checklist')) { continue }
    $target = Join-Path $root $reference.TrimStart('/')
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { $failures.Add("Broken local reference in ${relative}: $reference") }
  }
}

$forbidden = @('doctorai-public-logo.b64.txt', 'doctorai-pro-logo.b64.txt', 'doctorai-logo.svg', 'doctorai-entry-logo', 'doctorai-professional-logo', 'doctorai-head-blue', 'doctorai-head-gold', 'demo-reset-v3', '897575258940-57rllniq8ig2jipe2366478dnl6ngehv.apps.googleusercontent.com', 'meta name="google-client-id"')
$sourceFiles = @(
  Get-ChildItem -LiteralPath $root -File | Where-Object { $_.Extension -in @('.html', '.js', '.cjs', '.mjs', '.css', '.webmanifest') }
  if (Test-Path -LiteralPath (Join-Path $root 'api')) {
    Get-ChildItem -LiteralPath (Join-Path $root 'api') -Recurse -File | Where-Object { $_.Extension -in @('.js', '.cjs', '.mjs') }
  }
)
foreach ($needle in $forbidden) {
  $hits = $sourceFiles | Select-String -SimpleMatch $needle
  if ($hits) { $failures.Add("Forbidden stale reference remains: $needle") }
}

Get-Content -Raw -LiteralPath (Join-Path $root 'vercel.json') | ConvertFrom-Json | Out-Null
Get-Content -Raw -LiteralPath (Join-Path $root 'manifest.webmanifest') | ConvertFrom-Json | Out-Null

$vercelText = Get-Content -Raw -LiteralPath (Join-Path $root 'vercel.json')
if ($vercelText -match "script-src[^;]*'unsafe-inline'") { $failures.Add("CSP must not allow arbitrary inline scripts") }
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$programFilesNode = if ($env:ProgramFiles) { Join-Path $env:ProgramFiles 'nodejs\node.exe' } else { '' }
$nodePath = if ($nodeCommand) { $nodeCommand.Source } elseif ($programFilesNode -and (Test-Path -LiteralPath $programFilesNode -PathType Leaf)) { $programFilesNode } elseif (Test-Path -LiteralPath (Join-Path $root '.tools') -PathType Container) { Get-ChildItem -LiteralPath (Join-Path $root '.tools') -Filter node.exe -Recurse -File | Select-Object -First 1 -ExpandProperty FullName } else { $null }
if (-not $nodePath) { $failures.Add("Node.js is required to verify CSP hashes") }
$cspHashes = if ($nodePath) { & $nodePath (Join-Path $root 'scripts/csp-hashes.js') } else { @() }
foreach ($hash in ($cspHashes | Select-String -Pattern "'sha256-[^']+'" -AllMatches | ForEach-Object { $_.Matches.Value })) {
  if (-not $vercelText.Contains($hash)) { $failures.Add("CSP is missing an inline block hash: $hash") }
}

$rateLimitCalls = Get-ChildItem -LiteralPath (Join-Path $root 'api'), (Join-Path $root 'server-src') -Recurse -File | Where-Object { $_.Extension -in @('.js', '.cjs', '.mjs') } | Select-String -Pattern 'core\.rateLimit\('
foreach ($call in $rateLimitCalls) {
  if ($call.Line -notmatch 'await\s+core\.rateLimit\(') { $failures.Add("Durable rate limit call is not awaited: $($call.Path):$($call.LineNumber)") }
}

$documentsText = Get-Content -Raw -LiteralPath (Join-Path $root 'api/documents.js')
if ($documentsText -notmatch "put\([\s\S]*?access:\s*'private'" -or $documentsText -notmatch "get\([\s\S]*?access:\s*'private'") {
  $failures.Add("Document storage must use private Blob access for writes and reads")
}

if ($failures.Count) {
  $failures | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "DoctorAI static verification passed ($($required.Count) required files, $($htmlFiles.Count) production pages)."
