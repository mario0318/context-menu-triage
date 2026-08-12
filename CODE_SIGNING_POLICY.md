# Code Signing Policy

Context Menu Triage is applying for the SignPath Foundation open-source code-signing program. After acceptance, stable Windows release binaries will use **Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/)**.

Unsigned development artifacts are labeled as such and are not stable releases. A stable release must be built from a version tag by the public GitHub Actions workflow, submitted to SignPath from that workflow, manually approved, timestamped, and verified as a valid Authenticode signature before GitHub publishes it.

## Team Roles

- Committer and reviewer: [mario0318](https://github.com/mario0318)
- Signing approver: [mario0318](https://github.com/mario0318)

The maintainer uses multi-factor authentication for GitHub and SignPath. Contributions from anyone without direct commit access require review before merge. Every release signing request requires manual approval.

## Build Integrity

- Source repository: <https://github.com/mario0318/context-menu-triage>
- Build system: GitHub Actions on GitHub-hosted Windows runners
- Release trigger: a `v*` tag that matches `package.json`
- Signed artifact: `context-menu-triage.exe`
- Required PE product name: `Context Menu Triage`
- Required file and product version: the release version
- Verification: valid Authenticode status, executable smoke test, SHA-256 checksum, and CycloneDX SBOM

The release workflow uploads the unsigned executable as a GitHub Actions artifact before requesting a signature. It publishes only the executable returned by SignPath.

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. See the [privacy policy](PRIVACY.md).

## System Changes

The program announces changes and defaults mutation commands to dry-run mode. Applied changes are limited to the registry locations documented in the [README safety section](README.md#safety), create rollback evidence, and require explicit confirmation. HKLM changes require administrator rights.

## Removal

Context Menu Triage is portable and does not install a service or background task. Before deleting it, restore any desired handler state with `unblock`, `import`, or `undo-last`. Then close the GUI and delete the executable. Optional local state files are listed in the [privacy policy](PRIVACY.md).
