# Signing Setup

Signing is not currently active. The SignPath Foundation application was declined because the project does not yet meet its public-trust and visibility threshold. This document retains the prepared trusted-build configuration for a future approved SignPath project or equivalent provider; it is not evidence that a certificate is active.

## Application

- Project: `Context Menu Triage`
- Repository: <https://github.com/mario0318/context-menu-triage>
- License: MIT
- Artifact: per-user Windows x64 NSIS installer (`context-menu-triage-setup.exe`) that contains two PE files — the native app shell `context-menu-triage-app.exe` and the bundled scanner sidecar `context-menu-triage.exe`
- Build system: GitHub Actions on GitHub-hosted Windows runners (Tauri, `npm run app:build`)
- Project slug requested: `context-menu-triage`
- Signing policy slug requested: `release-signing`
- Artifact configuration slug requested: `windows-installer`

The public [code signing policy](CODE_SIGNING_POLICY.md) documents current unsigned-release verification, team roles, privacy, release controls, system changes, and removal.

## SignPath Configuration

After acceptance:

1. Install the SignPath GitHub App for this repository.
2. Configure a GitHub trusted build system for the repository.
3. Configure the artifact as an **NSIS installer** (`context-menu-triage-setup.exe`) with recursive signing: Authenticode-sign the two contained PE files (`context-menu-triage-app.exe` and `context-menu-triage.exe`) first, then sign the installer itself.
4. Enforce `ProductName = Context Menu Triage` and release-version metadata on `context-menu-triage-app.exe`.
5. Restrict release signing to version tags and GitHub-hosted runners.
6. Require one manual approval for every signing request.
7. Create a SignPath API token with submitter permission only.

Set these GitHub repository variables:

- `SIGNPATH_ORGANIZATION_ID`
- `SIGNPATH_PROJECT_SLUG`
- `SIGNPATH_SIGNING_POLICY_SLUG`
- `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`

Set `SIGNPATH_API_TOKEN` as a GitHub Actions secret in the `release` environment. Do not store the token in the repository.

## Release

The release tag must match `package.json` and `src-tauri/tauri.conf.json`, including any prerelease suffix. The workflow builds the native app and installer (`npm run app:build`) and enforces PE metadata on `context-menu-triage-app.exe`. When the `SIGNPATH_*` variables and token are present it uploads the unsigned installer to GitHub Actions, submits its artifact ID to SignPath, waits for manual approval, downloads the signed installer, requires `Get-AuthenticodeSignature` on it to return `Valid`, regenerates the checksum after signing, and publishes the signed installer with its SBOM. When SignPath is not configured it publishes an unsigned interim release with the same assets, titled accordingly.

Unsigned releases must remain explicitly labelled as unsigned. Once a signing provider is provisioned and its signature validation is verified, signed releases become the default and their notes must name the issuer.
