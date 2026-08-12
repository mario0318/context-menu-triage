#!/usr/bin/env node
/*
 * triage.js  ...  context menu triage (tonight scaffold)
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
 *   node triage.js blocked         show what is currently blocked
 *   node triage.js export <file>   snapshot full state to json (your rollback file)
 *
 * windows + node 16+ only. run terminal as admin only when you --apply.
 */

'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BLOCKED_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Shell Extensions\\Blocked';
const CACHE = path.join(os.tmpdir(), 'triage-cache.json');
const LOG = path.join(process.cwd(), 'triage-log.json');
const GUID_RE = /^\{[0-9A-Fa-f-]{36}\}$/;

const NOCOLOR = process.argv.includes('--no-color') || !process.stdout.isTTY;
const c = (code, s) => (NOCOLOR ? s : `\x1b[${code}m${s}\x1b[0m`);
const dim = s => c('2', s), red = s => c('31', s), grn = s => c('32', s),
      ylw = s => c('33', s), cyn = s => c('36', s), bold = s => c('1', s);

// --- powershell enumeration (encoded to dodge all quoting) --------------------
const PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'
function Resolve-Clsid($clsid) {
  $paths = @("Registry::HKEY_CLASSES_ROOT\CLSID\$clsid","Registry::HKEY_CLASSES_ROOT\WOW6432Node\CLSID\$clsid")
  foreach ($cp in $paths) {
    $ck = Get-Item -LiteralPath $cp -ErrorAction SilentlyContinue
    if ($ck) {
      $name = $ck.GetValue('')
      $ip = Get-Item -LiteralPath ($cp + '\InprocServer32') -ErrorAction SilentlyContinue
      $dll = $null
      if ($ip) { $dll = $ip.GetValue('') }
      return @{ name = $name; dll = $dll }
    }
  }
  return @{ name = $null; dll = $null }
}
$parents = @(
  'Registry::HKEY_CLASSES_ROOT\*\shellex\ContextMenuHandlers',
  'Registry::HKEY_CLASSES_ROOT\AllFilesystemObjects\shellex\ContextMenuHandlers',
  'Registry::HKEY_CLASSES_ROOT\Directory\shellex\ContextMenuHandlers',
  'Registry::HKEY_CLASSES_ROOT\Directory\Background\shellex\ContextMenuHandlers',
  'Registry::HKEY_CLASSES_ROOT\Drive\shellex\ContextMenuHandlers',
  'Registry::HKEY_CLASSES_ROOT\Folder\shellex\ContextMenuHandlers',
  'Registry::HKEY_CLASSES_ROOT\LibraryFolder\shellex\ContextMenuHandlers'
)
$blocked = @{}
$bk = Get-Item -LiteralPath ('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Blocked') -ErrorAction SilentlyContinue
if ($bk) { foreach ($n in $bk.GetValueNames()) { if ($n) { $blocked[$n.ToUpper()] = $true } } }
$guid = '^\{[0-9A-Fa-f-]{36}\}$'
$map = @{}
foreach ($p in $parents) {
  $surface = [regex]::Match($p, 'HKEY_CLASSES_ROOT\\(.+?)\\shellex').Groups[1].Value
  foreach ($k in (Get-ChildItem -LiteralPath $p -ErrorAction SilentlyContinue)) {
    $def = $k.GetValue('')
    $clsid = $null
    if ($def -and ($def -match $guid)) { $clsid = $def }
    elseif ($k.PSChildName -match $guid) { $clsid = $k.PSChildName }
    if (-not $clsid) { continue }
    $clsid = $clsid.ToUpper()
    if ($map.ContainsKey($clsid)) { $map[$clsid].surfaces += $surface; continue }
    $r = Resolve-Clsid $clsid
    $dll = $r.dll
    if ($dll) {
      $dll = [Environment]::ExpandEnvironmentVariables($dll).Trim('"')
      if ($dll -and -not ($dll -match '[\\/]')) {
        foreach ($base in @(($env:SystemRoot + '\System32'), ($env:SystemRoot + '\SysWOW64'))) {
          $cand = Join-Path $base $dll
          if (Test-Path -LiteralPath $cand -ErrorAction SilentlyContinue) { $dll = $cand; break }
        }
      }
    }
    $exists = $false; $status = 'None'; $signer = $null; $underWin = $false
    if ($dll) {
      $wr = ('' + $env:SystemRoot).ToLower()
      if ($wr -and $dll.ToLower().StartsWith($wr)) { $underWin = $true }
      if (Test-Path -LiteralPath $dll -ErrorAction SilentlyContinue) {
        $exists = $true
        $sig = Get-AuthenticodeSignature -LiteralPath $dll -ErrorAction SilentlyContinue
        if ($null -ne $sig) {
          $status = $sig.Status.ToString()
          if ($null -ne $sig.SignerCertificate) { $signer = $sig.SignerCertificate.Subject }
        }
      }
    }
    $map[$clsid] = [pscustomobject]@{
      clsid = $clsid; label = ('' + $k.PSChildName); name = $r.name; dll = $dll
      exists = $exists; sigStatus = $status; signer = $signer; underWindows = $underWin
      surfaces = @($surface); blocked = [bool]$blocked[$clsid]
    }
  }
}
@($map.Values) | ConvertTo-Json -Depth 5
`;

function enumerate() {
  const b64 = Buffer.from(PS, 'utf16le').toString('base64');
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

function cook(x) {
  const signer = x.signer || '';
  const cn = (signer.match(/CN=([^,]+)/) || [])[1];
  const msSigner = /Microsoft (Corporation|Windows)/i.test(signer);
  const validSig = x.sigStatus === 'Valid';
  const inWin = x.underWindows === true;
  // path first: a DLL under %SystemRoot% is Windows/system UNLESS it is validly
  // signed by a non-Microsoft party (rare third party masquerading in system dirs).
  // this is the robust signal: catalog-signed OS files often expose no signer cert
  // via Get-AuthenticodeSignature, so we do not rely on the signature alone.
  const isSystem = inWin && !(validSig && signer && !msSigner);
  const isMs = isSystem || (validSig && msSigner);
  const orphan = !x.exists;
  let pub, reason;
  if (isSystem)            { pub = 'Windows';   reason = 'system path'; }
  else if (isMs)           { pub = 'Microsoft'; reason = 'ms-signed'; }
  else if (orphan)         { pub = 'ORPHAN';    reason = 'dll missing'; }
  else if (validSig && cn) { pub = cn.trim();   reason = 'signed'; }
  else if (cn)             { pub = cn.trim();   reason = 'sig:' + x.sigStatus; }
  else                     { pub = 'UNSIGNED';  reason = 'no signature'; }
  const trusted = isMs;
  return { ...x, isMs, isSystem, trusted, pub, reason, thirdParty: !isMs, orphan };
}
function sortRows(a, b) {
  // orphans first, then unsigned/third-party, microsoft last
  const rank = r => (r.orphan ? 0 : r.thirdParty ? 1 : 2);
  return rank(a) - rank(b) || (a.pub || '').localeCompare(b.pub || '');
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

function block(arg, apply, on) {
  const t = resolveTarget(arg);
  const verb = on ? 'BLOCK' : 'UNBLOCK';
  if (!apply) {
    console.log(ylw(`\n  dry run  ${verb}  ${t.clsid}  (${t.name})`));
    console.log(dim(on
      ? `  would: reg add "${BLOCKED_KEY}" /v ${t.clsid} /t REG_SZ /d "${t.name}" /f`
      : `  would: reg delete "${BLOCKED_KEY}" /v ${t.clsid} /f`));
    console.log(dim('  add --apply to commit. restart Explorer after (taskkill /f /im explorer.exe & start explorer).\n'));
    return;
  }
  if (!isAdmin()) fail('writes need admin. relaunch this terminal as administrator, then retry with --apply');
  try {
    if (on) execFileSync('reg', ['add', BLOCKED_KEY, '/v', t.clsid, '/t', 'REG_SZ', '/d', t.name, '/f'], { stdio: 'ignore' });
    else    execFileSync('reg', ['delete', BLOCKED_KEY, '/v', t.clsid, '/f'], { stdio: 'ignore' });
  } catch (e) { fail(`${verb} failed: ${e.message || e}`); }
  logAppend({ action: verb, clsid: t.clsid, name: t.name });
  console.log(grn(`\n  ${verb} ok  ${t.clsid}`));
  console.log(dim('  restart Explorer to apply:  taskkill /f /im explorer.exe & start explorer\n'));
}

function showBlocked() {
  let out = '';
  try { out = execFileSync('reg', ['query', BLOCKED_KEY], { encoding: 'utf8' }); }
  catch { console.log(dim('\n  block list empty or missing.\n')); return; }
  const guids = [...out.matchAll(/\{[0-9A-Fa-f-]{36}\}/g)].map(m => m[0]);
  console.log(`\n  ${guids.length} blocked:`);
  guids.forEach(g => console.log('  ' + red('\u25CF') + ' ' + g));
  console.log('');
}

// --- main --------------------------------------------------------------------
function fail(msg) { console.error(red('  error: ') + msg); process.exit(1); }
function main() {
  const args = process.argv.slice(2).filter(a => a !== '--no-color');
  const cmd = args[0] || 'list';
  const apply = args.includes('--apply');
  const showAll = args.includes('--all');
  const asJson = args.includes('--json');

  if (['-h', '--help', 'help'].includes(cmd)) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^[\s\S]*?usage:/, 'usage:'));
    return;
  }
  if (cmd === 'blocked') return showBlocked();

  if (cmd === 'block' || cmd === 'unblock') {
    if (!args[1]) fail(`${cmd} needs a row number or {CLSID}`);
    return block(args[1], apply, cmd === 'block');
  }
  if (cmd === 'export') {
    const rows = enumerate();
    const file = args[1] || `triage-snapshot-${Date.now()}.json`;
    fs.writeFileSync(file, JSON.stringify(rows, null, 2));
    console.log(grn(`\n  snapshot written: ${file}  (${rows.length} handlers)`));
    console.log(dim('  keep this. it is your one-file rollback record.\n'));
    return;
  }
  // default: list
  const rows = enumerate();
  if (asJson) { fs.writeFileSync(CACHE, JSON.stringify(rows)); console.log(JSON.stringify(rows, null, 2)); return; }
  render(rows, showAll);
}
main();
