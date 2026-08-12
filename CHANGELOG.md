# Changelog

## 1.1.0 - 2026-08-12

- Scan HKLM and HKCU in native 64-bit and 32-bit registry views with per-registration provenance.
- Discover per-ProgID and file-association ContextMenuHandlers in the default exhaustive scope.
- Distinguish missing CLSID, missing InprocServer32, missing DLL, and present COM server states.
- Add automatic pre-change snapshots, undo-last, diff, baseline, and JSON/CSV/SARIF audit commands.
- Add a token-guarded local workbench with filters, evidence details, confirmations, and explicit admin relaunch.
- Add fixture tests, live Windows integration tests, CI, standalone executable packaging, checksums, SBOM, and WinGet manifests.

## 1.0.0 - 2026-08-11

- Initial CLI, reversible block list operations, snapshots, classic-menu mode, and local GUI.
