# Changelog

## Unreleased

- The GUI backend now shuts down with whoever launched it instead of lingering: it exits when its parent's stdin closes (native shell or terminal, on a clean exit or a force-kill), and an elevated GUI exits when the process that launched it goes away. This stops orphaned local servers from accumulating and holding their ports.
- A GUI launch on a port that is already in use now fails with a clear message instead of an unhandled crash.

## 1.3.0 - 2026-08-22

- The GUI is now a real native desktop window (Tauri + WebView2) instead of a browser tab, with its own application icon on the window, taskbar, and executable, and no leftover console window.
- New application icon: a cursor triaging a kept (check) and blocked (X) entry; the interface palette is unified to match it.
- The window sizes itself to fit the display and never forces a maximize; the layout stays stable across window sizes, with no clipped controls or horizontal scrollbars.
- Handler rows disable and enable in place with immediate result feedback, and Back up / Restore are now clearly labelled with the automatic pre-change backup surfaced on the first change.
- Ships as a per-user Windows installer.

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
