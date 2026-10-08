# Signing Setup

Stable Windows releases are signed with **Azure Trusted Signing** (Azure Artifact Signing), a Microsoft-managed public-trust Authenticode service. The SignPath Foundation application was declined, so that path is retired. Signing is gated: until the Azure variables below are set on the repository, the release workflow publishes a clearly labelled unsigned build. Once they are set, the same workflow signs the installer and requires a valid Authenticode signature before publishing.

Azure Trusted Signing is a paid service (Basic plan ~$9.99/month). As of its general availability it accepts self-employed individuals with no multi-year business-history requirement; the signer must be in the US, Canada, EU, or UK for a public-trust certificate.

## Artifact

- Project: `Context Menu Triage`
- Repository: <https://github.com/mario0318/context-menu-triage>
- License: MIT
- Artifact: per-user Windows x64 NSIS installer (`context-menu-triage-setup.exe`)
- Build system: GitHub Actions on GitHub-hosted Windows runners (Tauri, `npm run app:build`)

## One-time Azure provisioning

1. In the Azure portal, register the `Microsoft.CodeSigning` resource provider on the subscription.
2. Create a **Trusted Signing account** and a **certificate profile** of type **Public Trust** (identity validation: Individual). Note the account's region endpoint, e.g. `https://eus.codesigning.azure.net/`, the account name, and the certificate-profile name.
3. Create an **Entra ID app registration** (or a user-assigned managed identity) to act as the signing identity. Record its **client ID**, the **tenant ID**, and the **subscription ID**.
4. Grant that identity the **Trusted Signing Certificate Profile Signer** role on the Trusted Signing account (or on the certificate profile).
5. Add a **federated credential** to the app registration for GitHub OIDC, so no client secret is stored:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject: `repo:mario0318/context-menu-triage:environment:release`
   - Audience: `api://AzureADTokenExchange`

## GitHub repository variables

Set these as repository **variables** (Settings → Secrets and variables → Actions → Variables). None are secrets — OIDC supplies the credential at run time, and `AZURE_SIGNING_ACCOUNT` is the switch that turns signing on.

- `AZURE_SIGNING_ACCOUNT` — Trusted Signing account name
- `AZURE_SIGNING_ENDPOINT` — region endpoint, e.g. `https://eus.codesigning.azure.net/`
- `AZURE_SIGNING_CERT_PROFILE` — certificate-profile name
- `AZURE_CLIENT_ID` — app registration / managed identity client ID
- `AZURE_TENANT_ID` — Entra tenant ID
- `AZURE_SUBSCRIPTION_ID` — subscription ID

## Release

The release tag must match `package.json` and `src-tauri/tauri.conf.json`, including any prerelease suffix. The `release` environment requires one manual approval. The workflow builds the native app and NSIS installer (`npm run app:build`), enforces the `Context Menu Triage` product name, and — when the Azure variables are present — logs in to Azure over OIDC, signs the installer with Trusted Signing, and requires `Get-AuthenticodeSignature` to return `Valid` before it generates checksums and publishes the installer with its SBOM. With the variables absent, it publishes the same installer unsigned, labelled as such.

Unsigned releases must remain explicitly labelled as unsigned. The `azure/trusted-signing-action` version pinned in the workflow should be checked against the action's latest release when signing is first enabled.
