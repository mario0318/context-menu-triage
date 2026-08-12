# BUILD.md ... context menu triage

handoff spec for an agentic CLI (Codex / Gemini CLI). extend the existing `triage.js`
scaffold into a shippable tool by end of week. read this whole file before writing code.
follow the invariants in section 8 without exception.

---

## 1. mission

one standalone Windows tool that lets a user see every Explorer context menu handler on
their machine, identify the third party and orphaned ones slowing or cluttering the right
click menu, and disable them reversibly. no injection, no drivers, no background service.
this is the wedge, not a platform. scope discipline is the point.

target: working CLI + local HTTP GUI, running on the author's machine, by Friday.

---

## 2. current state (already built)

`triage.js` exists and works. it is the technical spine. do not rewrite it, extend it.

it already does:
- enumerates context menu handlers across the standard HKCR surfaces via PowerShell
  (passed as an EncodedCommand so quoting cannot break)
- resolves each CLSID to DLL path, friendly name, publisher, and Authenticode status
- flags third party vs Microsoft, and orphaned (DLL missing) handlers
- dry run by default; `--apply` commits
- block / unblock via the official Blocked list, reversible by deletion
- writes a tmp cache so `block <rownumber>` works, and appends to `triage-log.json`
- `list`, `list --all`, `list --json`, `block`, `unblock`, `blocked`, `export`

commands to know:
```
node triage.js                 list third party handlers
node triage.js list --all      include Microsoft
node triage.js block <n|clsid> dry run (add --apply, admin terminal)
node triage.js unblock <n|clsid> [--apply]
node triage.js blocked
node triage.js export <file>
```

your job is sections 6.1 through 6.3 (classic menu toggle, import/revert, GUI), plus the
conflict database and the acceptance checklist. everything else already exists.

---

## 3. hard non-goals (do NOT build these)

the source research kept drifting toward these. they are out of scope for this tool, permanently
for some, this week for the rest. if you find yourself building any of them, stop.

- no code injection into `explorer.exe` or any process. no hooks, no detours, no DLL injection.
- no ETW consumers, no `Microsoft-Windows-Explorer` provider parsing, no latency tracing.
  registry enumeration is the diagnostic. do not add ETW.
- no sandboxed / suspended `explorer.exe`, no IAT/EAT scanning, no process hollowing.
  conflict detection is registry enumeration plus the curated JSON in section 7.2.
- no kernel drivers, no WHQL, no signed system service. ever, for this tool.
- no declarative policy / YAML engine, no work modes, no notification digest, no network
  watchdog. those are future modules, not this week.
- no Windhawk wrapping or dependency. this tool is standalone.
- do not add npm dependencies unless section 4 explicitly allows one. keep it zero dep if possible.

---

## 4. architecture

Node plus a local HTTP GUI, single process, launched from the terminal. this mirrors the
author's existing `rename-ui.js` pattern deliberately. do not introduce Electron, a bundler,
or a framework.

- language: JavaScript (Node 16+), CommonJS, matching `triage.js`.
- GUI: one self contained HTML page (HTML + CSS + JS inline in a single string) served by a
  Node `http` server. no build step, no external assets, no CDN.
- registry access: keep the PowerShell EncodedCommand pattern for reads; use `reg.exe` via
  `execFileSync` with argument arrays for writes. no registry npm packages.
- zero dependencies is the target. if one proves unavoidable, it must be a single small pure
  JS package with no native build, and you must justify it in a comment.

reads are unelevated. writes to the Blocked list are HKLM and need admin. the classic menu
toggle is HKCU and needs no admin. handle this split explicitly (section 6, section 8).

---

## 5. registry reference (verified, use exactly these)

### 5.1 handler enumeration surfaces
already enumerated by the scaffold. the parent keys, each holding one subkey per handler whose
default value (or subkey name) is the handler CLSID:
```
HKCR\*\shellex\ContextMenuHandlers
HKCR\AllFilesystemObjects\shellex\ContextMenuHandlers
HKCR\Directory\shellex\ContextMenuHandlers
HKCR\Directory\Background\shellex\ContextMenuHandlers
HKCR\Drive\shellex\ContextMenuHandlers
HKCR\Folder\shellex\ContextMenuHandlers
HKCR\LibraryFolder\shellex\ContextMenuHandlers
```
CLSID resolves to DLL under `HKCR\CLSID\{guid}\InprocServer32` (default value), also check
`HKCR\WOW6432Node\CLSID\{guid}\InprocServer32` for 32 bit handlers on 64 bit Windows.
HKCR is a merged view of HKLM and HKCU classes, fine for reads.

