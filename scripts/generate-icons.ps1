Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot "..\Image\ikon.jpg"
$destPng = Join-Path $PSScriptRoot "..\Image\icon.png"
$destIco = Join-Path $PSScriptRoot "..\Image\icon.ico"
$publicDir = Join-Path $PSScriptRoot "..\public"

if (-not (Test-Path $publicDir)) {
    New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
}

$img = [System.Drawing.Image]::FromFile($sourcePath)

# 1. Save 256x256 PNG
$bmp256 = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp256)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($img, 0, 0, 256, 256)
$g.Dispose()

$bmp256.Save($destPng, [System.Drawing.Imaging.ImageFormat]::Png)

# 2. Save .ico file using Icon.FromHandle
$hIcon = $bmp256.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = New-Object System.IO.FileStream($destIco, [System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()
$icon.Dispose()

$bmp256.Dispose()
$img.Dispose()

# 3. Copy to public directory
Copy-Item $sourcePath (Join-Path $publicDir "ikon.jpg") -Force
Copy-Item $destPng (Join-Path $publicDir "icon.png") -Force
Copy-Item $destIco (Join-Path $publicDir "favicon.ico") -Force

Write-Host "Icons generated successfully!"
