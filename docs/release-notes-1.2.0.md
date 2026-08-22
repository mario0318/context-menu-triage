# Context Menu Triage 1.2.0

This release makes the GUI feel like a real desktop app and starts up far faster.

Highlights:

- the GUI opens in its own standalone window (Edge or Chrome app mode) instead of a tab in the default browser, falling back to a browser tab when no Chromium browser is present
- scanning defaults to a fast pass over the common right-click surfaces for a near-instant first paint, with a **Full scan** toggle for the exhaustive per-file-type and system view
- the loading indicator shows elapsed scan time, so a long first scan no longer looks frozen
- registry discovery runs the per-hive and per-view scans in parallel, and Authenticode signature results are cached between scans; scan output is unchanged

Windows 11 note: this inventories legacy `IContextMenu` handlers shown under **Show more options** or Shift+F10. It does not enumerate the primary `IExplorerCommand` menu.

Signing note: this is an **unsigned interim release** published while the SignPath Foundation open-source signing application is pending. Windows SmartScreen may warn about an unknown publisher. Verify the download with the published `context-menu-triage.exe.sha256` checksum. A future release will carry a valid Authenticode signature, after which signed releases become the stable default.
