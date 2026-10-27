param(
    [switch]$SkipAddons,
    [string]$PythonRuntime = $env:DECKADENCE_PLUGIN_RUNTIME
)

$ErrorActionPreference = "Stop"

function Test-AddonPackageCurrent {
    param([string]$Path, [string]$PluginId, [string]$Version)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $Archive = $null
    $Reader = $null
    try {
        $Archive = [System.IO.Compression.ZipFile]::OpenRead($Path)
        $ManifestEntry = $Archive.GetEntry("deckadence-plugin.json")
        # Windows PowerShell's Compress-Archive writes backslash entry names.
        $RuntimeEntry = $Archive.GetEntry("runtime/python.exe")
        if (-not $RuntimeEntry) { $RuntimeEntry = $Archive.GetEntry("runtime\python.exe") }
        if (-not $ManifestEntry -or -not $RuntimeEntry) {
            return $false
        }
        $Reader = New-Object System.IO.StreamReader($ManifestEntry.Open())
        $PackagedManifest = $Reader.ReadToEnd() | ConvertFrom-Json
        return (
            $PackagedManifest.plugin_id -ceq $PluginId -and
            $PackagedManifest.version -ceq $Version -and
            $PackagedManifest.bundled_runtime -eq $true
        )
    } catch {
        # An unreadable or incomplete previous package must be rebuilt.
        return $false
    } finally {
        if ($Reader) { $Reader.Dispose() }
        if ($Archive) { $Archive.Dispose() }
    }
}

Write-Host ""
Write-Host "========================================"
Write-Host "       Deckadence Windows Release Builder"
Write-Host "========================================"
Write-Host ""

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptRoot

$SettingsPath = Join-Path `
    $RepoRoot `
    "settings.py"

$SpecPath = Join-Path `
    $RepoRoot `
    "deckadence.spec"

$StartBatSource = Join-Path `
    $ScriptRoot `
    "Start_Deckadence.bat"

$BuildAppDir = Join-Path `
    $RepoRoot `
    "build\Deckadence"

$DistRoot = Join-Path `
    $RepoRoot `
    "dist"

$AppDistDir = Join-Path `
    $DistRoot `
    "Deckadence"

# Compare the version inside each existing ZIP with its source manifest.
# No separate build-state file is needed, and standalone addon builds count too.
$AddonBuilds = @()
if (-not $SkipAddons) {
    $AddonDefinitions = @(
        @{ Id = "upscaler-cpu"; Script = "build_cpu_plugin.ps1"; Asset = "deckadence-upscaler-cpu-runtime.zip" },
        @{ Id = "upscaler-nvidia-rtx50"; Script = "build_nvidia_plugin.ps1"; Asset = "deckadence-upscaler-nvidia-runtime.zip" },
        @{ Id = "upscaler-amd-rocm"; Script = "build_amd_rocm_plugin.ps1"; Asset = "deckadence-upscaler-amd-rocm-runtime.zip" }
    )
    foreach ($Addon in $AddonDefinitions) {
        $ManifestPath = Join-Path $RepoRoot "plugin_src/$($Addon.Id)/deckadence-plugin.json"
        $Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
        if ($Manifest.plugin_id -cne $Addon.Id -or [string]::IsNullOrWhiteSpace([string]$Manifest.version)) {
            throw "Invalid addon ID or version in $ManifestPath"
        }
        $Addon.Version = [string]$Manifest.version
        $Addon.Output = Join-Path $DistRoot $Addon.Asset
        $Addon.Builder = Join-Path $RepoRoot "plugin_src/$($Addon.Script)"
        if (Test-AddonPackageCurrent -Path $Addon.Output -PluginId $Addon.Id -Version $Addon.Version) {
            Write-Host "Addon unchanged: $($Addon.Id) v$($Addon.Version)"
        } else {
            if (-not (Test-Path -LiteralPath $Addon.Builder -PathType Leaf)) {
                throw "Addon builder not found: $($Addon.Builder)"
            }
            $AddonBuilds += $Addon
            Write-Host "Addon queued: $($Addon.Id) v$($Addon.Version)"
        }
    }
    if ($AddonBuilds.Count -gt 0) {
        if (-not $PythonRuntime) {
            $RuntimeCache = Join-Path $RepoRoot ".dev_prompts/ai_work/python-runtime"
            & python -B (Join-Path $RepoRoot "plugin_src/package_runtime.py") --prepare $RuntimeCache
            if ($LASTEXITCODE -ne 0) { throw "Could not download Python for the addons. See the error above." }
            $PythonRuntime = Join-Path $RuntimeCache "python"
        }
        $PythonRuntime = (Resolve-Path -LiteralPath $PythonRuntime).Path
    }
} else {
    Write-Host "Addon builds skipped (-SkipAddons)."
}


