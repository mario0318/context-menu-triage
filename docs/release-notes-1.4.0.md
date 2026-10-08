# Context Menu Triage 1.4.0

This release adds a load-cost analyzer for tracing a slow right-click menu, plus filtering, sorting, and window and elevation fixes.

Highlights:

- Each handler carries a load-cost rating, colour-coded green to red, built from a timed data-only mapping of its DLL plus signals like a missing registration, a network or removable path, and signature. A registered handler whose DLL is gone rates worst, since Explorer blocks on it; trusted Windows handlers rate lowest and read as safe to leave alone. The worst offenders sort to the top.
- Handlers can be filtered to enabled-only or disabled-only and sorted by load cost, by enabled/disabled, or by name.
- The window opens maximised and stays resizable; at narrower widths the layout tightens in place instead of reflowing its columns.
- "Launch as administrator" now opens an elevated window and closes the unelevated one (or, in the native app, restarts the app elevated), and a cancelled prompt is reported.
- The portable executable no longer leaves a console window behind: its own console is hidden on launch, and the backend exits when the window closes.

The analyzer maps each DLL as a data image and never runs its code, so a scan cannot execute a handler, even when the GUI is elevated.

Windows 11 note: this inventories legacy `IContextMenu` handlers shown under **Show more options** or Shift+F10. It does not enumerate the primary `IExplorerCommand` menu.

Signing note: this is an **unsigned release**. Windows SmartScreen may warn about an unknown publisher. Verify the download against its published `.sha256` checksum before running it; the release also includes a CycloneDX SBOM and GitHub release-asset digest. A future signed release will identify its certificate issuer and include signature-verification instructions.
