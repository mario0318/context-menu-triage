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

do them in this order. do not start the GUI until the CLI surface is reliable.

### 6.0 publisher/trust classification (already fixed in triage.js, preserve it)
the first scaffold misclassified Windows system DLLs (shell32.dll, ntshrui.dll, appresolver.dll)
as UNSIGNED third party, because catalog signed OS files often expose no signer certificate through
`Get-AuthenticodeSignature`. the corrected `triage.js` classifies path first:
- a DLL resolved under `%SystemRoot%` (System32 / SysWOW64 / WinSxS) is Windows/system: hidden by
  default, never suggested for blocking, UNLESS it is validly signed by a non Microsoft party.
- Microsoft is also matched by a Valid Authenticode signature whose signer is Microsoft.
- bare DLL filenames (no path) resolve against System32 then SysWOW64 before the existence check,
  so system handlers are never mislabeled ORPHAN.
- every row carries a `reason` field (system path / ms-signed / signed / no signature / dll missing).

do not regress this. do not switch classification back to signature-only. verify against section 9.

### 6.1 classic menu toggle (CLI, next)
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
Only reconcile CLSIDs present in the snapshot. the HKLM Shell Extensions `Blocked` key can contain
non-context-menu shell extensions managed by Windows or other tools; importing a triage snapshot
must never delete those unrelated values.

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

### 7.2 known-conflicts.json (conservative, source backed)
a curated file shipped alongside `triage.js`. registry enumeration plus this list is the entire
conflict detection strategy. no process analysis. the risk here is fake precision (guessed CLSIDs
that look authoritative), so the rules below are non negotiable.

schema:
```json
[
  {
    "id": "nilesoft-vs-shell-styling-mods",
    "match": "clsid",
    "clsids": ["{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"],
    "names": ["Nilesoft Shell"],
    "severity": "high | medium | low",
    "confidence": "confirmed | reported | suspected",
    "source": "https://github.com/.../issues/1234",
    "note": "human readable description of the conflict"
  }
]
```
rules:
- every entry MUST carry a real `source` (a URL, or `observed:<machine>/<date>` for something the
  author reproduced first hand). no source, no entry.
- NEVER invent or guess a CLSID. if the source does not give you a verifiable CLSID, set
  `"match": "name"`, leave `clsids` empty, and match on name only.
- `match: "clsid"` fires only when 2 or more listed CLSIDs are present and unblocked. this is the
  only definite warning.
- `match: "name"` fires on a handler name/label substring. it is advisory only: render it as
  "possible conflict, unverified," and never auto suggest a block from a name match.
- ship the file with 0 to 2 fully sourced examples, not 10 padded ones. an empty honest file beats
  a full fabricated one. the author grows it from real data.
- the CLI/GUI must display `source` and `confidence` next to every conflict warning.

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
8. Windows system-path DLLs and Microsoft-signed valid handlers are hidden by default and never
   suggested for blocking. classification is path first (see 6.0), not signature only.
9. every `powershell` spawn MUST force a Windows PowerShell only `PSModulePath` in its environment.
   never spawn `powershell` inheriting the parent process env. see gotcha in section 10. this is
   load bearing: without it `Get-AuthenticodeSignature` silently fails to load and all signature
   data is erased with no error. applies to the enumerator, the GUI server, and any batched
   signature pass added later.

---

## 9. acceptance checklist (Friday done means all green)

- [ ] `node triage.js` lists third party handlers, orphans and unsigned on top, Microsoft hidden
- [ ] shell32.dll, ntshrui.dll, appresolver.dll and other System32 handlers classify as Windows/
      system and are hidden by default (never UNSIGNED, never third party)
- [ ] `list --all` shows Microsoft too, `--json` emits the full array including `reason`
- [ ] `block <n>` dry runs, `block <n> --apply` (admin) adds to the Blocked list, verified in regedit
- [ ] `unblock <n> --apply` removes it, right click menu returns to prior state after Explorer restart
- [ ] `classic-menu on --apply` gives the full Win11 classic menu, `off` reverts, no admin needed
- [ ] `export` writes a snapshot; `import <snapshot> --apply` restores the block set idempotently
- [ ] blocking a real handler (e.g. a cloud sync or GPU suite entry) visibly removes its menu item
- [ ] GUI serves on 127.0.0.1, lists handlers, per row disable works, Microsoft hidden by default
- [ ] GUI shows the admin banner when unelevated and blocks apply with a 403, classic toggle still works
- [ ] conflict warnings show source + confidence; clsid matches marked definite, name matches marked unverified; no unsourced entries exist in known-conflicts.json
- [ ] restart Explorer button works and is never triggered automatically
- [ ] Windows Defender and OneDrive classify as Microsoft, signature branch intact (proves the
      Windows PowerShell PSModulePath guard survived any spawn changes, incl. GUI and batched passes)
- [ ] zero runtime npm dependencies (or one justified pure JS dep, documented)
- [ ] README with a before/after framing and the admin requirement stated

---

## 10. known gotchas

- POWERSHELL ENV, READ FIRST. spawning `powershell.exe` (Windows PowerShell 5.1) from Node while
  the parent env carries PowerShell 7's `PSModulePath` makes 5.1 resolve modules against 7's tree,
  fail to load its own bundled `Microsoft.PowerShell.Security`, and therefore never load
  `Get-AuthenticodeSignature`. combined with `$ErrorActionPreference = 'SilentlyContinue'` this fails
  with zero output and every signer comes back null, silently erasing all signature classification.
  fix, already applied: every spawn sets a Windows PowerShell only `PSModulePath` in the child env
  (System32 WindowsPowerShell modules only), e.g. `%SystemRoot%\System32\WindowsPowerShell\v1.0\Modules`.
  this is invisible and load bearing. any new spawn (GUI server, batched signature pass) that omits it
  reintroduces the bug. the only test that catches a regression: confirm Windows Defender and OneDrive
  still classify as Microsoft. add that check whenever you touch spawn logic.
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
