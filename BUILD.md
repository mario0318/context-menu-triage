# Build Contract

This document describes the maintained behavior of Context Menu Triage. It replaces the original implementation handoff.

## Product Boundary

Context Menu Triage inventories legacy Explorer `IContextMenu` registrations and changes only Windows' Shell Extensions `Blocked` list. It does not inspect the primary Windows 11 `IExplorerCommand` menu, inject into Explorer, trace latency, install a service, or delete registration keys.

## Runtime

- Windows 10/11, x64
- Node.js 20 or newer when running from source
- Windows PowerShell 5.1 for registry and Authenticode calls
- Local HTTP GUI on `127.0.0.1`, with a launch-scoped API token
- Standalone x64 executable built with Node SEA

Every Windows PowerShell child receives a Windows PowerShell-only `PSModulePath`. Inheriting PowerShell 7 module paths can prevent `Microsoft.PowerShell.Security` from loading and silently erase signature data.

## Scanner

Default scope searches all `shellex\ContextMenuHandlers` parents under:

- `HKLM\Software\Classes`, 64-bit and 32-bit views
- `HKCU\Software\Classes`, 64-bit and 32-bit views

`--scope broad` limits the scan to the seven common surfaces documented in the README. CLSIDs are deduplicated while registration provenance is retained. COM lookup is performed in the same hive/view order and records every discovered server.

The additive schema-v2 fields are `registrations`, `comServers`, `clsidRegistered`, `inprocRegistered`, `comState`, and `writableMissingPath`. Legacy snapshot arrays remain readable.

## Classification Invariants

1. Resolve bare DLL names against System32 and SysWOW64 before testing existence.
2. Treat a path under `%SystemRoot%` as Windows unless a valid non-Microsoft signer proves otherwise.
3. Treat a valid Microsoft signature as Windows.
4. `trusted` requires Authenticode `Status = Valid`; a signature blob alone is insufficient.
5. Keep missing CLSID, missing InprocServer32, and missing DLL as distinct states.
6. Include a human-readable `reason` for every classification.

## Mutation Invariants

1. CLI mutations are dry runs unless `--apply` is present.
2. Validate every CLSID before passing it to `reg.exe`.
3. Block and unblock only at `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked`.
4. Classic-menu mode changes only the documented HKCU CLSID key.
5. Never delete or rename handler registration or COM server keys.
6. Never restart Explorer without an explicit request.
7. Require admin for HKLM writes and return a clear 403 from an unelevated GUI.
8. Write an automatic snapshot before every applied block, unblock, or import.
9. Import reconciles only CLSIDs represented by the snapshot.
10. Require the launch token for every GUI API request, including reads.

## Verification

```powershell
npm ci
npm run check
npm test
npm run test:windows
npm run build:exe -- --SkipSign
dist\context-menu-triage.exe --help
dist\context-menu-triage.exe audit --scope broad --format json --output dist\smoke.json
```

Automated verification covers classification fixtures, snapshot compatibility, diff/export formats, filters, live registry provenance, trusted Microsoft examples, executable help, and executable audit. Release-candidate verification must additionally perform one controlled admin block/unblock/import cycle against a disposable third-party handler and confirm Explorer behavior after explicit restarts.

## Release Gate

- CI green on Node 20, 22, and 24
- executable smoke tests green
- release checksum and CycloneDX SBOM produced
- Authenticode signature valid for stable binary releases
- public README states legacy-menu scope and tested Windows builds
- no unsourced conflict record
- controlled live mutation cycle recorded for the release candidate
