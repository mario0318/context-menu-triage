# Context Menu Triage 1.3.0

This release turns the interface into a proper native Windows application.

Highlights:

- **Native desktop window** (Tauri + WebView2) instead of a browser tab — its own application icon on the window, taskbar, and executable, and no leftover console window.
- **New application icon** — a cursor triaging a kept (check) and a blocked (X) entry — with the interface palette unified to match it.
- **Fits your display** — the window sizes itself to the monitor and never forces a maximize; the layout stays stable across sizes, with no clipped controls or horizontal scrollbars.
- **In-place handler actions** — disable and enable act immediately with result feedback, no confirmation dialog.
- **Backups made visible** — Back up / Restore are clearly labelled, and the automatic pre-change snapshot is reported on the first change so reversibility is obvious.

Install: download and run the installer below (`context-menu-triage-setup.exe`). It installs per-user; no administrator rights are needed to install. Disabling, enabling, and importing handlers still request administrator rights at the moment they are used.

Windows 11 note: this inventories legacy `IContextMenu` handlers shown under **Show more options** or Shift+F10. It does not enumerate the primary `IExplorerCommand` menu.

Signing note: this is an **unsigned interim release** published while the SignPath Foundation open-source signing application is pending. Windows SmartScreen may warn about an unknown publisher until Authenticode signing is active. Verify the download against its published `.sha256` checksum. A future release will carry a valid Authenticode signature.
