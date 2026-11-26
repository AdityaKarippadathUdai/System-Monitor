<#
.SYNOPSIS
Ensures NSIS (makensis.exe) is installed and available on PATH for Windows builds.
Checks existing/common paths first, then falls back through verified official
NSIS sources with SHA-256 verification and exponential backoff retries.
#>

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$AttemptedMethods = [System.Collections.Generic.List[string]]::new()

function Find-Makensis {
    $cmd = Get-Command makensis -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -and (Test-Path $cmd.Source)) {
        return $cmd.Source
    }

    $candidates = @(
        "C:\Program Files (x86)\NSIS\makensis.exe",
        "C:\Program Files\NSIS\makensis.exe",
        "C:\ProgramData\chocolatey\bin\makensis.exe"
    )

    if (${env:ProgramFiles(x86)}) {
        $candidates += (Join-Path ${env:ProgramFiles(x86)} "NSIS\makensis.exe")
    }
    if ($env:ProgramFiles) {
        $candidates += (Join-Path $env:ProgramFiles "NSIS\makensis.exe")
    }
    if ($env:LOCALAPPDATA) {
        $candidates += (Join-Path $env:LOCALAPPDATA "NSIS\makensis.exe")
        $candidates += (Join-Path $env:LOCALAPPDATA "tauri\NSIS\makensis.exe")
    }
    if ($env:USERPROFILE) {
        $candidates += (Join-Path $env:USERPROFILE "scoop\apps\nsis\current\makensis.exe")
    }

    foreach ($path in ($candidates | Select-Object -Unique)) {
        if ($path -and (Test-Path $path)) {
            return $path
        }
    }

    if ($env:LOCALAPPDATA -and (Test-Path (Join-Path $env:LOCALAPPDATA "NSIS"))) {
        $nested = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA "NSIS") -Filter "makensis.exe" -Recurse -ErrorAction SilentlyContinue |
            Sort-Object { $_.FullName.Length } |
            Select-Object -First 1
        if ($nested) {
            return $nested.FullName
        }
    }

    return $null
}

function Invoke-DownloadWithRetry {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$OutFile,
        [Parameter(Mandatory = $true)][string]$ExpectedSha256,
        [int]$MaxAttempts = 4
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            if (Test-Path $OutFile) {
                Remove-Item -Path $OutFile -Force -ErrorAction SilentlyContinue
            }

            Write-Host "Downloading $Url (attempt $attempt/$MaxAttempts)..."
            Invoke-WebRequest -Uri $Url -OutFile $OutFile -UserAgent "curl/8.0" -UseBasicParsing -MaximumRedirection 10 -TimeoutSec 120

            if (-not (Test-Path $OutFile) -or ((Get-Item $OutFile).Length -lt 1024)) {
                throw "Downloaded file missing or unexpectedly small."
            }

            $actualHash = (Get-FileHash -Path $OutFile -Algorithm SHA256).Hash.ToUpperInvariant()
            $expectedUpper = $ExpectedSha256.ToUpperInvariant()
            if ($actualHash -ne $expectedUpper) {
                throw "SHA-256 verification failed. Expected $expectedUpper, got $actualHash."
            }

            Write-Host "Verified SHA-256 checksum: $actualHash"
            return $true
        } catch {
            Write-Warning "Download/verification attempt $attempt failed: $($_.Exception.Message)"
            if (Test-Path $OutFile) {
                Remove-Item -Path $OutFile -Force -ErrorAction SilentlyContinue
            }
            if ($attempt -lt $MaxAttempts) {
                $delaySec = [int][Math]::Pow(2, $attempt)
                Write-Host "Retrying in ${delaySec}s..."
                Start-Sleep -Seconds $delaySec
            }
        }
    }

    return $false
}

$makensisPath = Find-Makensis
if ($makensisPath) {
    Write-Host "Found existing NSIS installation at: $makensisPath"
}

