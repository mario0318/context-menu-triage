# Context Menu Triage

A standalone Windows CLI for inspecting Explorer context menu handlers and reversibly blocking noisy, orphaned, or third-party shell extensions.

This tool reads registry state without elevation. Applying block or unblock changes writes to the official Windows Shell Extensions `Blocked` list under HKLM, so those commands must be run from an administrator terminal. Dry run is the default for mutating CLI commands.

## Requirements

- Windows
- Node.js 16 or newer
- PowerShell
- Administrator terminal only when applying HKLM block list changes

## Usage

```powershell
node triage.js
node triage.js list --all
node triage.js list --json
node triage.js block <row-or-clsid>
node triage.js block <row-or-clsid> --apply
node triage.js unblock <row-or-clsid> --apply
node triage.js blocked
node triage.js export snapshot.json
```

After applying a block or unblock, restart Explorer for the shell to pick up the change:

```powershell
taskkill /f /im explorer.exe
start explorer
```

## Safety Model

- Registry reads are unelevated.
- Block and unblock use only `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked`.
- Handler registration keys are never deleted or renamed.
- `HKCR\CLSID` is never modified.
- Applied mutations are appended to `triage-log.json`.

## Build Plan

See [BUILD.md](BUILD.md) for the next implementation steps: classic Windows 11 menu toggle, import/revert snapshots, a local HTTP GUI, and conservative conflict warnings.
