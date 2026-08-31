# Code Signing Policy

Context Menu Triage does not currently have an Authenticode signing certificate. The SignPath Foundation application was declined because the project has not yet established the public adoption and independent visibility required by that program. The project may reapply when those signals exist, or use another trusted signing provider in the future.

Current releases are unsigned and labeled accordingly. They are built from version tags by the public GitHub Actions workflow and include a SHA-256 checksum, CycloneDX SBOM, GitHub release-asset digest, and source tag. Users should verify the checksum before running an installer.

If signing is configured later, a release must be built from a version tag by the public GitHub Actions workflow, manually approved by the maintainer, timestamped, and verified as a valid Authenticode signature before publication. Its release notes will identify the certificate issuer and signing path.

## Team Roles

- Committer and reviewer: [mario0318](https://github.com/mario0318)
- Signing approver: [mario0318](https://github.com/mario0318)

The maintainer uses multi-factor authentication for GitHub. Contributions from anyone without direct commit access require review before merge. Every future release-signing request requires manual approval.

## Build Integrity

- Source repository: <https://github.com/mario0318/context-menu-triage>
- Build system: GitHub Actions on GitHub-hosted Windows runners
- Release trigger: a `v*` tag that matches `package.json`
- Current artifact: `context-menu-triage-setup.exe` (unsigned)
- Required PE product name: `Context Menu Triage`
- Required file and product version: the release version
- Current verification: executable smoke test, SHA-256 checksum, GitHub release-asset digest, and CycloneDX SBOM
- Future signed-release verification: valid Authenticode status, executable smoke test, SHA-256 checksum, and CycloneDX SBOM

The release workflow uploads the installer and its verification material to GitHub Releases. If signing is configured, it must publish only the installer returned by the signing provider after signature validation.

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. See the [privacy policy](PRIVACY.md).

## System Changes

The program announces changes and defaults mutation commands to dry-run mode. Applied changes are limited to the registry locations documented in the [README safety section](README.md#safety), create rollback evidence, and require explicit confirmation. HKLM changes require administrator rights.

## Removal

Context Menu Triage is portable and does not install a service or background task. Before deleting it, restore any desired handler state with `unblock`, `import`, or `undo-last`. Then close the GUI and delete the executable. Optional local state files are listed in the [privacy policy](PRIVACY.md).
