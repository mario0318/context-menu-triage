#!/usr/bin/env node
/*
 * Context Menu Triage
 *
 * enumerates Windows Explorer context menu handlers, resolves each CLSID to its
 * DLL / publisher / Authenticode status, flags third-party and orphaned handlers,
 * and disables them reversibly via the official shell block list:
 *   HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked
 *
 * reads work unelevated. writes (--apply) need admin. dry run is the default.
 *
 * usage:
 *   node triage.js                 list third-party handlers (the useful view)
 *   node triage.js list --all      include Microsoft handlers too
 *   node triage.js list --json     raw json to stdout
 *   node triage.js block <n|clsid> dry run a block (add --apply to commit)
 *   node triage.js unblock <n|clsid> [--apply]
 *   node triage.js blocked              show what is currently blocked
 *   node triage.js export <file>        snapshot full state to json (your rollback file)
 *   node triage.js import <file>        dry run restore block list from snapshot
 *   node triage.js undo-last            dry run the last automatic rollback snapshot
 *   node triage.js audit --format json|csv|sarif [--output file]
 *   node triage.js diff <before> <after>
 *   node triage.js baseline create|check <file>
 *   node triage.js classic-menu status  show Win11/classic context menu mode
 *   node triage.js classic-menu on      dry run classic menu toggle (add --apply)
 *   node triage.js classic-menu off     dry run Win11 menu toggle (add --apply)
 *   node triage.js gui                  serve local HTTP GUI on 127.0.0.1:7373
 *
 * Windows + Node 20+ only. Run as admin only when applying HKLM writes.
 */