### 5.2 disable mechanism (the block list) ... reversible, this is the only disable method
```
key:   HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked
block:   reg add    "<key>" /v {CLSID} /t REG_SZ /d "<name for reference>" /f
unblock: reg delete "<key>" /v {CLSID} /f
```
the shell refuses to load any CLSID listed here. block is a single value add, unblock is a
single value delete. this NEVER touches the handler's own registration, so it is fully
reversible and safe. requires admin (HKLM). the key may not exist by default; `reg add`
creates it.

do not disable handlers by any other method. do not delete or rename the handler keys
themselves. do not delete anything under `HKCR\CLSID`.

### 5.3 Win11 classic context menu toggle ... HKCU, no admin
Windows 11 shows a streamlined menu (IExplorerCommand handlers only); legacy IContextMenu
handlers appear under "show more options". forcing the classic full menu is a one key trick:
```
enable classic:  reg add    "HKCU\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\InprocServer32" /ve /d "" /f
revert to Win11: reg delete "HKCU\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}" /f
```
the empty default value on InprocServer32 is required (not an absent value). HKCU, so no
elevation. Explorer restart required to take effect.

### 5.4 applying changes
any block, unblock, or classic toggle needs an Explorer restart:
```
taskkill /f /im explorer.exe & start explorer
```
the GUI must offer a "restart Explorer" action. never restart Explorer without the user asking.

---

## 6. build tasks

### 6.1 classic menu toggle (CLI first, wed)
add two CLI subcommands using section 5.3, dry run default, `--apply` to commit. no admin
needed. add a `--restart-explorer` flag that runs section 5.4 after apply.
```
node triage.js classic-menu on  [--apply] [--restart-explorer]
node triage.js classic-menu off [--apply] [--restart-explorer]
node triage.js classic-menu status
```
`status` reads whether the `{86ca1aa0...}\InprocServer32` key exists.

### 6.2 import / revert a snapshot (wed)
`export` already writes a full state snapshot. add `import`:
```
node triage.js import <snapshot.json> [--apply]
```
behavior: read the snapshot, compute the diff against current live state (which CLSIDs were
blocked in the snapshot but not now, and vice versa), print the plan, and on `--apply` bring
the block list to match the snapshot's `blocked` flags. dry run prints every add/delete it
would run. this is the one file rollback. it must be idempotent (re-running changes nothing).

### 6.3 local HTTP GUI (thu)
a single Node `http` server that serves one self contained HTML page and a small JSON API.
reuse the `rename-ui.js` shape. bind to `127.0.0.1` on a fixed port (default 7373, override
with `--port`). open the browser automatically on start (optional, `start http://...`).

API contract (all JSON):
```
GET  /api/handlers            -> array of handler objects (section 7.1), the enumerate() output
GET  /api/blocked             -> array of blocked CLSIDs
GET  /api/classic-menu        -> { enabled: bool }
GET  /api/admin               -> { admin: bool }   (net session check)
GET  /api/conflicts           -> computed conflicts (section 7.2)
POST /api/block               -> { clsid, name }   applies immediately (admin required)
POST /api/unblock             -> { clsid }
POST /api/classic-menu        -> { enabled: bool }
POST /api/export              -> { file }           writes snapshot, returns path
POST /api/import              -> { file }           applies snapshot diff
POST /api/restart-explorer    -> restarts Explorer
```
write endpoints that need admin must return HTTP 403 with `{ error, needsAdmin: true }` when
the server is not elevated. the page shows a persistent banner in that case telling the user
to relaunch the terminal as administrator. the classic menu toggle does NOT need admin, keep
it usable even in the non admin state.

the page must:
- render the handler table with columns: publisher, signature status, blocked state, name, DLL basename
- default to hiding Microsoft handlers, with a "show all" toggle
- sort orphans and unsigned to the top
- per row enable/disable control, wired to /api/block and /api/unblock
- surface conflict warnings (section 7.2) inline on the affected rows
- a big obvious classic-vs-Win11 menu toggle
- export and import buttons
- a "restart Explorer to apply" button, shown after any change
- degrade gracefully: if not admin, browsing still works, apply is blocked with the banner

no telemetry, no network calls off localhost, no analytics. everything stays on the machine.

---

## 7. data

