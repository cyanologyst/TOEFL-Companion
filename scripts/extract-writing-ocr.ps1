param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDirectory,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] |
  Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] |
  Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime] |
  Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object {
    $_.Name -eq "AsTask" -and
    $_.IsGenericMethod -and
    $_.GetGenericArguments().Count -eq 1 -and
    $_.GetParameters().Count -eq 1
  } |
  Select-Object -First 1

function Await-WindowsRuntimeOperation {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Operation,

    [Parameter(Mandatory = $true)]
    [Type]$ResultType
  )

  $task = $script:asTaskGeneric.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

function Read-ImageText {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ImagePath,

    [Parameter(Mandatory = $true)]
    [Windows.Media.Ocr.OcrEngine]$Engine
  )

  $file = Await-WindowsRuntimeOperation `
    ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) `
    ([Windows.Storage.StorageFile])
  $stream = Await-WindowsRuntimeOperation `
    ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) `
    ([Windows.Storage.Streams.IRandomAccessStream])

  try {
    $decoder = Await-WindowsRuntimeOperation `
      ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) `
      ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await-WindowsRuntimeOperation `
      ($decoder.GetSoftwareBitmapAsync()) `
      ([Windows.Graphics.Imaging.SoftwareBitmap])

    try {
      $result = Await-WindowsRuntimeOperation `
        ($Engine.RecognizeAsync($bitmap)) `
        ([Windows.Media.Ocr.OcrResult])
      $lines = foreach ($line in $result.Lines) {
        $words = @($line.Words)
        if ($words.Count -eq 0) {
          continue
        }

        $left = ($words | ForEach-Object { $_.BoundingRect.X } | Measure-Object -Minimum).Minimum
        $top = ($words | ForEach-Object { $_.BoundingRect.Y } | Measure-Object -Minimum).Minimum
        $right = (
          $words |
            ForEach-Object { $_.BoundingRect.X + $_.BoundingRect.Width } |
            Measure-Object -Maximum
        ).Maximum
        $bottom = (
          $words |
            ForEach-Object { $_.BoundingRect.Y + $_.BoundingRect.Height } |
            Measure-Object -Maximum
        ).Maximum

        [ordered]@{
          text = $line.Text
          x = [math]::Round($left, 2)
          y = [math]::Round($top, 2)
          width = [math]::Round($right - $left, 2)
          height = [math]::Round($bottom - $top, 2)
        }
      }

      return [ordered]@{
        text = $result.Text
        lines = @($lines)
      }
    } finally {
      $bitmap.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

$resolvedSource = [System.IO.Path]::GetFullPath($SourceDirectory)
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $resolvedOutput
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) {
  throw "Windows OCR could not be initialized for the current user profile languages."
}

$results = foreach ($file in Get-ChildItem -LiteralPath $resolvedSource -Recurse -File -Filter "*.png" |
    Sort-Object FullName) {
  $relativePath = $file.FullName.Substring($resolvedSource.TrimEnd("\").Length + 1)
  Write-Host "OCR $relativePath"
  $recognition = Read-ImageText -ImagePath $file.FullName -Engine $engine
  [ordered]@{
    source = $relativePath.Replace("\", "/")
    text = $recognition.text
    lines = $recognition.lines
  }
}

$results | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $resolvedOutput -Encoding utf8
Write-Host "Wrote $($results.Count) OCR records to $resolvedOutput"