'use strict';
const { execFileSync, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { URL } = require('url');
const renderGui = require('./lib/gui');
const {
  GUID_RE,
  blockPlan,
  clsidOrThrow,
  cook,
  diffHandlers,
  filterRows,
  handlersToCsv,
  handlersToSarif,
  snapshotDocument,
  snapshotHandlers,
  sortRows,
} = require('./lib/core');

const BLOCKED_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Shell Extensions\\Blocked';
const CLASSIC_ROOT = 'HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}';
const CLASSIC_INPROC = CLASSIC_ROOT + '\\InprocServer32';
const CACHE = path.join(os.tmpdir(), 'triage-cache.json');
const LOG = path.join(process.cwd(), 'triage-log.json');
const CONFLICTS = path.join(__dirname, 'known-conflicts.json');
const LAST_CHANGE = path.join(os.homedir(), '.context-menu-triage-last-change.json');
const VERSION = require('./package.json').version;
const HELP = `usage:
  context-menu-triage                       open the GUI (standalone executable)
  node triage.js                            list third-party handlers
  context-menu-triage list [--all] [--json] [--scope all|broad]
  context-menu-triage block <n|clsid> [--apply] [--restart-explorer]
  context-menu-triage unblock <n|clsid> [--apply] [--restart-explorer]
  context-menu-triage blocked
  context-menu-triage export <file> [--scope all|broad]
  context-menu-triage import <file> [--apply]
  context-menu-triage undo-last [--apply]
  context-menu-triage audit --format json|csv|sarif [--output file] [--fail-on level]
  context-menu-triage diff <before> <after> [--json]
  context-menu-triage baseline create|check <file>
  context-menu-triage classic-menu status|on|off [--apply]
  context-menu-triage conflicts [--scope all|broad]
  context-menu-triage gui [--elevate] [--port 7373] [--scope all|broad]

reads work unelevated. registry writes require an administrator terminal.
default scope is all registered legacy ContextMenuHandlers; broad scans seven common surfaces.`;

const NOCOLOR = process.argv.includes('--no-color') || !process.stdout.isTTY;
const c = (code, s) => (NOCOLOR ? s : `\x1b[${code}m${s}\x1b[0m`);
const dim = s => c('2', s), red = s => c('31', s), grn = s => c('32', s),
      ylw = s => c('33', s), cyn = s => c('36', s), bold = s => c('1', s);

// --- powershell enumeration (encoded to dodge all quoting) --------------------
const PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
# Authenticode verification is the slowest part of a scan (online cert/revocation
# checks per DLL). Cache results on disk keyed by path+size+mtime so unchanged
# DLLs are verified once, and dedupe repeats within a single run.
$SigCachePath = Join-Path $env:TEMP 'triage-sigcache.json'
$SigCache = @{}
if (Test-Path -LiteralPath $SigCachePath) {
  try {
    $loaded = Get-Content -LiteralPath $SigCachePath -Raw | ConvertFrom-Json
    foreach ($p in $loaded.PSObject.Properties) { $SigCache[$p.Name] = $p.Value }
  } catch { $SigCache = @{} }
}
$SigDirty = $false
function Get-CachedSignature($dll) {
  $item = Get-Item -LiteralPath $dll -ErrorAction SilentlyContinue
  if (-not $item) { return $null }
  $key = $dll.ToLowerInvariant() + '|' + $item.Length + '|' + $item.LastWriteTimeUtc.Ticks
  if ($SigCache.ContainsKey($key)) { return $SigCache[$key] }
  $sig = Get-AuthenticodeSignature -LiteralPath $dll -ErrorAction SilentlyContinue
  $status = 'None'; $signer = $null
  if ($null -ne $sig) {
    $status = $sig.Status.ToString()
    if ($null -ne $sig.SignerCertificate) { $signer = $sig.SignerCertificate.Subject }
  }
  $entry = [pscustomobject]@{ status = $status; signer = $signer }
  $SigCache[$key] = $entry
  $script:SigDirty = $true
  return $entry
}
function Open-Key($hive, $subkey, $view) {
  $h = if ($hive -eq 'HKCU') {
    [Microsoft.Win32.RegistryHive]::CurrentUser
  } else {
    [Microsoft.Win32.RegistryHive]::LocalMachine
  }
  $v = if ($view -eq '32') {
    [Microsoft.Win32.RegistryView]::Registry32
  } else {
    [Microsoft.Win32.RegistryView]::Registry64
  }
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($h, $v)
  try { return $base.OpenSubKey($subkey) } finally { $base.Dispose() }
}
function Resolve-Clsid($clsid, $view) {
  foreach ($hive in @('HKCU', 'HKLM')) {
    $subkey = "Software\Classes\CLSID\$clsid"
    $ck = Open-Key $hive $subkey $view
    if (-not $ck) { continue }
    try {
      $name = $ck.GetValue('')
      $ip = $ck.OpenSubKey('InprocServer32')
      $dll = $null
      if ($ip) { try { $dll = $ip.GetValue('') } finally { $ip.Dispose() } }
      return [pscustomobject]@{
        hive = $hive; view = $view; key = "$hive\$subkey"
        clsidRegistered = $true; inprocRegistered = ($null -ne $ip)
        name = $name; dll = $dll
      }
    } finally { $ck.Dispose() }
  }
  return $null
}
function Expand-Dll($dll, $view) {
  if (-not $dll) { return $null }
  $expanded = [Environment]::ExpandEnvironmentVariables(('' + $dll)).Trim().Trim('"')
  if ($expanded -and -not ($expanded -match '[\\/]')) {
    $bases = if ($view -eq '32') {
      @(($env:SystemRoot + '\SysWOW64'), ($env:SystemRoot + '\System32'))
    } else {
      @(($env:SystemRoot + '\System32'), ($env:SystemRoot + '\SysWOW64'))
    }
    foreach ($base in $bases) {
      $candidate = Join-Path $base $expanded
      if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
  }
  return $expanded
}
function Test-ParentWritable($dll) {
  if (-not $dll) { return $false }
  $directory = Split-Path -Parent $dll
  if (-not $directory -or -not (Test-Path -LiteralPath $directory -PathType Container)) { return $false }
  $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  $identities = @($principal.Identity.Name)
  $identities += @($principal.Identity.Groups | ForEach-Object {
    try { $_.Translate([Security.Principal.NTAccount]).Value } catch { $null }
  })
  $allow = $false; $deny = $false
  $writeRights = [Security.AccessControl.FileSystemRights]'Write,CreateFiles,Modify,FullControl'
  foreach ($rule in (Get-Acl -LiteralPath $directory).Access) {
    if ($identities -notcontains $rule.IdentityReference.Value) { continue }
    if (($rule.FileSystemRights -band $writeRights) -eq 0) { continue }
    if ($rule.AccessControlType -eq 'Deny') { $deny = $true } else { $allow = $true }
  }
  return ($allow -and -not $deny)
}
# Discovering handler parent keys (scope 'all') runs a recursive reg.exe query
# over the whole Software\Classes tree, which is ~12s per hive/view. The four
# combinations are independent, so run them in parallel via a runspace pool. The
# query and filter are byte-for-byte identical to the former serial version.
$ParentPathScript = {
  param($hive, $view, $scope)
  $prefix = if ($hive -eq 'HKCU') { 'HKEY_CURRENT_USER' } else { 'HKEY_LOCAL_MACHINE' }
  if ($scope -eq 'broad') {
    return @(
      '*\shellex\ContextMenuHandlers',
      'AllFilesystemObjects\shellex\ContextMenuHandlers',
      'Directory\shellex\ContextMenuHandlers',
      'Directory\Background\shellex\ContextMenuHandlers',
      'Drive\shellex\ContextMenuHandlers',
      'Folder\shellex\ContextMenuHandlers',
      'LibraryFolder\shellex\ContextMenuHandlers'
    ) | ForEach-Object { "$prefix\Software\Classes\$_" }
  }
  $output = & reg.exe query "$hive\Software\Classes" /f ContextMenuHandlers /k /s "/reg:$view" 2>$null
  return @($output | ForEach-Object { ('' + $_).Trim() } | Where-Object {
    $_ -match '^HKEY_(LOCAL_MACHINE|CURRENT_USER)\\.+\\shellex\\ContextMenuHandlers$'
    -and $_ -notmatch '(?i)\\Software\\Classes\\WOW6432Node\\'
  })
}
function Get-AllParentPaths($scope) {
  $combos = @()
  foreach ($v in @('64', '32')) { foreach ($h in @('HKLM', 'HKCU')) { $combos += , @($h, $v) } }
  $paths = @{}
  $pool = [runspacefactory]::CreateRunspacePool(1, 4)
  $pool.Open()
  try {
    $jobs = @()
    foreach ($combo in $combos) {
      $psi = [powershell]::Create()
      $psi.RunspacePool = $pool
      [void]$psi.AddScript($ParentPathScript).AddArgument($combo[0]).AddArgument($combo[1]).AddArgument($scope)
      $jobs += [pscustomobject]@{ ps = $psi; handle = $psi.BeginInvoke(); hive = $combo[0]; view = $combo[1] }
    }
    foreach ($job in $jobs) {
      $paths["$($job.hive)|$($job.view)"] = @($job.ps.EndInvoke($job.handle))
      $job.ps.Dispose()
    }
  } finally { $pool.Close(); $pool.Dispose() }
  return $paths
}
$blocked = @{}
$bk = Get-Item -LiteralPath ('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked') -ErrorAction SilentlyContinue
if ($bk) { foreach ($n in $bk.GetValueNames()) { if ($n) { $blocked[$n.ToUpper()] = $true } } }
$guid = '^\{[0-9A-Fa-f-]{36}\}$'
$parentPaths = Get-AllParentPaths $TriageScope
$map = @{}
foreach ($view in @('64', '32')) {
  foreach ($hive in @('HKLM', 'HKCU')) {
    $prefix = if ($hive -eq 'HKCU') { 'HKEY_CURRENT_USER\' } else { 'HKEY_LOCAL_MACHINE\' }
    foreach ($parentPath in $parentPaths["$hive|$view"]) {
      $subkey = $parentPath.Substring($prefix.Length)
      $parent = Open-Key $hive $subkey $view
      if (-not $parent) { continue }
      try {
        $handlers = @()
        $parentDefault = '' + $parent.GetValue('')
        if ($parentDefault -match $guid) {
          $handlers += [pscustomobject]@{ label = Split-Path $subkey -Leaf; clsid = $parentDefault }
        }
        foreach ($childName in $parent.GetSubKeyNames()) {
          $child = $parent.OpenSubKey($childName)
          if (-not $child) { continue }
          try { $def = '' + $child.GetValue('') } finally { $child.Dispose() }
          $clsid = if ($def -match $guid) { $def } elseif ($childName -match $guid) { $childName } else { $null }
          if ($clsid) { $handlers += [pscustomobject]@{ label = $childName; clsid = $clsid } }
        }
        foreach ($handler in $handlers) {
          $clsid = $handler.clsid.ToUpper()
          $classesParent = $subkey.Substring('Software\Classes\'.Length)
          $surface = [regex]::Replace($classesParent, '(?i)\\shellex\\ContextMenuHandlers$', '')
          $registration = [pscustomobject]@{
            hive = $hive; view = $view; parent = $surface
            key = "$hive\$subkey\$($handler.label)"; label = $handler.label
          }
          if (-not $map.ContainsKey($clsid)) {
            $map[$clsid] = [pscustomobject]@{ clsid = $clsid; registrations = [Collections.ArrayList]@() }
          }
          [void]$map[$clsid].registrations.Add($registration)
        }
      } finally { $parent.Dispose() }
    }
  }
}
$results = @(foreach ($entry in @($map.Values)) {
  $servers = [Collections.ArrayList]@()
  foreach ($view in @('64', '32')) {
    $server = Resolve-Clsid $entry.clsid $view
    if (-not $server) { continue }
    $server.dll = Expand-Dll $server.dll $view
    [void]$servers.Add($server)
  }
  $primary = @($servers | Where-Object dll | Select-Object -First 1)
  if (-not $primary) { $primary = @($servers | Select-Object -First 1) }
  $primary = $primary | Select-Object -First 1
  $dll = if ($primary) { $primary.dll } else { $null }
  $exists = [bool]($dll -and (Test-Path -LiteralPath $dll))
  $status = 'None'; $signer = $null; $underWin = $false
  if ($dll) {
    $wr = ('' + $env:SystemRoot).TrimEnd('\').ToLowerInvariant() + '\'
    $underWin = $dll.ToLowerInvariant().StartsWith($wr)
    if ($exists) {
      $cachedSig = Get-CachedSignature $dll
      if ($null -ne $cachedSig) {
        $status = $cachedSig.status
        $signer = $cachedSig.signer
      }
    }
  }
  $labels = @($entry.registrations | ForEach-Object label | Sort-Object -Unique)
  $surfaces = @($entry.registrations | ForEach-Object parent | Sort-Object -Unique)
  $clsidRegistered = @($servers).Count -gt 0
  $inprocRegistered = [bool]($primary -and $primary.inprocRegistered)
  $writableMissingPath = [bool]($dll -and -not $exists -and (Test-ParentWritable $dll))
  [pscustomobject]@{
    clsid = $entry.clsid; label = ($labels -join '; '); name = if ($primary) { $primary.name } else { $null }
    dll = $dll; exists = $exists; sigStatus = $status; signer = $signer; underWindows = $underWin
    surfaces = $surfaces; registrations = @($entry.registrations); comServers = @($servers)
    clsidRegistered = $clsidRegistered; inprocRegistered = $inprocRegistered
    writableMissingPath = $writableMissingPath
    blocked = [bool]$blocked[$entry.clsid]
  }
})
if ($SigDirty) {
  try { $SigCache | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $SigCachePath -Encoding UTF8 } catch {}
}
$results | ConvertTo-Json -Depth 8
`;

function enumerate(scope = 'all') {
  if (!['all', 'broad'].includes(scope)) fail('scope must be all or broad');
  const script = `$TriageScope = '${scope}'\n${PS}`;
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  let raw;
  try {
    raw = execFileSync('powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64],
      { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', env: powershellEnv() });
  } catch (e) {
    fail('powershell enumeration failed: ' + (e.message || e));
  }
  let data = JSON.parse(raw.trim() || '[]');
  if (!Array.isArray(data)) data = [data];
  return data.map(cook).sort(sortRows);
}

let enumerationCache = null;
function enumerateCached(scope, maxAgeMs = 5000) {
  const now = Date.now();
  if (enumerationCache && enumerationCache.scope === scope && now - enumerationCache.at < maxAgeMs) {
    return enumerationCache.rows;
  }
  const rows = enumerate(scope);
  enumerationCache = { scope, at: Date.now(), rows };
  return rows;
}

function powershellEnv() {
  const env = { ...process.env };
  const systemRoot = env.SystemRoot || 'C:\\Windows';
  const programFiles = env.ProgramFiles || 'C:\\Program Files';
  env.PSModulePath = [
    path.join(programFiles, 'WindowsPowerShell\\Modules'),
    path.join(systemRoot, 'system32\\WindowsPowerShell\\v1.0\\Modules'),
  ].join(';');
  return env;
}

// --- rendering ---------------------------------------------------------------
function render(rows, showAll) {
  const view = showAll ? rows : rows.filter(r => r.thirdParty);
  fs.writeFileSync(CACHE, JSON.stringify(rows)); // index maps to full set
  const idxOf = r => rows.indexOf(r);
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);

  console.log('');
  console.log(bold('  #   PUBLISHER          SIG  BLK  NAME / DLL'));
  console.log(dim('  ' + '-'.repeat(72)));
  for (const r of view) {
    const i = pad('' + idxOf(r), 3);
    const pub = pad(r.pub, 17);
    const sig = r.orphan ? red('  ! ')
              : r.trusted ? grn('  \u2713 ')
              : r.sigStatus === 'Valid' ? ylw('  ~ ')
              : red('  x ');
    const blk = r.blocked ? red(' \u25CF ') : dim('  . ');
    const nm = r.name || r.label || '(unnamed)';
    const dll = r.dll ? path.basename(r.dll) : (r.orphan ? 'MISSING' : '?');
    const line = `  ${i} ${pub} ${sig} ${blk} ${nm}  ${dim(dll)}`;
    console.log(r.orphan ? red(line) : line);
  }
  const tp = rows.filter(r => r.thirdParty).length;
  const orph = rows.filter(r => r.orphan).length;
  const blkn = rows.filter(r => r.blocked).length;
  console.log(dim('  ' + '-'.repeat(72)));
  console.log(`  ${rows.length} handlers  ${cyn(tp + ' third-party')}  ${red(orph + ' orphaned')}  ${blkn} blocked`);
  if (!showAll && rows.length > view.length)
    console.log(dim(`  (${rows.length - view.length} Microsoft handlers hidden ... use: list --all)`));
  console.log(dim('  block one with:  node triage.js block <#>   (dry run; add --apply to commit)'));
  console.log('');
}

// --- resolve a target (index or clsid) ---------------------------------------
function resolveTarget(arg) {
  if (GUID_RE.test(arg)) return { clsid: arg.toUpperCase(), name: arg };
  const n = parseInt(arg, 10);
  if (Number.isInteger(n)) {
    if (!fs.existsSync(CACHE)) fail('no cache ... run `node triage.js list` first, then block by number');
    const rows = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (n < 0 || n >= rows.length) fail(`index ${n} out of range (0..${rows.length - 1})`);
    return { clsid: rows[n].clsid, name: rows[n].name || rows[n].label || rows[n].clsid };
  }
  fail('give a row number (from list) or a full {CLSID}');
}

function validateClsid(clsid) {
  try { return clsidOrThrow(clsid); }
  catch (e) { fail(e.message); }
}

// --- elevation + writes ------------------------------------------------------
function isAdmin() {
  try { execFileSync('net', ['session'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}
function logAppend(entry) {
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(LOG, 'utf8')); } catch {}
  arr.push({ ts: new Date().toISOString(), ...entry });
  fs.writeFileSync(LOG, JSON.stringify(arr, null, 2));
}

function optionValue(args, name, fallback = null) {
  const equals = args.find(arg => arg.startsWith(`${name}=`));
  if (equals) return equals.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--') ? args[index + 1] : fallback;
}

function scanScope(args) {
  return optionValue(args, '--scope', 'all');
}

function machineMetadata(scope) {
  let windows = {};
  try {
    const command = String.raw`$ProgressPreference='SilentlyContinue'; $ErrorActionPreference='SilentlyContinue'; Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' | Select-Object ProductName,DisplayVersion,CurrentBuild,UBR | ConvertTo-Json -Compress`;
    const encoded = Buffer.from(command, 'utf16le').toString('base64');
    windows = JSON.parse(execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded,
    ], { encoding: 'utf8', env: powershellEnv() }).trim());
  } catch {}
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    architecture: os.arch(),
    release: os.release(),
    windows,
    scanScope: scope,
    toolVersion: VERSION,
  };
}

