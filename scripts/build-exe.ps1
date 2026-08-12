[CmdletBinding()]
param(
    [switch]$SkipSign
)

$ErrorActionPreference = 'Stop'
$env:PSModulePath = @(
    (Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules'),
    (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules')
) -join ';'
Import-Module Microsoft.PowerShell.Utility -ErrorAction Stop
Import-Module Microsoft.PowerShell.Security -ErrorAction Stop
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dist = [IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
if (-not $dist.StartsWith($projectRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing unexpected output path: $dist"
}
if (Test-Path -LiteralPath $dist) {
    Remove-Item -LiteralPath $dist -Recurse -Force
}
New-Item -ItemType Directory -Path $dist | Out-Null

Push-Location $projectRoot
try {
    & npm exec -- esbuild triage.js --bundle --platform=node --target=node24 --format=cjs --minify --outfile=dist/triage.cjs
    if ($LASTEXITCODE) { throw 'esbuild failed' }

    & node --experimental-sea-config sea-config.json
    if ($LASTEXITCODE) { throw 'SEA blob generation failed' }

    $nodeExe = (Get-Command node.exe).Source
    $outputExe = Join-Path $dist 'context-menu-triage.exe'
    Copy-Item -LiteralPath $nodeExe -Destination $outputExe
    & npm exec -- postject $outputExe NODE_SEA_BLOB (Join-Path $dist 'triage.blob') --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
    if ($LASTEXITCODE) { throw 'SEA injection failed' }

    $package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
    & node (Join-Path $projectRoot 'scripts\set-exe-metadata.mjs') $outputExe $package.version
    if ($LASTEXITCODE) { throw 'executable metadata update failed' }

    $hasCertificate = -not [string]::IsNullOrWhiteSpace($env:WINDOWS_CERTIFICATE_BASE64)
    $hasPassword = -not [string]::IsNullOrWhiteSpace($env:WINDOWS_CERTIFICATE_PASSWORD)
    if (-not $SkipSign -and ($hasCertificate -xor $hasPassword)) {
        throw 'Both WINDOWS_CERTIFICATE_BASE64 and WINDOWS_CERTIFICATE_PASSWORD are required for signing.'
    }
    if (-not $SkipSign -and $hasCertificate -and $hasPassword) {
        $certificate = Join-Path $dist 'release-signing.pfx'
        try {
            [IO.File]::WriteAllBytes($certificate, [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE_BASE64))
            $signTool = (Get-Command signtool.exe -ErrorAction SilentlyContinue).Source
            if (-not $signTool) {
                $signTool = Get-ChildItem -Path "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
                    Sort-Object FullName -Descending |
                    Select-Object -First 1 -ExpandProperty FullName
            }
            if (-not $signTool) { throw 'signtool.exe was not found.' }
            & $signTool sign /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com /f $certificate /p $env:WINDOWS_CERTIFICATE_PASSWORD $outputExe
            if ($LASTEXITCODE) { throw 'Authenticode signing failed' }
        }
        finally {
            Remove-Item -LiteralPath $certificate -Force -ErrorAction SilentlyContinue
        }
    }

    $hash = (Get-FileHash -LiteralPath $outputExe -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content -LiteralPath (Join-Path $dist 'context-menu-triage.exe.sha256') -Value "$hash  context-menu-triage.exe" -Encoding ASCII
    & npm sbom --sbom-format cyclonedx | Set-Content -LiteralPath (Join-Path $dist 'sbom.cdx.json') -Encoding UTF8
    if ($LASTEXITCODE) { throw 'SBOM generation failed' }

    [pscustomobject]@{
        executable = $outputExe
        sha256 = $hash
        signed = [bool]((Get-AuthenticodeSignature -LiteralPath $outputExe).Status -eq 'Valid')
    } | ConvertTo-Json
}
finally {
    Pop-Location
}
