# Context Menu Triage 1.4.2

The first signed release. There are no functional changes from 1.4.1 — this release exists to ship a signed installer.

- The installer is now Authenticode-signed with a public-trust certificate from Azure Trusted Signing. Windows SmartScreen now shows a verified publisher instead of warning about an unknown one.

Windows 11 note: this inventories legacy `IContextMenu` handlers shown under **Show more options** or Shift+F10. It does not enumerate the primary `IExplorerCommand` menu.

Verify the download against its published `.sha256` checksum, or by checking the installer's digital signature in its file properties. A CycloneDX SBOM and the GitHub release-asset digest are included.