Write-Host "[1/6] Reading release version..."

if (-not (Test-Path $SettingsPath)) {
    throw "settings.py was not found: $SettingsPath"
}

$SettingsText = Get-Content `
    $SettingsPath `
    -Raw

$VersionMatch = [regex]::Match(
    $SettingsText,
    '(?m)^\s*APP_VERSION\s*=\s*"([^"]+)"'
)

if (-not $VersionMatch.Success) {
    throw "APP_VERSION could not be found in settings.py."
}

$Version = $VersionMatch.Groups[1].Value.Trim()

if (-not $Version) {
    throw "APP_VERSION is blank."
}

$OutputZip = Join-Path `
    $DistRoot `
    "Deckadence_v${Version}_Windows.zip"

Write-Host "      Version: $Version"
Write-Host "      Output:  $OutputZip"
Write-Host ""


Write-Host "[2/6] Checking release files..."

if (-not (Test-Path $SpecPath)) {
    throw "deckadence.spec was not found: $SpecPath"
}

if (-not (Test-Path $StartBatSource)) {
    throw "Start_Deckadence.bat was not found: $StartBatSource"
}

$PythonCommand = Get-Command `
    "python" `
    -ErrorAction SilentlyContinue

if (-not $PythonCommand) {
    throw "Python was not found in the current environment."
}

$PyInstallerVersion = & $PythonCommand.Source `
    -m PyInstaller `
    --version

if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller is not installed for the selected Python environment."
}

$WaitressVersion = & $PythonCommand.Source `
    -c "import importlib.metadata; print(importlib.metadata.version('waitress'))"

if ($LASTEXITCODE -ne 0) {
    throw "Waitress is not installed for the selected Python environment. Run: python -m pip install -r requirements.txt"
}

# Studio's printable mirrors require NumPy in the application itself. Private
# plugin Python is downloaded later by Studio setup, never by this check.
& $PythonCommand.Source -I -B -c "import numpy, requests, tarfile; from PIL import Image; assert hasattr(tarfile, 'data_filter'), 'Update build Python: safe tar extraction support is required'"
if ($LASTEXITCODE -ne 0) {
    throw "Studio build dependencies are incomplete. Update build Python and run: python -m pip install -r requirements.txt"
}
& $PythonCommand.Source -B (Join-Path $RepoRoot "plugin_src/build_card_finishing_plugin.py") --check-only
if ($LASTEXITCODE -ne 0) { throw "Card Finishing Studio source validation failed." }
& $PythonCommand.Source -B (Join-Path $RepoRoot "plugin_src/build_mpcfill_plugin.py") --check-only
if ($LASTEXITCODE -ne 0) { throw "MPCFill Browser source validation failed." }
if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "plugin_system/python_runtime.py") -PathType Leaf)) {
    throw "Studio's private Python installer is missing from the application source."
}

Write-Host "      Python:      $($PythonCommand.Source)"
Write-Host "      PyInstaller: $PyInstallerVersion"
Write-Host "      Waitress:    $WaitressVersion"
Write-Host "      Spec:        $SpecPath"
Write-Host "      Launcher:    $StartBatSource"
Write-Host ""


Write-Host "[3/6] Cleaning previous build output..."

if (Test-Path $BuildAppDir) {
    Write-Host "      Removing build\Deckadence"

    Remove-Item `
        $BuildAppDir `
        -Recurse `
        -Force
}

