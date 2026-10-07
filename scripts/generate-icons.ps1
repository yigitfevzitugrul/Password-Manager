Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot "..\Image\ikon.jpg"
$destPng = Join-Path $PSScriptRoot "..\Image\icon.png"
$destIco = Join-Path $PSScriptRoot "..\Image\icon.ico"
$publicDir = Join-Path $PSScriptRoot "..\public"

if (-not (Test-Path $publicDir)) {
    New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
}

$img = [System.Drawing.Image]::FromFile($sourcePath)

# Renders the source as a plain rounded tile with transparent corners
function New-IconBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $d = [single]($size * 0.36)
    $max = [single]$size
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($max - $d, 0, $d, $d, 270, 90)
    $path.AddArc($max - $d, $max - $d, $d, $d, 0, 90)
    $path.AddArc(0, $max - $d, $d, $d, 90, 90)
    $path.CloseFigure()

    $brush = New-Object System.Drawing.TextureBrush $img
    $scale = [single]($size / $img.Width)
    $brush.ScaleTransform($scale, $scale)
    $g.FillPath($brush, $path)

    $brush.Dispose()
    $path.Dispose()
    $g.Dispose()
    return $bmp
}

function Get-PngBytes($bmp) {
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()
    $ms.Dispose()
    return , $bytes
}

# 1. Save 256x256 PNG
$bmp256 = New-IconBitmap 256
$bmp256.Save($destPng, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp256.Dispose()

# 2. Save multi-size .ico (PNG-compressed entries) so every Windows icon size stays sharp
$sizes = 16, 24, 32, 48, 64, 128, 256
$images = @()
foreach ($size in $sizes) {
    $bmp = New-IconBitmap $size
    $images += , (Get-PngBytes $bmp)
    $bmp.Dispose()
}

$fs = New-Object System.IO.FileStream($destIco, [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $dim = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
    $bw.Write([byte]$dim)
    $bw.Write([byte]$dim)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]32)
    $bw.Write([uint32]$images[$i].Length)
    $bw.Write([uint32]$offset)
    $offset += $images[$i].Length
}
foreach ($bytes in $images) {
    $bw.Write($bytes)
}
$bw.Close()
$fs.Close()

$img.Dispose()

# 3. Copy to public directory
Copy-Item $sourcePath (Join-Path $publicDir "ikon.jpg") -Force
Copy-Item $destPng (Join-Path $publicDir "icon.png") -Force
Copy-Item $destIco (Join-Path $publicDir "favicon.ico") -Force

Write-Host "Icons generated successfully!"
