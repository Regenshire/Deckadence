param(
    [string]$PythonRuntime = $env:DECKADENCE_PLUGIN_RUNTIME
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================"
Write-Host " Deckadence AMD ROCm Plugin Package Builder"
Write-Host "========================================"
Write-Host ""

$PluginSrcRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$RepoRoot = Split-Path -Parent $PluginSrcRoot

$PluginSource = Join-Path `
    $PluginSrcRoot `
    "upscaler-amd-rocm"

$ManifestPath = Join-Path `
    $PluginSource `
    "deckadence-plugin.json"

$BuildRoot = Join-Path `
    $RepoRoot `
    ".dev_prompts\ai_work\build\upscaler-amd-rocm"

$DistRoot = Join-Path `
    $RepoRoot `
    "dist"

$OutputZip = Join-Path `
    $DistRoot `
    "deckadence-upscaler-amd-rocm-runtime.zip"


Write-Host "[1/7] Checking plugin source..."

if (-not (Test-Path $PluginSource)) {
    throw "Plugin source folder was not found: $PluginSource"
}

if (-not (Test-Path $ManifestPath)) {
    throw "Plugin manifest was not found: $ManifestPath"
}

$Manifest = Get-Content `
    $ManifestPath `
    -Raw |
    ConvertFrom-Json

$Version = [string]$Manifest.version

if (-not $Version) {
    throw "Plugin manifest does not contain a version."
}

Write-Host "      Plugin version: $Version"
Write-Host "      Source: $PluginSource"
Write-Host ""


if (-not $PythonRuntime) {
    $RuntimeCache = Join-Path $RepoRoot ".dev_prompts/ai_work/python-runtime"
    & python -B (Join-Path $PluginSrcRoot "package_runtime.py") --prepare $RuntimeCache
    if ($LASTEXITCODE -ne 0) { throw "Could not download Python for the addon. See the error above." }
    $PythonRuntime = Join-Path $RuntimeCache "python"
}

Write-Host "[2/7] Preparing clean build folder..."

if (Test-Path $BuildRoot) {
    Remove-Item `
        $BuildRoot `
        -Recurse `
        -Force
}

New-Item `
    -ItemType Directory `
    -Path $BuildRoot `
    -Force |
    Out-Null

New-Item `
    -ItemType Directory `
    -Path $DistRoot `
    -Force |
    Out-Null

Write-Host "      Build folder ready."
Write-Host ""


Write-Host "[3/7] Copying plugin files..."

$RequiredFiles = @(
    "deckadence-plugin.json",
    "plugin.py",
    "model_runtime.py",
    "requirements.txt",
    "README.md"
)

foreach ($FileName in $RequiredFiles) {
    $SourcePath = Join-Path `
        $PluginSource `
        $FileName

    if (-not (Test-Path $SourcePath)) {
        throw "Required plugin file was not found: $SourcePath"
    }

    Write-Host "      Copying $FileName"

    Copy-Item `
        -Path $SourcePath `
        -Destination $BuildRoot `
        -Force
}

Write-Host ""


Write-Host "[4/7] Copying processors..."

$ProcessorSource = Join-Path `
    $PluginSource `
    "processors"

$ProcessorDestination = Join-Path `
    $BuildRoot `
    "processors"

if (-not (Test-Path $ProcessorSource)) {
    throw "Processors folder was not found: $ProcessorSource"
}

New-Item `
    -ItemType Directory `
    -Path $ProcessorDestination `
    -Force |
    Out-Null

$ProcessorFiles = Get-ChildItem `
    -Path $ProcessorSource `
    -File `
    -Filter "*.py"

foreach ($ProcessorFile in $ProcessorFiles) {
    Write-Host "      Copying processors\$($ProcessorFile.Name)"

    Copy-Item `
        -Path $ProcessorFile.FullName `
        -Destination $ProcessorDestination `
        -Force
}

Write-Host ""
Write-Host "      $($ProcessorFiles.Count) processor files copied."
Write-Host ""


Write-Host "Adding private Python runtime..."
& (Join-Path $PythonRuntime "python.exe") -I (Join-Path $PluginSrcRoot "package_runtime.py") $PythonRuntime $BuildRoot
if ($LASTEXITCODE -ne 0) {
    throw "Private Python runtime packaging failed."
}

Write-Host "[5/7] Verifying package contents..."

$PackageFiles = Get-ChildItem `
    -Path $BuildRoot `
    -Recurse `
    -File

foreach ($PackageFile in $PackageFiles) {
    $RelativePath = $PackageFile.FullName.Substring(
        $BuildRoot.Length + 1
    )

    Write-Host "      $RelativePath"
}

$PackageBytes = (
    $PackageFiles |
    Measure-Object `
        -Property Length `
        -Sum
).Sum

$PackageMB = [math]::Round(
    $PackageBytes / 1MB,
    2
)

Write-Host ""
Write-Host "      Files: $($PackageFiles.Count)"
Write-Host "      Uncompressed size: $PackageMB MB"
Write-Host ""


Write-Host "[6/7] Creating ZIP package..."

if (Test-Path $OutputZip) {
    Remove-Item `
        $OutputZip `
        -Force
}

Compress-Archive `
    -Path (Join-Path $BuildRoot "*") `
    -DestinationPath $OutputZip `
    -Force

$ZipSizeMB = [math]::Round(
    (Get-Item $OutputZip).Length / 1MB,
    2
)

Write-Host "      ZIP created."
Write-Host "      ZIP size: $ZipSizeMB MB"
Write-Host ""


Write-Host "[7/7] Package complete."
Write-Host ""
Write-Host "Output:"
Write-Host "  $OutputZip"
Write-Host ""
Write-Host "Plugin version:"
Write-Host "  $Version"
Write-Host ""
Write-Host "GitHub release tag:"
Write-Host "  plugin-upscaler-amd-rocm-v$Version"
Write-Host ""
Write-Host "GitHub asset name:"
Write-Host "  deckadence-upscaler-amd-rocm-runtime.zip"
Write-Host ""
Write-Host "========================================"
Write-Host " Build completed successfully"
Write-Host "========================================"
Write-Host ""