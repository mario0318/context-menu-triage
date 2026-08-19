# Context Menu Triage 1.1.0

This release turns the original CLI into a provenance-aware Windows inventory and rollback tool.

Highlights:

- exhaustive default discovery across HKLM/HKCU and 64-bit/32-bit registry views
- per-ProgID and file-association handler coverage
- distinct stale COM states and writable missing-path warning
- automatic pre-change snapshots and `undo-last`
- snapshot diff and baseline checks
- JSON, CSV, and SARIF audit output
- token-guarded local GUI with evidence expansion, filters, confirmations, and explicit admin relaunch
- standalone x64 executable, SHA-256 checksum, and CycloneDX SBOM

Windows 11 note: this inventories legacy `IContextMenu` handlers shown under **Show more options** or Shift+F10. It does not enumerate the primary `IExplorerCommand` menu.

Signing note: this is an **unsigned interim release** published while the SignPath Foundation open-source signing application is pending. Windows SmartScreen may warn about an unknown publisher. Verify the download with the published `context-menu-triage.exe.sha256` checksum. A future release will carry a valid Authenticode signature, after which signed releases become the stable default.
