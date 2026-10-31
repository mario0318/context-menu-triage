# Code Signing Policy

Context Menu Triage releases are signed with a public-trust Authenticode certificate from **Azure Trusted Signing** (Azure Artifact Signing), starting with 1.4.2. The certificate subject is Raul Torres, issued by Microsoft ID Verified CS AOC CA 03. The SignPath Foundation application was declined, so that path is retired. See the [signing setup](SIGNING.md).

Every signed release is built from a version tag by the public GitHub Actions workflow, manually approved by the maintainer, timestamped, and verified as a valid Authenticode signature before publication. It also includes a SHA-256 checksum, CycloneDX SBOM, GitHub release-asset digest, and source tag. Releases before 1.4.2 are unsigned and labeled accordingly.

## Team Roles

- Committer and reviewer: [mario0318](https://github.com/mario0318)
- Signing approver: [mario0318](https://github.com/mario0318)

The maintainer uses multi-factor authentication for GitHub. Contributions from anyone without direct commit access require review before merge. Every release-signing request requires manual approval.

## Build Integrity

- Source repository: <https://github.com/mario0318/context-menu-triage>
- Build system: GitHub Actions on GitHub-hosted Windows runners
- Release trigger: a `v*` tag that matches `package.json`
- Current artifact: `context-menu-triage-setup.exe` (Authenticode-signed)
- Required PE product name: `Context Menu Triage`
- Required file and product version: the release version
- Verification: valid Authenticode status, executable smoke test, SHA-256 checksum, GitHub release-asset digest, and CycloneDX SBOM

The release workflow uploads the installer and its verification material to GitHub Releases. It publishes only the installer returned by the signing provider after signature validation.

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. See the [privacy policy](PRIVACY.md).

## System Changes

The program announces changes and defaults mutation commands to dry-run mode. Applied changes are limited to the registry locations documented in the [README safety section](README.md#safety), create rollback evidence, and require explicit confirmation. HKLM changes require administrator rights.

## Removal

Context Menu Triage is portable and does not install a service or background task. Before deleting it, restore any desired handler state with `unblock`, `import`, or `undo-last`. Then close the GUI and delete the executable. Optional local state files are listed in the [privacy policy](PRIVACY.md).
