# Signing Setup

Stable Windows releases use Azure Artifact Signing Public Trust with GitHub OIDC. No certificate or client secret is stored in GitHub.

## Prepared Infrastructure

- Azure subscription: `db9f81ff-8fae-4453-9bee-bf9ada4f777a`
- Entra application: `context-menu-triage-github`
- Application ID: `5c342bf0-674c-49f2-b117-ab8b418dff97`
- Federated subject: `repo:mario0318/context-menu-triage:environment:release`
- GitHub environment: `release`

The `Microsoft.CodeSigning` provider is registered and the Azure CLI `artifact-signing` extension is installed on the maintainer machine.

## Interactive Step

Azure Public Trust identity validation must be completed in the Azure portal and cannot be automated with the CLI. Before creating the account, confirm the Azure billing profile's legal name, account type, and address match the government ID that will be used.

1. Open [Artifact Signing Accounts](https://portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.CodeSigning%2FcodeSigningAccounts).
2. Create a Basic account in a supported region. Billing begins when the account is created.
3. Assign the maintainer the **Artifact Signing Identity Verifier** role on the account.
4. Create an **Individual / Public** identity validation and complete the external identity check.
5. After validation succeeds, create a certificate profile with type **PublicTrust**.

Then complete the role assignment and GitHub variables:

```powershell
.\scripts\Complete-ArtifactSigningSetup.ps1 `
  -ResourceGroup <resource-group> `
  -AccountName <account-name> `
  -ProfileName <profile-name> `
  -Region EastUS
```

Push tag `v1.1.0`. The release workflow builds the executable, authenticates through OIDC, signs and timestamps it, verifies `Get-AuthenticodeSignature` returns `Valid`, regenerates the post-signing SHA-256 checksum, and publishes the executable with its SBOM.
