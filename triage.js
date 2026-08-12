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
 *   node triage.js blocked              show what is currently blocked
 *   node triage.js export <file>        snapshot full state to json (your rollback file)
 *   node triage.js import <file>        dry run restore block list from snapshot
 *   node triage.js classic-menu status  show Win11/classic context menu mode
 *   node triage.js classic-menu on      dry run classic menu toggle (add --apply)
 *   node triage.js classic-menu off     dry run Win11 menu toggle (add --apply)
 *   node triage.js gui                  serve local HTTP GUI on 127.0.0.1:7373
 *
 * windows + node 16+ only. run terminal as admin only when you --apply.
 */

'use strict';
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { URL } = require('url');

const BLOCKED_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Shell Extensions\\Blocked';
const CLASSIC_ROOT = 'HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}';
const CLASSIC_INPROC = CLASSIC_ROOT + '\\InprocServer32';
const CACHE = path.join(os.tmpdir(), 'triage-cache.json');
const LOG = path.join(process.cwd(), 'triage-log.json');
const CONFLICTS = path.join(__dirname, 'known-conflicts.json');
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
  // orphans first, then unsigned/problem third-party, signed third-party, microsoft last
  const rank = r => (r.orphan ? 0 : r.thirdParty && r.sigStatus !== 'Valid' ? 1 : r.thirdParty ? 2 : 3);
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

