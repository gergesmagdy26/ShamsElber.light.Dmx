$port = 8080
$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$projectDir = Join-Path $root "project"
$projectDataFile = Join-Path $projectDir "data.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $projectDir)) {
  New-Item -ItemType Directory -Path $projectDir -Force | Out-Null
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host " ShamsElber light. DMX - Local PWA & Project Sync Server" -ForegroundColor Green
Write-Host " Open in Browser: http://localhost:$port" -ForegroundColor Cyan
Write-Host " Project Data:    $projectDataFile" -ForegroundColor Gray
Write-Host " Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Yellow

Start-Process "http://localhost:$port"

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".ico"  = "image/x-icon"
}

function Write-JsonResponse($res, [int]$statusCode, [string]$jsonText) {
  $res.StatusCode = $statusCode
  $res.ContentType = "application/json; charset=utf-8"
  $res.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
  $bytes = $utf8NoBom.GetBytes($jsonText)
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response

    try {
      $urlPath = $req.Url.LocalPath
      $relPath = $urlPath.TrimStart('/')

      # Local Disk Project Sync API
      if ($urlPath -eq "/api/project-status" -and $req.HttpMethod -eq "GET") {
        $existsJson = if (Test-Path $projectDataFile) { "true" } else { "false" }
        Write-JsonResponse $res 200 "{`"ok`":true,`"mode`":`"local-disk`",`"file`":`"project/data.json`",`"exists`":$existsJson}"
      }
      elseif ($urlPath -eq "/api/project-data" -and $req.HttpMethod -eq "GET") {
        if (Test-Path $projectDataFile -PathType Leaf) {
          $res.StatusCode = 200
          $res.ContentType = "application/json; charset=utf-8"
          $res.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
          $bytes = [System.IO.File]::ReadAllBytes($projectDataFile)
          $res.ContentLength64 = $bytes.Length
          $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
          Write-JsonResponse $res 404 "{`"ok`":false,`"error`":`"not_found`"}"
        }
      }
      elseif ($urlPath -eq "/api/project-data" -and $req.HttpMethod -eq "POST") {
        $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
        $body = $reader.ReadToEnd()
        $reader.Close()
        $trimmed = if ($body) { $body.Trim() } else { "" }

        if ($trimmed.StartsWith("{") -and $trimmed.EndsWith("}")) {
          if (-not (Test-Path $projectDir)) {
            New-Item -ItemType Directory -Path $projectDir -Force | Out-Null
          }
          $tmpFile = "$projectDataFile.tmp"
          [System.IO.File]::WriteAllText($tmpFile, $trimmed, $utf8NoBom)
          Move-Item -Path $tmpFile -Destination $projectDataFile -Force
          $size = (Get-Item $projectDataFile).Length
          Write-JsonResponse $res 200 "{`"ok`":true,`"bytes`":$size}"
        } else {
          Write-JsonResponse $res 400 "{`"ok`":false,`"error`":`"invalid_json`"}"
        }
      }
      else {
        # Static file serving (confined strictly inside $root)
        if ([string]::IsNullOrEmpty($relPath)) { $relPath = "index.html" }
        $safeRel = $relPath -replace '/', [System.IO.Path]::DirectorySeparatorChar
        $candidate = [System.IO.Path]::GetFullPath((Join-Path $root $safeRel))

        if ($candidate.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path $candidate -PathType Leaf)) {
          $ext = [System.IO.Path]::GetExtension($candidate).ToLower()
          $res.ContentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
          if ($relPath -ieq "project/data.json" -or $relPath -ieq "manifest.json" -or $relPath -ieq "sw.js") {
            $res.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
          } elseif ($ext -in @(".html", ".css", ".js")) {
            $res.Headers["Cache-Control"] = "no-cache, must-revalidate"
          }
          $bytes = [System.IO.File]::ReadAllBytes($candidate)
          $res.ContentLength64 = $bytes.Length
          $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
          $res.StatusCode = 404
        }
      }
    } catch {
      try {
        Write-JsonResponse $res 500 "{`"ok`":false,`"error`":`"server_error`"}"
      } catch {}
    } finally {
      try { $res.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
}
