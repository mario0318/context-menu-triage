# Signing Setup

Stable Windows releases use the SignPath Foundation open-source program and SignPath's GitHub trusted-build integration. Signing is not active until the application is accepted and SignPath provisions the project.

## Application

- Project: `Context Menu Triage`
- Repository: <https://github.com/mario0318/context-menu-triage>
- License: MIT
- Artifact: portable Windows x64 PE executable
- Build system: GitHub Actions on GitHub-hosted Windows runners
- Project slug requested: `context-menu-triage`
- Signing policy slug requested: `release-signing`
- Artifact configuration slug requested: `windows-executable`

The public [code signing policy](CODE_SIGNING_POLICY.md) documents team roles, privacy, release controls, system changes, and removal. SignPath acceptance is discretionary; repository preparation does not imply approval.

## SignPath Configuration

After acceptance:

1. Install the SignPath GitHub App for this repository.
2. Configure a GitHub trusted build system for the repository.
3. Configure the artifact as a ZIP containing one `context-menu-triage.exe` PE file with Authenticode signing enabled.
4. Enforce `ProductName = Context Menu Triage` and release-version metadata.
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

The release tag must match `package.json`, including any prerelease suffix. The workflow builds the executable, enforces PE metadata, uploads the unsigned artifact to GitHub Actions, submits its artifact ID to SignPath, waits for manual approval, and downloads the signed result. It then runs the executable, requires `Get-AuthenticodeSignature` to return `Valid`, generates the checksum after signing, and publishes the signed executable with its SBOM.

Unsigned CI artifacts are for testing only and must never be attached to a stable release.
