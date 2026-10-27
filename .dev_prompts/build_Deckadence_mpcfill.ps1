<#
.SYNOPSIS
Build the MPCFill Browser distribution ZIP on Windows, Linux, or macOS.
.DESCRIPTION
Based on the Card Finishing Studio package builder. Validates the plugin and
companion application, then packages its manifest, guide, license and build
metadata with a SHA-256 checksum. The same ZIP supports all Deckadence platforms.
MPCFill's code and interface ship inside Deckadence; users install/update through
Settings > Plugins after updating the app. No Python or dependency downloads.

Requires build Python 3.10+. Works with Windows PowerShell 5.1 and PowerShell 7.
Outputs to dist by default; temporary staging stays under .dev_prompts/ai_work.
Prints the GitHub release tag and title, including with -CheckOnly.
.EXAMPLE
./.dev_prompts/build_Deckadence_mpcfill.ps1
.EXAMPLE
./.dev_prompts/build_Deckadence_mpcfill.ps1 -CheckOnly
.EXAMPLE
./.dev_prompts/build_Deckadence_mpcfill.ps1 -Linux -Distribution Ubuntu-22.04
.PARAMETER Linux
On Windows, run the builder inside WSL. On native Linux, use local Python.
.PARAMETER Python
Python executable or command. With -Linux on Windows this is a Linux command.
.PARAMETER OutputDirectory
Output folder, resolved relative to the caller's current directory.
#>
[CmdletBinding()]
param(
    [switch]$Linux,
    [string]$Distribution = "Ubuntu-22.04",
    [string]$Python,
    [string]$OutputDirectory,
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Builder = Join-Path $RepoRoot "plugin_src/build_mpcfill_plugin.py"
$OnWindows = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
if (-not (Test-Path -LiteralPath $Builder -PathType Leaf)) {
    throw "MPCFill Browser builder is missing: $Builder"
}
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $RepoRoot "dist" }
$OutputDirectory = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)

Write-Host ""
Write-Host "========================================"
Write-Host " MPCFill Browser Package Builder"
Write-Host "========================================"

if ($Linux -and $OnWindows) {
    if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
        throw "WSL is required for -Linux on Windows. Omit -Linux to build the same portable ZIP on Windows."
    }
    function ConvertTo-LinuxPath([string]$Path) {
        $Result = & wsl.exe -d $Distribution -- wslpath -a -u $Path.Replace('\', '/')
        if ($LASTEXITCODE -ne 0) { throw "Cannot access $Path inside WSL distribution $Distribution." }
        return ($Result -join "").Trim()
    }
    $LinuxBuilder = ConvertTo-LinuxPath $Builder
    $LinuxOutput = ConvertTo-LinuxPath $OutputDirectory
    if (-not $Python) { $Python = "python3" }
    $BuildArguments = @("-B", $LinuxBuilder, "--output-dir", $LinuxOutput)
    if ($CheckOnly) { $BuildArguments += "--check-only" }
    & wsl.exe -d $Distribution -- $Python @BuildArguments
} else {
    if (-not $Python) {
        $Candidates = if ($OnWindows) { @("python", "python3") } else { @("python3", "python") }
        foreach ($Candidate in $Candidates) {
            if (Get-Command $Candidate -ErrorAction SilentlyContinue) { $Python = $Candidate; break }
        }
    }
    if (-not $Python) { throw "Python 3.10 or newer is required. Install Python or pass -Python with its executable path." }
    $BuildArguments = @("-B", $Builder, "--output-dir", $OutputDirectory)
    if ($CheckOnly) { $BuildArguments += "--check-only" }
    & $Python @BuildArguments
}
if ($LASTEXITCODE -ne 0) { throw "MPCFill Browser build failed (exit $LASTEXITCODE). See the error above." }
