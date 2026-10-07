$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$assetsDir = Join-Path $PSScriptRoot '..\assets\google-play'
$iconSource = Join-Path $assetsDir 'doctorai-icon-source.png'
$iconOutput = Join-Path $assetsDir 'app-icon-512.png'
$graphicOutput = Join-Path $assetsDir 'feature-graphic-1024x500.png'

function New-Color([string]$hex) {
    return [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function Fill-RoundedRectangle($graphics, $brush, [float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $radius * 2
    $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
    $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
    $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    $graphics.FillPath($brush, $path)
    $path.Dispose()
}

function Draw-VisitCard($graphics, [float]$top, [string]$label, [string]$accent, [string]$symbol) {
    $shadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(22, 29, 91, 151))
    $white = New-Object System.Drawing.SolidBrush((New-Color '#FFFFFF'))
    Fill-RoundedRectangle $graphics $shadow 634 ($top + 5) 340 70 22
    Fill-RoundedRectangle $graphics $white 630 $top 340 70 22

    $circleBrush = New-Object System.Drawing.SolidBrush((New-Color $accent))
    $graphics.FillEllipse($circleBrush, 648, ($top + 15), 40, 40)
    $symbolPen = New-Object System.Drawing.Pen((New-Color '#FFFFFF'), 2.4)
    $symbolPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $symbolPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    switch ($symbol) {
        'calendar' {
            $graphics.DrawRectangle($symbolPen, 659, ($top + 26), 18, 17)
            $graphics.DrawLine($symbolPen, 659, ($top + 31), 677, ($top + 31))
            $graphics.DrawLine($symbolPen, 664, ($top + 23), 664, ($top + 28))
            $graphics.DrawLine($symbolPen, 672, ($top + 23), 672, ($top + 28))
        }
        'question' {
            $questionFont = New-Object System.Drawing.Font('Segoe UI', 21, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
            $questionBrush = New-Object System.Drawing.SolidBrush((New-Color '#FFFFFF'))
            $graphics.DrawString('?', $questionFont, $questionBrush, 658, ($top + 20))
            $questionBrush.Dispose()
            $questionFont.Dispose()
        }
        'notes' {
            $graphics.DrawRectangle($symbolPen, 660, ($top + 23), 16, 22)
            $graphics.DrawLine($symbolPen, 663, ($top + 30), 673, ($top + 30))
            $graphics.DrawLine($symbolPen, 663, ($top + 35), 673, ($top + 35))
            $graphics.DrawLine($symbolPen, 663, ($top + 40), 670, ($top + 40))
        }
    }

    $labelFont = New-Object System.Drawing.Font('Segoe UI', 19, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $labelBrush = New-Object System.Drawing.SolidBrush((New-Color '#173B60'))
    $graphics.DrawString($label, $labelFont, $labelBrush, 707, ($top + 21))

    $labelBrush.Dispose()
    $labelFont.Dispose()
    $symbolPen.Dispose()
    $circleBrush.Dispose()
    $white.Dispose()
    $shadow.Dispose()
}

if (-not (Test-Path -LiteralPath $iconSource)) {
    throw "Missing app icon source: $iconSource"
}

$sourceIcon = [System.Drawing.Image]::FromFile($iconSource)
$iconBitmap = New-Object System.Drawing.Bitmap(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$iconGraphics = [System.Drawing.Graphics]::FromImage($iconBitmap)
$iconGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$iconGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$iconGraphics.DrawImage($sourceIcon, 0, 0, 512, 512)
$iconBitmap.Save($iconOutput, [System.Drawing.Imaging.ImageFormat]::Png)
$iconGraphics.Dispose()
$iconBitmap.Dispose()
$sourceIcon.Dispose()

$bitmap = New-Object System.Drawing.Bitmap(1024, 500, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$background = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Rectangle(0, 0, 1024, 500)),
    (New-Color '#F6FBFF'),
    (New-Color '#EAF8FF'),
    0.0
)
$graphics.FillRectangle($background, 0, 0, 1024, 500)

$haloBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(115, 207, 241, 255))
$softCircleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(145, 220, 248, 240))
$graphics.FillEllipse($haloBrush, 678, -76, 430, 430)
$graphics.FillEllipse($softCircleBrush, 856, 322, 252, 252)

$logoCardBrush = New-Object System.Drawing.SolidBrush((New-Color '#FFFFFF'))
$logoShadow = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(24, 29, 91, 151))
Fill-RoundedRectangle $graphics $logoShadow 69 53 68 68 18
Fill-RoundedRectangle $graphics $logoCardBrush 64 48 68 68 18
$sourceIcon = [System.Drawing.Image]::FromFile($iconSource)
$graphics.DrawImage($sourceIcon, 67, 51, 62, 62)
$sourceIcon.Dispose()

$brandFont = New-Object System.Drawing.Font('Segoe UI', 25, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$brandBrush = New-Object System.Drawing.SolidBrush((New-Color '#071B36'))
$graphics.DrawString('DoctorAI World', $brandFont, $brandBrush, 150, 67)

$accentBrush = New-Object System.Drawing.SolidBrush((New-Color '#0D75F5'))
Fill-RoundedRectangle $graphics $accentBrush 65 151 52 5 2.5

$headlineFont = New-Object System.Drawing.Font('Segoe UI', 42, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$headlineBrush = New-Object System.Drawing.SolidBrush((New-Color '#071B36'))
$graphics.DrawString('Organise health details', $headlineFont, $headlineBrush, 64, 184)
$graphics.DrawString('for your next care visit', $headlineFont, $headlineBrush, 64, 241)

$subtitleFont = New-Object System.Drawing.Font('Segoe UI', 19, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$subtitleBrush = New-Object System.Drawing.SolidBrush((New-Color '#55728D'))
$graphics.DrawString('Appointments, medicines and questions', $subtitleFont, $subtitleBrush, 65, 322)

Draw-VisitCard $graphics 104 'Appointments' '#0D75F5' 'calendar'
Draw-VisitCard $graphics 198 'Questions' '#168D9A' 'question'
Draw-VisitCard $graphics 292 'Health notes' '#7952D8' 'notes'

$subtitleBrush.Dispose()
$subtitleFont.Dispose()
$headlineBrush.Dispose()
$headlineFont.Dispose()
$accentBrush.Dispose()
$brandBrush.Dispose()
$brandFont.Dispose()
$logoShadow.Dispose()
$logoCardBrush.Dispose()
$softCircleBrush.Dispose()
$haloBrush.Dispose()
$background.Dispose()
$graphics.Dispose()
$bitmap.Save($graphicOutput, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

Write-Output "Created $iconOutput and $graphicOutput"
