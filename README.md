# Context Menu Triage

A standalone Windows tool for inspecting Explorer context menu handlers, spotting third-party or orphaned entries, and reversibly disabling the ones that clutter or slow right click.

The before state is the usual opaque Explorer menu: shell extensions from cloud sync tools, GPU drivers, archive tools, editors, and stale uninstall leftovers all loaded from the registry with little visibility. The after state is a table of every handler, publisher, signature status, DLL, blocked state, and a reversible switch backed by Windows' official Shell Extensions `Blocked` list.

Registry reads are unelevated. Block, unblock, and snapshot import writes touch HKLM, so those actions require an administrator terminal. Dry run is the default for mutating CLI commands. The Windows 11 classic menu toggle writes only HKCU and does not require administrator rights.

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
node triage.js import snapshot.json
node triage.js import snapshot.json --apply
node triage.js classic-menu status
node triage.js classic-menu on --apply
node triage.js classic-menu off --apply
node triage.js gui
```

The local GUI serves on `http://127.0.0.1:7373/` by default:

```powershell
node triage.js gui --port 7373
```

After applying a block, unblock, import, or classic menu change, restart Explorer for the shell to pick up the change:

```powershell
taskkill /f /im explorer.exe
start explorer
```

## Safety Model

- Registry reads are unelevated.
- Block and unblock use only `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked`.
- Classic menu mode uses only `HKCU\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}`.
- Handler registration keys are never deleted or renamed.
- `HKCR\CLSID` is never modified.
- Applied mutations are appended to `triage-log.json`.
- `known-conflicts.json` starts empty unless entries have real sources. Name-only matches are advisory and unverified.

## Notes

See [BUILD.md](BUILD.md) for the implementation contract, registry references, and acceptance checklist.
