[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ResourceGroup,
    [Parameter(Mandatory)][string]$AccountName,
    [Parameter(Mandatory)][string]$ProfileName,
    [Parameter(Mandatory)][ValidateSet('BrazilSouth', 'CentralUS', 'EastUS', 'JapanEast', 'KoreaCentral', 'NorthCentralUS', 'NorthEurope', 'PolandCentral', 'SouthCentralUS', 'SwitzerlandNorth', 'WestCentralUS', 'WestEurope', 'WestUS', 'WestUS2', 'WestUS3')][string]$Region,
    [string]$ApplicationId = '5c342bf0-674c-49f2-b117-ab8b418dff97',
    [string]$Repository = 'mario0318/context-menu-triage'
)

$ErrorActionPreference = 'Stop'

$account = az artifact-signing show --resource-group $ResourceGroup --name $AccountName | ConvertFrom-Json
if ($LASTEXITCODE -or -not $account.id) { throw 'Artifact Signing account was not found.' }

$profile = az artifact-signing certificate-profile show --resource-group $ResourceGroup --account-name $AccountName --name $ProfileName | ConvertFrom-Json
if ($LASTEXITCODE -or -not $profile.id) { throw 'Artifact Signing certificate profile was not found.' }
if ($profile.properties.profileType -ne 'PublicTrust') { throw 'Stable releases require a PublicTrust certificate profile.' }

$servicePrincipalId = az ad sp show --id $ApplicationId --query id -o tsv
if ($LASTEXITCODE -or -not $servicePrincipalId) { throw 'GitHub OIDC service principal was not found.' }

$existingRole = az role assignment list --assignee-object-id $servicePrincipalId --scope $profile.id --role 'Artifact Signing Certificate Profile Signer' --query '[0].id' -o tsv
if (-not $existingRole) {
    az role assignment create --assignee-object-id $servicePrincipalId --assignee-principal-type ServicePrincipal --role 'Artifact Signing Certificate Profile Signer' --scope $profile.id | Out-Null
    if ($LASTEXITCODE) { throw 'Artifact Signing signer role assignment failed.' }
}

$endpoints = @{
    BrazilSouth = 'https://brs.codesigning.azure.net'
    CentralUS = 'https://cus.codesigning.azure.net'
    EastUS = 'https://eus.codesigning.azure.net'
    JapanEast = 'https://jpe.codesigning.azure.net'
    KoreaCentral = 'https://krc.codesigning.azure.net'
    NorthCentralUS = 'https://ncus.codesigning.azure.net'
    NorthEurope = 'https://neu.codesigning.azure.net'
    PolandCentral = 'https://plc.codesigning.azure.net'
    SouthCentralUS = 'https://scus.codesigning.azure.net'
    SwitzerlandNorth = 'https://swn.codesigning.azure.net'
    WestCentralUS = 'https://wcus.codesigning.azure.net'
    WestEurope = 'https://weu.codesigning.azure.net'
    WestUS = 'https://wus.codesigning.azure.net'
    WestUS2 = 'https://wus2.codesigning.azure.net'
    WestUS3 = 'https://wus3.codesigning.azure.net'
}

gh variable set ARTIFACT_SIGNING_ACCOUNT --repo $Repository --body $AccountName
if ($LASTEXITCODE) { throw 'Could not set ARTIFACT_SIGNING_ACCOUNT.' }
gh variable set ARTIFACT_SIGNING_PROFILE --repo $Repository --body $ProfileName
if ($LASTEXITCODE) { throw 'Could not set ARTIFACT_SIGNING_PROFILE.' }
gh variable set ARTIFACT_SIGNING_ENDPOINT --repo $Repository --body $endpoints[$Region]
if ($LASTEXITCODE) { throw 'Could not set ARTIFACT_SIGNING_ENDPOINT.' }

Write-Output 'Artifact Signing role and GitHub variables configured.'
