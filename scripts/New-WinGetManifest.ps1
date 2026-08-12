[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Version,
    [Parameter(Mandatory)][string]$InstallerUrl,
    [Parameter(Mandatory)][string]$InstallerSha256,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\winget')
)

$ErrorActionPreference = 'Stop'
$output = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $output -Force | Out-Null
$packageIdentifier = 'mario0318.ContextMenuTriage'

$versionManifest = @"
PackageIdentifier: $packageIdentifier
PackageVersion: $Version
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.10.0
"@
$installerManifest = @"
PackageIdentifier: $packageIdentifier
PackageVersion: $Version
InstallerType: portable
Commands:
- context-menu-triage
Installers:
- Architecture: x64
  InstallerUrl: $InstallerUrl
  InstallerSha256: $($InstallerSha256.ToUpperInvariant())
ManifestType: installer
ManifestVersion: 1.10.0
"@
$localeManifest = @"
PackageIdentifier: $packageIdentifier
PackageVersion: $Version
PackageLocale: en-US
Publisher: mario0318
PackageName: Context Menu Triage
License: MIT
ShortDescription: Inspect and reversibly block legacy Windows Explorer context menu handlers.
PackageUrl: https://github.com/mario0318/context-menu-triage
PublisherUrl: https://github.com/mario0318
Tags:
- context-menu
- explorer
- shell-extension
- windows
ManifestType: defaultLocale
ManifestVersion: 1.10.0
"@

Set-Content -LiteralPath (Join-Path $output "$packageIdentifier.yaml") -Value $versionManifest -Encoding UTF8
Set-Content -LiteralPath (Join-Path $output "$packageIdentifier.installer.yaml") -Value $installerManifest -Encoding UTF8
Set-Content -LiteralPath (Join-Path $output "$packageIdentifier.locale.en-US.yaml") -Value $localeManifest -Encoding UTF8
Write-Output $output