let mutationBackup = null;
function ensureMutationBackup(action, scope = 'all') {
  if (mutationBackup) return mutationBackup;
  const filename = `triage-auto-before-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const snapshot = writeSnapshot(filename, scope);
  mutationBackup = snapshot.file;
  fs.writeFileSync(LAST_CHANGE, JSON.stringify({
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    action,
    snapshot: mutationBackup,
  }, null, 2));
  logAppend({ action: 'AUTO_SNAPSHOT', forAction: action, file: mutationBackup });
  return mutationBackup;
}

function regQuery(args) {
  return execFileSync('reg', args, { encoding: 'utf8' });
}

function getBlockedClsids() {
  let out = '';
  try { out = regQuery(['query', BLOCKED_KEY]); }
  catch { return new Set(); }
  return new Set([...out.matchAll(/\{[0-9A-Fa-f-]{36}\}/g)].map(m => m[0].toUpperCase()));
}

function setBlockedRaw(clsid, name, on) {
  const safeClsid = clsidOrThrow(clsid);
  const label = name || safeClsid;
  if (on) execFileSync('reg', ['add', BLOCKED_KEY, '/v', safeClsid, '/t', 'REG_SZ', '/d', label, '/f'], { stdio: 'ignore' });
  else execFileSync('reg', ['delete', BLOCKED_KEY, '/v', safeClsid, '/f'], { stdio: 'ignore' });
  logAppend({ action: on ? 'BLOCK' : 'UNBLOCK', clsid: safeClsid, name: label });
  return { clsid: safeClsid, name: label, blocked: on };
}

function setBlocked(clsid, name, on) {
  if (!isAdmin()) fail('writes need admin. relaunch this terminal as administrator, then retry with --apply');
  try { return setBlockedRaw(clsid, name, on); }
  catch (e) { fail(`${on ? 'BLOCK' : 'UNBLOCK'} failed: ${e.message || e}`); }
}

function restartExplorer() {
  try { execFileSync('taskkill', ['/f', '/im', 'explorer.exe'], { stdio: 'ignore' }); } catch {}
  execFileSync('cmd', ['/c', 'start', '', 'explorer'], { stdio: 'ignore' });
  logAppend({ action: 'RESTART_EXPLORER' });
}

function block(arg, apply, on, restart = false) {
  const t = resolveTarget(arg);
  const verb = on ? 'BLOCK' : 'UNBLOCK';
  if (!apply) {
    console.log(ylw(`\n  dry run  ${verb}  ${t.clsid}  (${t.name})`));
    console.log(dim(on
      ? `  would: reg add "${BLOCKED_KEY}" /v ${t.clsid} /t REG_SZ /d "${t.name}" /f`
      : `  would: reg delete "${BLOCKED_KEY}" /v ${t.clsid} /f`));
    if (restart) console.log(dim('  would restart Explorer after apply.'));
    console.log(dim('  add --apply to commit. restart Explorer after (taskkill /f /im explorer.exe & start explorer).\n'));
    return;
  }
  const backup = ensureMutationBackup(verb);
  console.log(dim(`  rollback snapshot: ${backup}`));
  setBlocked(t.clsid, t.name, on);
  console.log(grn(`\n  ${verb} ok  ${t.clsid}`));
  if (restart) {
    restartExplorer();
    console.log(grn('  Explorer restarted.\n'));
  } else {
    console.log(dim('  restart Explorer to apply:  taskkill /f /im explorer.exe & start explorer\n'));
  }
}

function showBlocked() {
  const guids = [...getBlockedClsids()];
  if (!guids.length) { console.log(dim('\n  block list empty or missing.\n')); return; }
  console.log(`\n  ${guids.length} blocked:`);
  guids.forEach(g => console.log('  ' + red('\u25CF') + ' ' + g));
  console.log('');
}

function classicMenuEnabled() {
  try { execFileSync('reg', ['query', CLASSIC_INPROC, '/ve'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function setClassicMenuRaw(enabled) {
  if (enabled) execFileSync('reg', ['add', CLASSIC_INPROC, '/ve', '/d', '', '/f'], { stdio: 'ignore' });
  else execFileSync('reg', ['delete', CLASSIC_ROOT, '/f'], { stdio: 'ignore' });
  logAppend({ action: enabled ? 'CLASSIC_MENU_ON' : 'CLASSIC_MENU_OFF' });
  return { enabled };
}

function classicMenu(args, apply) {
  const action = args[1] || 'status';
  const restart = args.includes('--restart-explorer');
  if (action === 'status') {
    console.log(`\n  classic menu: ${classicMenuEnabled() ? grn('on') : dim('off')}\n`);
    return;
  }
  if (action !== 'on' && action !== 'off') fail('classic-menu needs on, off, or status');
  const enabled = action === 'on';
  if (!apply) {
    console.log(ylw(`\n  dry run  CLASSIC_MENU_${enabled ? 'ON' : 'OFF'}`));
    console.log(dim(enabled
      ? `  would: reg add "${CLASSIC_INPROC}" /ve /d "" /f`
      : `  would: reg delete "${CLASSIC_ROOT}" /f`));
    if (restart) console.log(dim('  would restart Explorer after apply.'));
    console.log(dim('  add --apply to commit.\n'));
    return;
  }
  try {
    setClassicMenuRaw(enabled);
  } catch (e) {
    fail(`classic menu ${action} failed: ${e.message || e}`);
  }
  console.log(grn(`\n  classic menu ${action} ok`));
  if (restart) {
    restartExplorer();
    console.log(grn('  Explorer restarted.\n'));
  } else {
    console.log(dim('  restart Explorer to apply.\n'));
  }
}

function writeSnapshot(file, scope = 'all') {
  const rows = enumerate(scope);
  const out = file || `triage-snapshot-${Date.now()}.json`;
  const document = snapshotDocument(rows, machineMetadata(scope));
  fs.writeFileSync(out, JSON.stringify(document, null, 2));
  return { file: path.resolve(out), rows, document };
}

function importPlan(snapshotFile) {
  if (!snapshotFile) throw badRequest('import needs a snapshot json file');
  let snapshot;
  try { snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')); }
  catch (e) { throw badRequest(`could not read snapshot: ${e.message || e}`); }
  try { return blockPlan(snapshot, getBlockedClsids()); }
  catch (e) { throw badRequest(e.message || String(e)); }
}

function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

function importSnapshot(snapshotFile, apply) {
  let plan;
  try { plan = importPlan(snapshotFile); }
  catch (e) { fail(e.message || String(e)); }
  console.log(`\n  snapshot entries: ${plan.total}`);
  console.log(`  would block: ${plan.toBlock.length}`);
  plan.toBlock.forEach(x => console.log(`    + ${x.clsid}  ${x.name}`));
  console.log(`  would unblock: ${plan.toUnblock.length}`);
  plan.toUnblock.forEach(x => console.log(`    - ${x.clsid}  ${x.name}`));
  if (!plan.toBlock.length && !plan.toUnblock.length) {
    console.log(grn('  block list already matches snapshot.\n'));
    return;
  }
  if (!apply) {
    console.log(dim('  dry run only. add --apply to commit.\n'));
    return;
  }
  if (!isAdmin()) fail('import writes need admin. relaunch this terminal as administrator, then retry with --apply');
  const backup = ensureMutationBackup('IMPORT_SNAPSHOT');
  console.log(dim(`  rollback snapshot: ${backup}`));
  for (const x of plan.toBlock) setBlocked(x.clsid, x.name, true);
  for (const x of plan.toUnblock) setBlocked(x.clsid, x.name, false);
  logAppend({ action: 'IMPORT_SNAPSHOT', file: path.resolve(snapshotFile), blocked: plan.toBlock.length, unblocked: plan.toUnblock.length });
  console.log(grn('  import applied. restart Explorer to apply shell changes.\n'));
}

function undoLast(apply) {
  let state;
  try { state = JSON.parse(fs.readFileSync(LAST_CHANGE, 'utf8')); }
  catch { fail('no automatic rollback snapshot is recorded'); }
  if (!state.snapshot || !fs.existsSync(state.snapshot)) fail('the recorded rollback snapshot no longer exists');
  console.log(`\n  last change: ${state.action || 'unknown'}  ${state.createdAt || ''}`);
  console.log(`  rollback file: ${state.snapshot}`);
  importSnapshot(state.snapshot, apply);
}

function readSnapshot(file) {
  if (!file) fail('snapshot file required');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { fail(`could not read snapshot: ${e.message || e}`); }
}

function renderDiff(diff, asJson = false) {
  if (asJson) return console.log(JSON.stringify(diff, null, 2));
  console.log(`\n  added: ${diff.added.length}  removed: ${diff.removed.length}  changed: ${diff.changed.length}`);
  diff.added.forEach(row => console.log(`    + ${row.clsid}`));
  diff.removed.forEach(row => console.log(`    - ${row.clsid}`));
  diff.changed.forEach(row => console.log(`    ~ ${row.clsid}`));
  console.log('');
}

function diffCommand(beforeFile, afterFile, asJson) {
  renderDiff(diffHandlers(readSnapshot(beforeFile), readSnapshot(afterFile)), asJson);
}

function baselineCommand(args) {
  const action = args[1];
  const file = args[2];
  const scope = scanScope(args);
  if (!['create', 'check'].includes(action) || !file) fail('baseline needs create|check <file>');
  if (action === 'create') {
    const snapshot = writeSnapshot(file, scope);
    console.log(grn(`\n  baseline written: ${snapshot.file}\n`));
    return;
  }
  const current = snapshotDocument(enumerate(scope), machineMetadata(scope));
  const diff = diffHandlers(readSnapshot(file), current);
  renderDiff(diff, args.includes('--json'));
  if (diff.added.length || diff.removed.length || diff.changed.length) process.exitCode = 2;
}

function auditCommand(args) {
  const scope = scanScope(args);
  const rows = filterRows(enumerate(scope), cliFilters(args, true));
  const format = optionValue(args, '--format', args.includes('--csv') ? 'csv' : args.includes('--sarif') ? 'sarif' : 'json');
  const output = optionValue(args, '--output');
  let content;
  if (format === 'json') content = JSON.stringify(snapshotDocument(rows, machineMetadata(scope)), null, 2) + '\n';
  else if (format === 'csv') content = handlersToCsv(rows);
  else if (format === 'sarif') content = JSON.stringify(handlersToSarif(rows, { version: VERSION }), null, 2) + '\n';
  else fail('audit --format must be json, csv, or sarif');
  if (output) fs.writeFileSync(output, content);
  else if (!args.includes('--quiet')) process.stdout.write(content);
  const failOn = optionValue(args, '--fail-on');
  if (failOn) {
    const failed = rows.some(row => failOn === 'orphan' ? row.orphan
      : failOn === 'unsigned' ? row.sigStatus !== 'Valid'
      : failOn === 'third-party' ? row.thirdParty
      : failOn === 'writable-missing-path' ? row.writableMissingPath
      : false);
    if (!['orphan', 'unsigned', 'third-party', 'writable-missing-path'].includes(failOn)) fail('unsupported --fail-on value');
    if (failed) process.exitCode = 2;
  }
}

function cliFilters(args, showMicrosoftDefault = false) {
  const blocked = optionValue(args, '--blocked');
  return {
    showMicrosoft: args.includes('--all') || showMicrosoftDefault,
    query: optionValue(args, '--query', ''),
    publisher: optionValue(args, '--publisher'),
    signature: optionValue(args, '--signature'),
    hive: optionValue(args, '--hive'),
    view: optionValue(args, '--view'),
    state: optionValue(args, '--state'),
    blocked: blocked === 'yes' ? true : blocked === 'no' ? false : undefined,
  };
}

function readConflictsDb() {
  let data;
  const candidates = [
    path.join(path.dirname(process.execPath), 'known-conflicts.json'),
    CONFLICTS,
  ];
  const file = candidates.find(candidate => fs.existsSync(candidate));
  if (!file) return [];
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`could not read known-conflicts.json: ${e.message || e}`); }
  if (!Array.isArray(data)) throw new Error('known-conflicts.json must contain an array');
  return data.filter(entry => {
    if (!entry || typeof entry !== 'object') return false;
    if (!entry.source) throw new Error(`conflict entry ${entry.id || '(unnamed)'} has no source`);
    if (entry.match === 'clsid') {
      for (const clsid of entry.clsids || []) clsidOrThrow(clsid);
    }
    return true;
  });
}

function computeConflicts(rows) {
  const db = readConflictsDb();
  const active = rows.filter(r => !r.blocked);
  const activeByClsid = new Map(active.map(r => [r.clsid.toUpperCase(), r]));
  const textFor = r => [r.name, r.label, r.pub, r.dll ? path.basename(r.dll) : ''].filter(Boolean).join(' ').toLowerCase();
  const results = [];
  for (const entry of db) {
    if (entry.match === 'clsid') {
      const affected = (entry.clsids || [])
        .map(clsidOrThrow)
        .filter(clsid => activeByClsid.has(clsid));
      if (affected.length >= 2) results.push(conflictResult(entry, affected, activeByClsid));
      continue;
    }
    if (entry.match === 'name') {
      const names = (entry.names || []).map(n => String(n).toLowerCase()).filter(Boolean);
      const affected = active.filter(row => names.some(name => textFor(row).includes(name))).map(r => r.clsid);
      if (affected.length) results.push(conflictResult(entry, affected, activeByClsid));
      continue;
    }
    throw new Error(`conflict entry ${entry.id || '(unnamed)'} has unsupported match type`);
  }
  return results;
}

function conflictResult(entry, affectedClsids, activeByClsid) {
  return {
    id: entry.id || 'unnamed-conflict',
    match: entry.match,
    severity: entry.severity || 'low',
    confidence: entry.confidence || 'reported',
    source: entry.source,
    note: entry.note || '',
    definite: entry.match === 'clsid',
    affectedClsids,
    affectedNames: affectedClsids.map(clsid => {
      const row = activeByClsid.get(clsid);
      return row ? (row.name || row.label || clsid) : clsid;
    }),
  };
}

// --- local HTTP GUI ----------------------------------------------------------
function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) reject(new Error('request body too large'));
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function adminRequired(res) {
  if (isAdmin()) return false;
  sendJson(res, 403, { error: 'Administrator terminal required for HKLM block list writes.', needsAdmin: true });
  return true;
}

function apiTokenValid(req, token) {
  const url = new URL(req.url, 'http://127.0.0.1');
  return req.headers['x-triage-token'] === token || url.searchParams.get('t') === token;
}

async function handleApi(req, res, route, token, state, port) {
  if (!apiTokenValid(req, token)) return sendJson(res, 403, { error: 'Invalid or missing API token.' });
  const scope = state.scope;
  if (req.method === 'GET' && route === '/api/handlers') return sendJson(res, 200, enumerateCached(scope));
  if (req.method === 'GET' && route === '/api/blocked') return sendJson(res, 200, [...getBlockedClsids()]);
  if (req.method === 'GET' && route === '/api/classic-menu') return sendJson(res, 200, { enabled: classicMenuEnabled() });
  if (req.method === 'GET' && route === '/api/admin') return sendJson(res, 200, { admin: isAdmin() });
  if (req.method === 'GET' && route === '/api/conflicts') return sendJson(res, 200, computeConflicts(enumerateCached(scope)));
  if (req.method === 'GET' && route === '/api/meta') return sendJson(res, 200, { version: VERSION, scope, machine: machineMetadata(scope) });
  if (req.method === 'POST' && route === '/api/scope') {
    const body = await readBody(req);
    if (!['all', 'broad'].includes(body.scope)) return sendJson(res, 400, { error: 'scope must be all or broad' });
    state.scope = body.scope;
    return sendJson(res, 200, { scope: state.scope });
  }

  if (req.method === 'POST' && route === '/api/block') {
    if (adminRequired(res)) return;
    const body = await readBody(req);
    const backup = ensureMutationBackup('GUI_BLOCK', scope);
    return sendJson(res, 200, { ...setBlockedRaw(body.clsid, body.name, true), backup });
  }
  if (req.method === 'POST' && route === '/api/unblock') {
    if (adminRequired(res)) return;
    const body = await readBody(req);
    const backup = ensureMutationBackup('GUI_UNBLOCK', scope);
    return sendJson(res, 200, { ...setBlockedRaw(body.clsid, body.clsid, false), backup });
  }
  if (req.method === 'POST' && route === '/api/classic-menu') {
    const body = await readBody(req);
    return sendJson(res, 200, setClassicMenuRaw(body.enabled === true));
  }
  if (req.method === 'POST' && route === '/api/export') {
    const body = await readBody(req);
    const snapshot = writeSnapshot(body.file, scope);
    return sendJson(res, 200, { file: snapshot.file, count: snapshot.rows.length });
  }
  if (req.method === 'POST' && route === '/api/import') {
    const body = await readBody(req);
    const plan = importPlan(body.file);
    if ((plan.toBlock.length || plan.toUnblock.length) && adminRequired(res)) return;
    const backup = plan.toBlock.length || plan.toUnblock.length ? ensureMutationBackup('GUI_IMPORT', scope) : null;
    for (const x of plan.toBlock) setBlockedRaw(x.clsid, x.name, true);
    for (const x of plan.toUnblock) setBlockedRaw(x.clsid, x.name, false);
    if (plan.toBlock.length || plan.toUnblock.length) {
      logAppend({ action: 'IMPORT_SNAPSHOT', file: path.resolve(body.file), blocked: plan.toBlock.length, unblocked: plan.toUnblock.length });
    }
    return sendJson(res, 200, { applied: true, blocked: plan.toBlock.length, unblocked: plan.toUnblock.length, backup });
  }
  if (req.method === 'POST' && route === '/api/relaunch-admin') {
    if (isAdmin()) return sendJson(res, 200, { alreadyAdmin: true });
    relaunchGuiAsAdmin(port + 1, scope);
    return sendJson(res, 200, { launched: true, port: port + 1 });
  }
  if (req.method === 'POST' && route === '/api/restart-explorer') {
    restartExplorer();
    return sendJson(res, 200, { restarted: true });
  }
  sendJson(res, 404, { error: 'not found' });
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function relaunchGuiAsAdmin(port, scope) {
  const executable = process.execPath;
  const argumentsList = path.basename(executable).toLowerCase() === 'node.exe'
    ? [__filename, 'gui', '--port', String(port), '--scope', scope]
    : ['gui', '--port', String(port), '--scope', scope];
  const script = `$argsList = @(${argumentsList.map(psQuote).join(',')}); Start-Process -Verb RunAs -FilePath ${psQuote(executable)} -ArgumentList $argsList -WindowStyle Hidden`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { stdio: 'ignore', env: powershellEnv() });
}

// Locate a Chromium browser (Edge, then Chrome) so the GUI can open in a
// dedicated app window instead of a tab in the user's default browser.
function findChromiumBrowser() {
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local');
  const candidates = [
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  for (const exe of candidates) {
    try { if (fs.statSync(exe).isFile()) return exe; } catch {}
  }
  return null;
}

// Open the GUI as its own chromeless window (Chromium --app mode). A dedicated
// user-data-dir guarantees a separate window even when the browser is already
// running. Falls back to the default browser as a tab if no Chromium is found.
function openGuiWindow(url) {
  const browser = findChromiumBrowser();
  if (browser) {
    const profileDir = path.join(os.tmpdir(), 'triage-gui-profile');
    try {
      const child = spawn(browser, [
        `--app=${url}`,
        `--user-data-dir=${profileDir}`,
        '--window-size=1200,800',
        '--no-first-run',
        '--no-default-browser-check',
      ], { detached: true, stdio: 'ignore' });
      child.on('error', () => openGuiTab(url));
      child.unref();
      return;
    } catch { /* fall through to tab */ }
  }
  openGuiTab(url);
}

function openGuiTab(url) {
  try { execFileSync('cmd', ['/c', 'start', '', url], { stdio: 'ignore' }); } catch {}
}

function startGui(args) {
  const portIndex = args.indexOf('--port');
  const port = portIndex >= 0 ? parseInt(args[portIndex + 1], 10) : 7373;
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('valid --port required');
  const noOpen = args.includes('--no-open');
  // The GUI defaults to the fast 'broad' scan (7 common right-click surfaces)
  // for a near-instant first paint; the toolbar toggles a full scan on demand.
  // An explicit --scope on the command line still wins.
  const state = { scope: args.includes('--scope') ? scanScope(args) : 'broad' };
  if (args.includes('--elevate') && !isAdmin()) {
    relaunchGuiAsAdmin(port, state.scope);
    console.log(grn('\n  requested administrator GUI launch.\n'));
    return;
  }
  const host = '127.0.0.1';
  const token = crypto.randomBytes(24).toString('hex');
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${host}:${port}`);
      if (url.pathname === '/' && req.method === 'GET') {
        const html = renderGui(token);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(html),
          'Cache-Control': 'no-store',
        });
        res.end(html);
        return;
      }
      if (url.pathname === '/favicon.ico' && req.method === 'GET') {
        res.writeHead(204, { 'Cache-Control': 'public, max-age=86400' });
        res.end();
        return;
      }
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url.pathname, token, state, port);
      sendJson(res, 404, { error: 'not found' });
    } catch (e) {
      sendJson(res, e.status || (e.body && e.body.needsAdmin ? 403 : 500), { error: e.message || String(e), needsAdmin: !!(e.body && e.body.needsAdmin) });
    }
  });
  server.listen(port, host, () => {
    const url = `http://${host}:${port}/?t=${token}`;
    console.log(grn(`\n  GUI listening: ${url}`));
    console.log(dim('  press Ctrl+C to stop.\n'));
    if (!noOpen) openGuiWindow(url);
  });
}