if (Test-Path $AppDistDir) {
    Write-Host "      Removing dist\Deckadence"

    Remove-Item `
        $AppDistDir `
        -Recurse `
        -Force
}

if (Test-Path $OutputZip) {
    Write-Host "      Removing old release ZIP"

    Remove-Item `
        $OutputZip `
        -Force
}

Write-Host "      Previous output cleared."
Write-Host ""


Write-Host "[4/6] Building Deckadence with PyInstaller..."
Write-Host ""
Write-Host "      python -m PyInstaller --noconfirm --clean deckadence.spec"
Write-Host ""
Write-Host "----------------------------------------"

Push-Location $RepoRoot

try {
    & $PythonCommand.Source `
        -m PyInstaller `
        --noconfirm `
        --clean `
        "deckadence.spec"

    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

Write-Host "----------------------------------------"
Write-Host ""

$AppExePath = Join-Path `
    $AppDistDir `
    "Deckadence.exe"

if (-not (Test-Path $AppExePath)) {
    throw "Build completed but Deckadence.exe was not found: $AppExePath"
}

Write-Host "      PyInstaller build complete."
Write-Host "      Found: $AppExePath"
Write-Host ""


Write-Host "[5/6] Adding Start_Deckadence.bat..."

$StartBatDestination = Join-Path `
    $AppDistDir `
    "Start_Deckadence.bat"

Copy-Item `
    $StartBatSource `
    $StartBatDestination `
    -Force

if (-not (Test-Path $StartBatDestination)) {
    throw "Start_Deckadence.bat was not copied successfully."
}

Write-Host "      Copied:"
Write-Host "      $StartBatDestination"
Write-Host ""

# Ship a per-user shortcut installer alongside the portable launcher.
$ShortcutInstaller = @'
param(
    [ValidateSet("Desktop", "StartMenu", "Both")]
    [string]$Location = "Both"
)
$ErrorActionPreference = "Stop"
try {
    $Launcher = Join-Path $PSScriptRoot "Start_Deckadence.bat"
    $Executable = Join-Path $PSScriptRoot "Deckadence.exe"
    if (-not (Test-Path -LiteralPath $Launcher) -or -not (Test-Path -LiteralPath $Executable)) {
        throw "Extract the complete Deckadence ZIP first, then run this installer from the extracted folder."
    }
    $Destinations = @()
    if ($Location -in @("Desktop", "Both")) {
        $Destinations += [Environment]::GetFolderPath("DesktopDirectory")
    }
    if ($Location -in @("StartMenu", "Both")) {
        $Destinations += [Environment]::GetFolderPath("Programs")
    }
    $Shell = New-Object -ComObject WScript.Shell
    foreach ($Destination in $Destinations) {
        if ([string]::IsNullOrWhiteSpace($Destination)) {
            throw "Windows could not find the selected shortcut folder."
        }
        New-Item -ItemType Directory -Path $Destination -Force | Out-Null
        $ShortcutPath = Join-Path $Destination "Deckadence.lnk"
        $Shortcut = $Shell.CreateShortcut($ShortcutPath)
        $Shortcut.TargetPath = $Launcher
        $Shortcut.WorkingDirectory = $PSScriptRoot
        $Shortcut.IconLocation = "$Executable,0"
        $Shortcut.Description = "Start Deckadence in your web browser"
        $Shortcut.Save()
        Write-Host "Created: $ShortcutPath"
    }
    Write-Host ""
    Write-Host "Done! Open Deckadence using your new shortcut."
    Write-Host "If you move the Deckadence folder, run this installer again."
    exit 0
} catch {
    Write-Host "Could not create shortcuts: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
'@

$ShortcutMenu = @'
@echo off
echo.
echo Deckadence - Install Shortcuts
echo.
echo Where do you want to add icons?
echo.
echo 1. Desktop
echo 2. Start menu
echo 3. Both
echo 4. Cancel
echo.
choice /c 1234 /n /m "Choose an option [1-4]: "
if errorlevel 4 exit /b 0
if errorlevel 3 goto both
if errorlevel 2 goto startmenu
if errorlevel 1 goto desktop
exit /b 1
:desktop
set "DECKADENCE_SHORTCUT_LOCATION=Desktop"
goto install
:startmenu
set "DECKADENCE_SHORTCUT_LOCATION=StartMenu"
goto install
:both
set "DECKADENCE_SHORTCUT_LOCATION=Both"
:install
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install_Deckadence_Shortcuts.ps1" -Location "%DECKADENCE_SHORTCUT_LOCATION%"
set "DECKADENCE_SHORTCUT_RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %DECKADENCE_SHORTCUT_RESULT%
'@

Set-Content -LiteralPath (Join-Path $AppDistDir "Install_Deckadence_Shortcuts.ps1") -Value $ShortcutInstaller -Encoding UTF8
Set-Content -LiteralPath (Join-Path $AppDistDir "Install_Shortcuts.bat") -Value $ShortcutMenu -Encoding ASCII


Write-Host "[6/6] Creating release ZIP..."

$ReleaseFiles = Get-ChildItem `
    $AppDistDir `
    -Recurse `
    -File

$ReleaseBytes = (
    $ReleaseFiles |
    Measure-Object `
        -Property Length `
        -Sum
).Sum

$ReleaseSizeMB = [math]::Round(
    $ReleaseBytes / 1MB,
    2
)

Write-Host "      Files: $($ReleaseFiles.Count)"
Write-Host "      Uncompressed size: $ReleaseSizeMB MB"
Write-Host ""
Write-Host "      Compressing..."
Write-Host ""

$ZipHelperPath = Join-Path `
    $RepoRoot `
    ".dev_prompts\ai_work\windows-release\zip_Deckadence_release.py"
New-Item -ItemType Directory -Path (Split-Path -Parent $ZipHelperPath) -Force | Out-Null

$ZipHelperCode = @'
import os
import sys
import zipfile


source_dir = os.path.abspath(sys.argv[1])
output_zip = os.path.abspath(sys.argv[2])

archive_root = os.path.basename(
    source_dir.rstrip("\\/")
)


def windows_extended_path(path):
    path = os.path.abspath(path)

    if (
        os.name == "nt"
        and not path.startswith("\\\\?\\")
    ):
        return "\\\\?\\" + path

    return path


files = []

for directory, _, filenames in os.walk(source_dir):
    for filename in filenames:
        files.append(
            os.path.join(
                directory,
                filename,
            )
        )


total_files = len(files)

print(
    f"      Preparing to compress "
    f"{total_files} files."
)

with zipfile.ZipFile(
    output_zip,
    mode="w",
    compression=zipfile.ZIP_DEFLATED,
    compresslevel=6,
    allowZip64=True,
) as archive:

    for index, file_path in enumerate(
        files,
        start=1,
    ):
        relative_path = os.path.relpath(
            file_path,
            source_dir,
        )

        archive_path = os.path.join(
            archive_root,
            relative_path,
        ).replace(
            "\\",
            "/",
        )

        archive.write(
            windows_extended_path(
                file_path
            ),
            archive_path,
        )

        if (
            index == 1
            or index % 250 == 0
            or index == total_files
        ):
            percent = (
                index
                / total_files
                * 100
            )

            print(
                f"      {index}/{total_files} "
                f"files ({percent:.0f}%)"
            )


print(
    "      ZIP compression finished."
)
'@

Set-Content `
    -Path $ZipHelperPath `
    -Value $ZipHelperCode `
    -Encoding UTF8

try {
    & $PythonCommand.Source `
        $ZipHelperPath `
        $AppDistDir `
        $OutputZip

    $ZipExitCode = $LASTEXITCODE

    if ($ZipExitCode -ne 0) {
        throw "ZIP creation failed with exit code $ZipExitCode."
    }
}
finally {
    if (Test-Path $ZipHelperPath) {
        Remove-Item `
            $ZipHelperPath `
            -Force
    }
}

if (-not (Test-Path $OutputZip)) {
    throw "Release ZIP was not created."
}

$ZipSizeMB = [math]::Round(
    (Get-Item $OutputZip).Length / 1MB,
    2
)

Write-Host "      Compression complete."
Write-Host ""

foreach ($Addon in $AddonBuilds) {
    Write-Host "Building addon: $($Addon.Id) v$($Addon.Version)"
    & $Addon.Builder -PythonRuntime $PythonRuntime
    if (-not (Test-AddonPackageCurrent -Path $Addon.Output -PluginId $Addon.Id -Version $Addon.Version)) {
        throw "Addon build did not produce the expected package: $($Addon.Output)"
    }
}

Write-Host "========================================"
Write-Host "       RELEASE BUILD COMPLETE"
Write-Host "========================================"
Write-Host ""
Write-Host "Deckadence version:"
Write-Host "  $Version"
Write-Host ""
Write-Host "Release ZIP:"
Write-Host "  $OutputZip"
Write-Host ""
Write-Host "ZIP size:"
Write-Host "  $ZipSizeMB MB"
Write-Host ""
Write-Host "GitHub tag:"
Write-Host "  v$Version"
Write-Host ""
Write-Host "GitHub release title:"
Write-Host "  Deckadence v$Version"
Write-Host ""