function clsidOrThrow(clsid) {
  if (!GUID_RE.test(clsid || '')) throw new Error(`invalid CLSID: ${clsid}`);
  return clsid.toUpperCase();
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
  setBlocked(t.clsid, t.name, on);
  console.log(grn(`\n  ${verb} ok  ${t.clsid}`));
  console.log(dim('  restart Explorer to apply:  taskkill /f /im explorer.exe & start explorer\n'));
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

function writeSnapshot(file) {
  const rows = enumerate();
  const out = file || `triage-snapshot-${Date.now()}.json`;
  fs.writeFileSync(out, JSON.stringify(rows, null, 2));
  return { file: path.resolve(out), rows };
}

function importPlan(snapshotFile) {
  if (!snapshotFile) throw badRequest('import needs a snapshot json file');
  let snapshot;
  try { snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')); }
  catch (e) { throw badRequest(`could not read snapshot: ${e.message || e}`); }
  if (!Array.isArray(snapshot)) throw badRequest('snapshot must be an array written by `node triage.js export`');
  const desired = new Map();
  for (const row of snapshot) {
    if (!row || !row.clsid) continue;
    const clsid = clsidOrThrow(row.clsid);
    desired.set(clsid, {
      blocked: row.blocked === true,
      name: row.name || row.label || clsid,
    });
  }
  const currentBlocked = getBlockedClsids();
  const toBlock = [];
  const toUnblock = [];
  for (const [clsid, row] of desired) {
    if (row.blocked && !currentBlocked.has(clsid)) toBlock.push({ clsid, name: row.name });
  }
  for (const [clsid, row] of desired) {
    if (!row.blocked && currentBlocked.has(clsid)) toUnblock.push({ clsid, name: row.name });
  }
  return { toBlock, toUnblock, total: desired.size };
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
  for (const x of plan.toBlock) setBlocked(x.clsid, x.name, true);
  for (const x of plan.toUnblock) setBlocked(x.clsid, x.name, false);
  logAppend({ action: 'IMPORT_SNAPSHOT', file: path.resolve(snapshotFile), blocked: plan.toBlock.length, unblocked: plan.toUnblock.length });
  console.log(grn('  import applied. restart Explorer to apply shell changes.\n'));
}

function readConflictsDb() {
  let data;
  try { data = JSON.parse(fs.readFileSync(CONFLICTS, 'utf8')); }
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

async function handleApi(req, res, route, token) {
  if (!apiTokenValid(req, token)) return sendJson(res, 403, { error: 'Invalid or missing API token.' });
  if (req.method === 'GET' && route === '/api/handlers') return sendJson(res, 200, enumerate());
  if (req.method === 'GET' && route === '/api/blocked') return sendJson(res, 200, [...getBlockedClsids()]);
  if (req.method === 'GET' && route === '/api/classic-menu') return sendJson(res, 200, { enabled: classicMenuEnabled() });
  if (req.method === 'GET' && route === '/api/admin') return sendJson(res, 200, { admin: isAdmin() });
  if (req.method === 'GET' && route === '/api/conflicts') return sendJson(res, 200, computeConflicts(enumerate()));

  if (req.method === 'POST' && route === '/api/block') {
    if (adminRequired(res)) return;
    const body = await readBody(req);
    return sendJson(res, 200, setBlockedRaw(body.clsid, body.name, true));
  }
  if (req.method === 'POST' && route === '/api/unblock') {
    if (adminRequired(res)) return;
    const body = await readBody(req);
    return sendJson(res, 200, setBlockedRaw(body.clsid, body.clsid, false));
  }
  if (req.method === 'POST' && route === '/api/classic-menu') {
    const body = await readBody(req);
    return sendJson(res, 200, setClassicMenuRaw(body.enabled === true));
  }
  if (req.method === 'POST' && route === '/api/export') {
    const body = await readBody(req);
    const snapshot = writeSnapshot(body.file);
    return sendJson(res, 200, { file: snapshot.file, count: snapshot.rows.length });
  }
  if (req.method === 'POST' && route === '/api/import') {
    const body = await readBody(req);
    const plan = importPlan(body.file);
    if ((plan.toBlock.length || plan.toUnblock.length) && adminRequired(res)) return;
    for (const x of plan.toBlock) setBlockedRaw(x.clsid, x.name, true);
    for (const x of plan.toUnblock) setBlockedRaw(x.clsid, x.name, false);
    if (plan.toBlock.length || plan.toUnblock.length) {
      logAppend({ action: 'IMPORT_SNAPSHOT', file: path.resolve(body.file), blocked: plan.toBlock.length, unblocked: plan.toUnblock.length });
    }
    return sendJson(res, 200, { applied: true, blocked: plan.toBlock.length, unblocked: plan.toUnblock.length });
  }
  if (req.method === 'POST' && route === '/api/restart-explorer') {
    restartExplorer();
    return sendJson(res, 200, { restarted: true });
  }
  sendJson(res, 404, { error: 'not found' });
}

function guiHtml(token) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Context Menu Triage</title>
<style>
:root { color-scheme: light; --bg: #f6f7f9; --panel: #ffffff; --line: #d7dce2; --text: #18202a; --muted: #66717f; --danger: #b42318; --warn: #9a6700; --ok: #067647; --accent: #155eef; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; color: var(--text); background: var(--bg); }
header { height: 58px; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; border-bottom: 1px solid var(--line); background: var(--panel); }
h1 { margin: 0; font-size: 18px; font-weight: 650; }
main { padding: 14px 18px 22px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px; }
.group { display: inline-flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--line); background: var(--panel); border-radius: 6px; }
button, input[type="text"] { font: inherit; }
button { border: 1px solid var(--line); background: #fff; color: var(--text); border-radius: 5px; padding: 6px 10px; cursor: pointer; min-height: 32px; }
button:hover { border-color: #9aa7b5; }
button.primary { color: #fff; background: var(--accent); border-color: var(--accent); }
button.danger { color: #fff; background: var(--danger); border-color: var(--danger); }
button:disabled { opacity: .55; cursor: not-allowed; }
input[type="text"] { min-width: 260px; border: 1px solid var(--line); border-radius: 5px; padding: 6px 8px; min-height: 32px; }
label { display: inline-flex; align-items: center; gap: 7px; color: var(--muted); }
.banner { display: none; margin-bottom: 12px; padding: 10px 12px; border: 1px solid #f2c94c; border-radius: 6px; background: #fffbeb; color: #6f4e00; }
.banner.show { display: block; }
.status { color: var(--muted); min-height: 20px; }
.status.error { color: var(--danger); }
.status.ok { color: var(--ok); }
.table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); }
table { width: 100%; border-collapse: collapse; min-width: 980px; table-layout: fixed; }
th, td { border-bottom: 1px solid var(--line); padding: 8px 10px; text-align: left; vertical-align: top; font-size: 13px; }
th { position: sticky; top: 0; background: #eef1f5; z-index: 1; font-size: 12px; color: #364152; text-transform: uppercase; letter-spacing: 0; }
tr:last-child td { border-bottom: 0; }
.pub { width: 170px; }
.sig { width: 120px; }
.blocked { width: 92px; }
.action { width: 96px; }
.name { width: 310px; }
.dll { width: 180px; color: var(--muted); }
.conflict { margin-top: 5px; color: var(--warn); font-size: 12px; line-height: 1.35; }
.pill { display: inline-block; min-width: 64px; text-align: center; padding: 3px 7px; border-radius: 999px; border: 1px solid var(--line); background: #f8fafc; }
.pill.on { color: var(--danger); border-color: #f2a29b; background: #fff1f0; }
.pill.good { color: var(--ok); border-color: #9fd6b8; background: #effaf3; }
.pill.warn { color: var(--warn); border-color: #f4d18b; background: #fff8e6; }
.mono { font-family: Consolas, "SFMono-Regular", monospace; }
@media (max-width: 760px) {
  header { height: auto; min-height: 58px; align-items: flex-start; flex-direction: column; gap: 4px; padding: 12px; }
  main { padding: 12px; }
  .group { width: 100%; justify-content: space-between; }
  input[type="text"] { min-width: 0; width: 100%; }
}
</style>
</head>
<body>
<header>
  <h1>Context Menu Triage</h1>
  <div class="status" id="summary"></div>
</header>
<main>
  <div class="banner" id="adminBanner">Administrator terminal required for disable, enable, and import actions. Browsing and classic menu changes remain available.</div>
  <div class="toolbar">
    <div class="group">
      <label><input type="checkbox" id="showAll"> Show all</label>
      <button id="refresh">Refresh</button>
    </div>
    <div class="group">
      <strong>Menu</strong>
      <button id="classicToggle" class="primary">Loading</button>
    </div>
    <div class="group">
      <input id="filePath" type="text" placeholder="snapshot.json">
      <button id="exportBtn">Export</button>
      <button id="importBtn">Import</button>
    </div>
    <div class="group">
      <button id="restartBtn" class="danger" style="display:none">Restart Explorer</button>
    </div>
  </div>
  <div class="status" id="status"></div>
  <div class="table-wrap">
    <table>
      <thead><tr><th class="pub">Publisher</th><th class="sig">Signature</th><th class="blocked">Blocked</th><th class="name">Name</th><th class="dll">DLL</th><th class="action">Action</th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </div>
</main>
<script>
const apiToken = ${JSON.stringify(token)};
let handlers = [];
let conflicts = [];
let admin = false;
let classic = false;
let dirty = false;

const el = id => document.getElementById(id);
const basename = p => p ? p.split(/[\\\\/]/).pop() : '';
const setStatus = (msg, kind) => { const s = el('status'); s.textContent = msg || ''; s.className = 'status ' + (kind || ''); };

async function api(path, options) {
  options = options || {};
  options.headers = Object.assign({}, options.headers || {}, { 'X-Triage-Token': apiToken });
  const res = await fetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || res.statusText);
    err.body = body;
    throw err;
  }
  return body;
}

async function load() {
  setStatus('Loading');
  [admin, classic, handlers, conflicts] = await Promise.all([
    api('/api/admin').then(x => x.admin),
    api('/api/classic-menu').then(x => x.enabled),
    api('/api/handlers'),
    api('/api/conflicts')
  ]);
  el('adminBanner').classList.toggle('show', !admin);
  el('classicToggle').textContent = classic ? 'Use Win11 menu' : 'Use classic menu';
  render();
  setStatus('Ready', 'ok');
}

function conflictMap() {
  const m = new Map();
  for (const c of conflicts) {
    for (const clsid of c.affectedClsids || []) {
      const list = m.get(clsid) || [];
      list.push(c);
      m.set(clsid, list);
    }
  }
  return m;
}

function render() {
  const showAll = el('showAll').checked;
  const rows = handlers.filter(r => showAll || r.thirdParty);
  const cm = conflictMap();
  el('summary').textContent = handlers.length + ' handlers, ' + handlers.filter(r => r.thirdParty).length + ' third-party, ' + handlers.filter(r => r.orphan).length + ' orphaned';
  el('restartBtn').style.display = dirty ? '' : 'none';
  el('rows').innerHTML = rows.map(r => {
    const sigClass = r.orphan ? 'on' : r.trusted ? 'good' : r.sigStatus === 'Valid' ? 'warn' : 'on';
    const notes = (cm.get(r.clsid) || []).map(c => '<div class="conflict">' + esc(c.severity) + ': ' + esc(c.note || c.id) + ' (' + esc(c.confidence) + ', ' + (c.definite ? 'definite' : 'unverified') + ') ' + link(c.source) + '</div>').join('');
    const blocked = r.blocked ? '<span class="pill on">blocked</span>' : '<span class="pill">active</span>';
    const action = r.blocked
      ? '<button data-unblock="' + esc(r.clsid) + '"' + (admin ? '' : ' disabled') + '>Enable</button>'
      : '<button data-block="' + esc(r.clsid) + '"' + (admin ? '' : ' disabled') + '>Disable</button>';
    return '<tr><td class="pub">' + esc(r.pub) + '</td><td class="sig"><span class="pill ' + sigClass + '">' + esc(r.sigStatus) + '</span><div class="mono">' + esc(r.reason || '') + '</div></td><td class="blocked">' + blocked + '</td><td class="name">' + esc(r.name || r.label || r.clsid) + notes + '<div class="mono">' + esc(r.clsid) + '</div></td><td class="dll">' + esc(basename(r.dll) || (r.orphan ? 'MISSING' : '')) + '</td><td class="action">' + action + '</td></tr>';
  }).join('');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function link(url) {
  if (!/^https?:\\/\\//.test(url || '')) return esc(url || '');
  return '<a href="' + esc(url) + '" target="_blank" rel="noreferrer">source</a>';
}

document.addEventListener('click', async e => {
  const block = e.target.getAttribute('data-block');
  const unblock = e.target.getAttribute('data-unblock');
  try {
    if (block) {
      const row = handlers.find(r => r.clsid === block);
      await api('/api/block', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ clsid: block, name: row && (row.name || row.label) }) });
      dirty = true; await load(); return;
    }
    if (unblock) {
      await api('/api/unblock', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ clsid: unblock }) });
      dirty = true; await load(); return;
    }
  } catch (err) { setStatus(err.message, 'error'); }
});

el('showAll').addEventListener('change', render);
el('refresh').addEventListener('click', load);
el('classicToggle').addEventListener('click', async () => {
  try {
    await api('/api/classic-menu', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ enabled: !classic }) });
    dirty = true; await load();
  } catch (err) { setStatus(err.message, 'error'); }
});
el('exportBtn').addEventListener('click', async () => {
  try {
    const out = await api('/api/export', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ file: el('filePath').value.trim() || undefined }) });
    el('filePath').value = out.file;
    setStatus('Exported ' + out.count + ' handlers', 'ok');
  } catch (err) { setStatus(err.message, 'error'); }
});
el('importBtn').addEventListener('click', async () => {
  try {
    const file = el('filePath').value.trim();
    if (!file) throw new Error('Choose a snapshot file');
    const out = await api('/api/import', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ file }) });
    dirty = dirty || out.blocked || out.unblocked;
    await load();
    setStatus('Imported: ' + out.blocked + ' blocked, ' + out.unblocked + ' unblocked', 'ok');
  } catch (err) { setStatus(err.message, 'error'); }
});
el('restartBtn').addEventListener('click', async () => {
  try {
    await api('/api/restart-explorer', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' });
    dirty = false; render(); setStatus('Explorer restarted', 'ok');
  } catch (err) { setStatus(err.message, 'error'); }
});
load().catch(err => setStatus(err.message, 'error'));
</script>
</body>
</html>`;
}

function startGui(args) {
  const portIndex = args.indexOf('--port');
  const port = portIndex >= 0 ? parseInt(args[portIndex + 1], 10) : 7373;
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('valid --port required');
  const noOpen = args.includes('--no-open');
  const host = '127.0.0.1';
  const token = crypto.randomBytes(24).toString('hex');
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${host}:${port}`);
      if (url.pathname === '/' && req.method === 'GET') {
        const html = guiHtml(token);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(html),
          'Cache-Control': 'no-store',
        });
        res.end(html);
        return;
      }
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url.pathname, token);
      sendJson(res, 404, { error: 'not found' });
    } catch (e) {
      sendJson(res, e.status || (e.body && e.body.needsAdmin ? 403 : 500), { error: e.message || String(e), needsAdmin: !!(e.body && e.body.needsAdmin) });
    }
  });
  server.listen(port, host, () => {
    const url = `http://${host}:${port}/?t=${token}`;
    console.log(grn(`\n  GUI listening: ${url}`));
    console.log(dim('  press Ctrl+C to stop.\n'));
    if (!noOpen) {
      try { execFileSync('cmd', ['/c', 'start', '', url], { stdio: 'ignore' }); } catch {}
    }
  });
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
  if (cmd === 'classic-menu') return classicMenu(args, apply);
  if (cmd === 'import') return importSnapshot(args[1], apply);
  if (cmd === 'gui' || cmd === 'serve') return startGui(args);
  if (cmd === 'conflicts') {
    const rows = enumerate();
    console.log(JSON.stringify(computeConflicts(rows), null, 2));
    return;
  }

  if (cmd === 'block' || cmd === 'unblock') {
    if (!args[1]) fail(`${cmd} needs a row number or {CLSID}`);
    return block(args[1], apply, cmd === 'block');
  }
  if (cmd === 'export') {
    const snapshot = writeSnapshot(args[1]);
    console.log(grn(`\n  snapshot written: ${snapshot.file}  (${snapshot.rows.length} handlers)`));
    console.log(dim('  keep this. it is your one-file rollback record.\n'));
    return;
  }
  // default: list
  const rows = enumerate();
  if (asJson) { fs.writeFileSync(CACHE, JSON.stringify(rows)); console.log(JSON.stringify(rows, null, 2)); return; }
  render(rows, showAll);
}
main();