// --- main --------------------------------------------------------------------
function fail(msg) { console.error(red('  error: ') + msg); process.exit(1); }
function isSeaRuntime() {
  try { return require('node:sea').isSea(); }
  catch { return false; }
}
function main() {
  const args = process.argv.slice(2).filter(a => a !== '--no-color');
  const cmd = args[0] || (isSeaRuntime() ? 'gui' : 'list');
  const apply = args.includes('--apply');
  const showAll = args.includes('--all');
  const asJson = args.includes('--json');
  const scope = scanScope(args);

  if (['-h', '--help', 'help'].includes(cmd)) {
    console.log(HELP);
    return;
  }
  if (cmd === 'blocked') return showBlocked();
  if (cmd === 'classic-menu') return classicMenu(args, apply);
  if (cmd === 'import') return importSnapshot(args[1], apply);
  if (cmd === 'undo-last') return undoLast(apply);
  if (cmd === 'diff') return diffCommand(args[1], args[2], asJson);
  if (cmd === 'baseline') return baselineCommand(args);
  if (cmd === 'audit') return auditCommand(args);
  if (cmd === 'gui' || cmd === 'serve') return startGui(args);
  if (cmd === 'conflicts') {
    const rows = enumerate(scope);
    console.log(JSON.stringify(computeConflicts(rows), null, 2));
    return;
  }

  if (cmd === 'block' || cmd === 'unblock') {
    if (!args[1]) fail(`${cmd} needs a row number or {CLSID}`);
    return block(args[1], apply, cmd === 'block', args.includes('--restart-explorer'));
  }
  if (cmd === 'export') {
    const snapshot = writeSnapshot(args[1], scope);
    console.log(grn(`\n  snapshot written: ${snapshot.file}  (${snapshot.rows.length} handlers)`));
    console.log(dim('  keep this. it is your one-file rollback record.\n'));
    return;
  }
  // default: list
  const rows = enumerate(scope);
  if (asJson) { fs.writeFileSync(CACHE, JSON.stringify(rows)); console.log(JSON.stringify(rows, null, 2)); return; }
  const filtered = filterRows(rows, { ...cliFilters(args, true), showMicrosoft: true });
  render(filtered, showAll);
}
if (require.main === module) main();

module.exports = {
  PS,
  computeConflicts,
  enumerate,
  importPlan,
  powershellEnv,
};