# Method 1: Official NSIS 3.11 Windows installer from SourceForge (SHA-256 verified)
if (-not $makensisPath) {
    $AttemptedMethods.Add("Official NSIS 3.11 installer (SourceForge)")
    $installerPath = Join-Path $env:TEMP "nsis-3.11-setup.exe"
    $nsisUrl = "https://downloads.sourceforge.net/project/nsis/NSIS%203/3.11/nsis-3.11-setup.exe"
    $nsisSha256 = "38D49F8FE09B1C332B01D0940E57B7258F4447733643273A01C59959AD9D3B0A"

    if (Invoke-DownloadWithRetry -Url $nsisUrl -OutFile $installerPath -ExpectedSha256 $nsisSha256) {
        try {
            $bytes = [System.IO.File]::ReadAllBytes($installerPath)
            if ($bytes.Length -lt 2 -or $bytes[0] -ne 0x4D -or $bytes[1] -ne 0x5A) {
                throw "Downloaded installer is not a valid Windows PE executable."
            }
            Write-Host "Running silent NSIS 3.11 installation..."
            $proc = Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait -PassThru
            if ($proc.ExitCode -ne 0) {
                throw "NSIS installer exited with code $($proc.ExitCode)."
            }
            $makensisPath = Find-Makensis
        } catch {
            Write-Warning "NSIS 3.11 silent installation failed: $($_.Exception.Message)"
        } finally {
            Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue
        }
    }
}

# Method 2: Official Tauri binary-releases GitHub mirror (nsis-3.zip, SHA-256 verified)
if (-not $makensisPath) {
    $AttemptedMethods.Add("Official Tauri GitHub NSIS archive (tauri-apps/binary-releases)")
    $zipPath = Join-Path $env:TEMP "nsis-3.zip"
    $tauriNsisUrl = "https://github.com/tauri-apps/binary-releases/releases/download/nsis-3/nsis-3.zip"
    $tauriNsisSha256 = "1BB9FC85EE5B220D3869325DBB9D191DFE6537070F641C30FBB275C97051FD0C"

    if (Invoke-DownloadWithRetry -Url $tauriNsisUrl -OutFile $zipPath -ExpectedSha256 $tauriNsisSha256) {
        try {
            $extractDir = Join-Path $env:LOCALAPPDATA "NSIS"
            if (Test-Path $extractDir) {
                Remove-Item -Path $extractDir -Recurse -Force -ErrorAction SilentlyContinue
            }
            New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
            Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
            $makensisPath = Find-Makensis
        } catch {
            Write-Warning "Tauri NSIS archive extraction failed: $($_.Exception.Message)"
        } finally {
            Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
        }
    }
}

# Method 3: winget fallback
if (-not $makensisPath -and (Get-Command winget -ErrorAction SilentlyContinue)) {
    $AttemptedMethods.Add("Windows Package Manager (winget install NSIS.NSIS)")
    try {
        Write-Host "Attempting winget NSIS installation..."
        & winget install --id NSIS.NSIS --exact --silent --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -eq 0) {
            $makensisPath = Find-Makensis
        } else {
            Write-Warning "winget exited with code $LASTEXITCODE"
        }
    } catch {
        Write-Warning "winget NSIS installation failed: $($_.Exception.Message)"
    }
}

# Method 4: Chocolatey fallback with limited retry
if (-not $makensisPath -and (Get-Command choco -ErrorAction SilentlyContinue)) {
    $AttemptedMethods.Add("Chocolatey (choco install nsis -y)")
    for ($attempt = 1; $attempt -le 2; $attempt++) {
        try {
            Write-Host "Attempting Chocolatey NSIS installation (attempt $attempt/2)..."
            & choco install nsis -y --no-progress
            if ($LASTEXITCODE -eq 0) {
                $makensisPath = Find-Makensis
                if ($makensisPath) { break }
            }
        } catch {
            Write-Warning "Chocolatey attempt $attempt failed: $($_.Exception.Message)"
        }
        if ($attempt -lt 2) { Start-Sleep -Seconds 4 }
    }
}

if (-not $makensisPath -or -not (Test-Path $makensisPath)) {
    $summary = if ($AttemptedMethods.Count -gt 0) {
        $AttemptedMethods -join "; "
    } else {
        "No package managers or installers available"
    }
    Write-Error "Failed to locate or install NSIS (makensis.exe). Attempted methods: $summary."
    exit 1
}

$nsisDir = Split-Path -Parent $makensisPath
Write-Host "Using NSIS directory: $nsisDir"

if ($env:GITHUB_PATH) {
    $nsisDir | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append
}
$env:PATH = "$nsisDir;$env:PATH"

$versionOutput = & $makensisPath -VERSION
if ($LASTEXITCODE -ne 0) {
    Write-Error "makensis verification failed at '$makensisPath' (exit code $LASTEXITCODE)."
    exit 1
}

Write-Host "Verified makensis version: $versionOutput"