### 7.1 handler object (already produced by triage.js, do not change the shape)
```json
{
  "clsid": "{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}",
  "label": "subkey name as found",
  "name": "friendly CLSID name or null",
  "dll": "C:\\path\\to\\handler.dll or null",
  "exists": true,
  "sigStatus": "Valid | NotSigned | HashMismatch | None | ...",
  "signer": "CN=... full cert subject or null",
  "surfaces": ["Directory", "Directory\\Background", "*"],
  "blocked": false,
  "isMs": false,
  "trusted": false,
  "pub": "Microsoft | <vendor CN> | UNSIGNED | ORPHAN",
  "thirdParty": true,
  "orphan": false
}
```

### 7.2 known-conflicts.json (you create and seed this)
a curated file shipped alongside `triage.js`. this is the entire conflict detection strategy.
no process analysis, just this list.
```json
[
  {
    "clsids": ["{...}", "{...}"],
    "names": ["Nilesoft Shell", "some Windhawk shell mod"],
    "severity": "high | medium | low",
    "note": "both replace the shell context menu host; icon overlays break"
  }
]
```
match logic: a conflict fires when 2 or more CLSIDs from one entry are present and not blocked.
seed it with at least 10 real entries mined from GitHub issues (search: Windhawk + Nilesoft
conflicts, Explorer context menu handler conflicts, known slow handlers from GPU/cloud suites).
where you cannot confirm a CLSID, record the handler name and leave the CLSID array partial
with a `"note"` flagging it as name matched only. never invent a CLSID.

---

## 8. safety invariants (never violate)

1. dry run is the default for every mutating command. nothing writes without `--apply`
   (CLI) or an explicit POST from the GUI.
2. every change is reversible by design. block via the Blocked list only. classic menu via the
   HKCU key only. never delete or rename handler keys, never delete under HKCR\CLSID.
3. validate every CLSID against `^\{[0-9A-Fa-f-]{36}\}$` before it reaches `reg.exe`.
4. writes to HKLM require admin. detect elevation (`net session`) and refuse clearly if absent.
   never silently fail a write. never attempt to self elevate without telling the user.
5. never restart Explorer unless the user explicitly asks (CLI flag or GUI button).
6. no network egress except the localhost HTTP server. no npm installs at runtime.
7. append every applied mutation to `triage-log.json`. the export snapshot is the rollback of
   record; keep it accurate.
8. Microsoft signed valid handlers are shown but never suggested for blocking by default.

---

## 9. acceptance checklist (Friday done means all green)

- [ ] `node triage.js` lists third party handlers, orphans and unsigned on top, Microsoft hidden
- [ ] `list --all` shows Microsoft too, `--json` emits the full array
- [ ] `block <n>` dry runs, `block <n> --apply` (admin) adds to the Blocked list, verified in regedit
- [ ] `unblock <n> --apply` removes it, right click menu returns to prior state after Explorer restart
- [ ] `classic-menu on --apply` gives the full Win11 classic menu, `off` reverts, no admin needed
- [ ] `export` writes a snapshot; `import <snapshot> --apply` restores the block set idempotently
- [ ] blocking a real handler (e.g. a cloud sync or GPU suite entry) visibly removes its menu item
- [ ] GUI serves on 127.0.0.1, lists handlers, per row disable works, Microsoft hidden by default
- [ ] GUI shows the admin banner when unelevated and blocks apply with a 403, classic toggle still works
- [ ] conflict warnings render on affected rows from known-conflicts.json (seed a test conflict to prove it)
- [ ] restart Explorer button works and is never triggered automatically
- [ ] zero runtime npm dependencies (or one justified pure JS dep, documented)
- [ ] README with a before/after framing and the admin requirement stated

---

## 10. known gotchas

- `Get-AuthenticodeSignature` runs once per handler. on machines with 100+ handlers the first
  enumerate can take a few seconds. if it drags, batch the signature checks in one PowerShell
  pass rather than resolving per CLSID. do not switch strategies unless it actually drags.
- Windows 11 has two menus. legacy handlers only show under "show more options" unless classic
  mode is on. when testing a block, test against the classic menu or enable classic mode first.
- 32 bit handlers live under `WOW6432Node\CLSID`. the scaffold checks both; keep that.
- the Blocked key may not preexist. `reg add` creates it. do not assume it is there for `reg query`.
- a handler can appear under several surfaces (same CLSID). dedupe by CLSID, merge `surfaces`.
  the scaffold already does this; preserve it.
- HKCR writes are ambiguous (merged view). always write the classic toggle to HKCU explicitly
  and the block list to HKLM explicitly, never to HKCR.
- do not trust handler `name` for identity, it is cosmetic. CLSID is the only stable key.
