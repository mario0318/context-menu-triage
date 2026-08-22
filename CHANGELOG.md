# Changelog

## 1.2.0 - 2026-08-22

- The GUI opens in its own standalone window (Edge or Chrome app mode), not a tab in the default browser, and falls back to a browser tab when no Chromium browser is present.
- The GUI opens with a fast scan of the common right-click surfaces and a Full scan toggle for the exhaustive per-file-type and system view.
- The loading indicator shows elapsed scan time, so a long first scan no longer looks frozen.
- Registry discovery runs the per-hive and per-view scans in parallel, and Authenticode signature results are cached between scans.

## 1.1.0 - 2026-08-12

- Scan HKLM and HKCU in native 64-bit and 32-bit registry views with per-registration provenance.
- Discover per-ProgID and file-association ContextMenuHandlers in the default exhaustive scope.
- Distinguish missing CLSID, missing InprocServer32, missing DLL, and present COM server states.
- Add automatic pre-change snapshots, undo-last, diff, baseline, and JSON/CSV/SARIF audit commands.
- Add a token-guarded local workbench with filters, evidence details, confirmations, and explicit admin relaunch.
- Add persistent System, Light, and Dark GUI themes.
- Add fixture tests, live Windows integration tests, CI, standalone executable packaging, checksums, SBOM, and WinGet manifests.

## 1.0.0 - 2026-08-11

- Initial CLI, reversible block list operations, snapshots, classic-menu mode, and local GUI.
