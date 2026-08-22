'use strict';

module.exports = function guiHtml(token) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Context Menu Triage</title>
<style>
:root {
  color-scheme:light;
  --bg:#e9edef; --bg-grad:#dfe5e8; --panel:#ffffff; --panel-2:#f4f7f8;
  --line:#ccd4d8; --row-line:#e2e7ea; --row-hover:#f2f6f7;
  --text:#141d21; --muted:#5a686e; --faint:#8a969b;
  --danger:#b3261e; --on-danger:#fff; --warn:#8a5a00; --ok:#0a7d70;
  --accent:#0f6b83; --accent-2:#12869e; --on-accent:#fff; --accent-soft:#e3eef1;
  --ink:#1f2c31;
  --blocked-bg:#fdeeed; --good-bg:#e9f7f2; --warn-bg:#fff5e2; --pill-bg:#eef3f4;
  --radius:9px; --radius-sm:6px;
  --shadow:0 1px 2px rgba(20,29,33,.06),0 8px 24px rgba(20,29,33,.06);
  --shadow-row:0 1px 0 rgba(20,29,33,.03);
}
:root[data-theme="dark"] { color-scheme:dark;
  --bg:#0e1213; --bg-grad:#141a1c; --panel:#181e20; --panel-2:#1e2528;
  --line:#333f43; --row-line:#28312f; --row-hover:#20282a;
  --text:#eaf1f1; --muted:#9fabad; --faint:#6d7a7d;
  --danger:#ff8b82; --on-danger:#2a0806; --warn:#f4c56a; --ok:#5fd6bf;
  --accent:#4fc3db; --accent-2:#67d4ea; --on-accent:#052229; --accent-soft:#123037;
  --ink:#cdd8d9;
  --blocked-bg:#3a2120; --good-bg:#123029; --warn-bg:#352b16; --pill-bg:#222a2c;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 10px 30px rgba(0,0,0,.35);
  --shadow-row:0 1px 0 rgba(0,0,0,.2);
}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){ color-scheme:dark;
  --bg:#0e1213; --bg-grad:#141a1c; --panel:#181e20; --panel-2:#1e2528;
  --line:#333f43; --row-line:#28312f; --row-hover:#20282a;
  --text:#eaf1f1; --muted:#9fabad; --faint:#6d7a7d;
  --danger:#ff8b82; --on-danger:#2a0806; --warn:#f4c56a; --ok:#5fd6bf;
  --accent:#4fc3db; --accent-2:#67d4ea; --on-accent:#052229; --accent-soft:#123037;
  --ink:#cdd8d9;
  --blocked-bg:#3a2120; --good-bg:#123029; --warn-bg:#352b16; --pill-bg:#222a2c;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 10px 30px rgba(0,0,0,.35);
  --shadow-row:0 1px 0 rgba(0,0,0,.2);
}}
* { box-sizing:border-box; }
html,body { height:100%; }
body {
  margin:0; overflow:hidden;
  font-family:"Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;
  font-size:13px; color:var(--text);
  background:radial-gradient(1200px 600px at 100% -10%,var(--accent-soft),transparent 60%),linear-gradient(180deg,var(--bg-grad),var(--bg));
}
.mono { font-family:"Cascadia Mono","Cascadia Code",Consolas,"SFMono-Regular",monospace; }
.app { display:flex; flex-direction:column; height:100vh; }
button,input,select { font:inherit; color:var(--text); }
button { cursor:pointer; }
:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:4px; }

/* ---- top bar ---- */
.topbar {
  flex:0 0 auto; display:grid; grid-template-columns:minmax(0,auto) 1fr auto;
  align-items:center; gap:14px;
  padding:11px 16px; background:var(--panel); border-bottom:1px solid var(--line);
  box-shadow:var(--shadow-row);
}
.brand { display:flex; align-items:center; gap:11px; min-width:0; }
.brand .txt { min-width:0; }
.logo {
  width:30px; height:30px; flex:0 0 auto; border-radius:8px;
  display:grid; place-items:center; color:var(--on-accent);
  background:linear-gradient(145deg,var(--accent-2),var(--accent));
  box-shadow:0 2px 6px rgba(15,107,131,.35); font-weight:700;
}
.brand h1 {
  margin:0; font-family:Bahnschrift,"Segoe UI Variable Display","Segoe UI",sans-serif;
  font-size:17px; font-weight:600; letter-spacing:.2px; line-height:1.15;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.ver { display:block; font-size:11px; color:var(--faint); letter-spacing:.3px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.stats { display:flex; gap:7px; flex-wrap:wrap; justify-content:center; min-width:0; overflow:hidden; }
.stat { display:inline-flex; align-items:baseline; gap:5px; padding:4px 9px; border:1px solid var(--line);
  background:var(--panel-2); border-radius:20px; font-size:11.5px; color:var(--muted); white-space:nowrap; }
.stat b { font-size:13px; color:var(--text); font-variant-numeric:tabular-nums; }
.stat.warn b { color:var(--warn); } .stat.accent b { color:var(--accent); }
.top-actions { display:flex; align-items:center; gap:8px; justify-content:flex-end; }

/* ---- generic controls ---- */
.iconbtn {
  flex:0 0 auto; display:inline-grid; place-items:center; width:34px; height:34px; padding:0;
  border:1px solid var(--line); background:var(--panel-2); border-radius:8px; color:var(--muted);
  transition:background .12s,color .12s,border-color .12s;
}
.iconbtn:hover { color:var(--text); border-color:var(--ink); background:var(--panel); }
.iconbtn svg { width:17px; height:17px; }
.chip {
  display:inline-flex; align-items:center; gap:6px; height:34px; padding:0 11px;
  border:1px solid var(--line); background:var(--panel-2); border-radius:8px; color:var(--muted); font-size:12px;
}
.chip svg { width:15px; height:15px; }
.chip.admin-yes { color:var(--ok); border-color:color-mix(in srgb,var(--ok) 45%,var(--line)); background:var(--good-bg); }
.chip.admin-no { color:var(--warn); border-color:color-mix(in srgb,var(--warn) 45%,var(--line)); background:var(--warn-bg); cursor:pointer; }

/* ---- controls: a stable filters row + actions row ---- */
.controls {
  flex:0 0 auto; display:flex; flex-direction:column; gap:8px;
  padding:10px 16px; background:var(--panel); border-bottom:1px solid var(--line);
}
.filters, .actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.search { position:relative; flex:1 1 240px; min-width:200px; }
.search svg { position:absolute; left:10px; top:50%; transform:translateY(-50%); width:16px; height:16px; color:var(--faint); pointer-events:none; }
.search input { width:100%; height:36px; padding:0 12px 0 33px; border:1px solid var(--line); border-radius:9px; background:var(--panel-2); }
.search input::placeholder { color:var(--faint); }
select {
  flex:0 0 auto; width:158px; height:36px; padding:0 34px 0 12px;
  border:1px solid var(--line); border-radius:9px; background:var(--panel-2);
  appearance:none; background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' fill='none' stroke='%237a8489' stroke-width='1.6' stroke-linecap='round'/></svg>");
  background-repeat:no-repeat; background-position:right 12px center; color:var(--muted);
  text-overflow:ellipsis;
}
select:hover { color:var(--text); border-color:var(--ink); }
.segmented { flex:0 0 auto; display:inline-flex; border:1px solid var(--line); border-radius:9px; overflow:hidden; background:var(--panel-2); }
.segmented button { height:36px; padding:0 12px; border:0; background:transparent; color:var(--muted); font-size:12px; white-space:nowrap; }
.segmented button + button { border-left:1px solid var(--line); }
.segmented button[aria-pressed="true"] { background:var(--accent); color:var(--on-accent); font-weight:600; }
.txtbtn { flex:0 0 auto; height:36px; padding:0 12px; border:1px solid var(--line); border-radius:9px; background:var(--panel-2); color:var(--muted); display:inline-flex; align-items:center; gap:7px; font-size:12px; white-space:nowrap; }
.txtbtn:hover { color:var(--text); border-color:var(--ink); background:var(--panel); }
.txtbtn svg { width:15px; height:15px; }
.txtbtn.warn { color:var(--danger); border-color:color-mix(in srgb,var(--danger) 40%,var(--line)); }
.spacer { flex:1 1 auto; }

/* ---- banner + status ---- */
.banner { display:none; margin:10px 16px 0; padding:9px 12px; border-radius:9px;
  border:1px solid color-mix(in srgb,var(--warn) 45%,var(--line)); background:var(--warn-bg); color:var(--warn);
  align-items:center; gap:12px; font-size:12.5px; }
.banner.show { display:flex; }
.banner button { margin-left:auto; }
.status { flex:0 0 auto; min-height:18px; padding:6px 16px 0; font-size:12px; color:var(--muted); }
.status.ok { color:var(--ok); } .status.error { color:var(--danger); }

/* ---- list ---- */
.listwrap { flex:1 1 auto; min-height:0; position:relative; padding:10px 16px 16px; }
.list { height:100%; overflow-y:auto; overflow-x:hidden; border:1px solid var(--line); border-radius:12px;
  background:var(--panel); box-shadow:var(--shadow); }
.list::-webkit-scrollbar { width:0; height:0; }
.list { scrollbar-width:none; }
.row {
  display:grid; align-items:center; gap:14px;
  grid-template-columns:4px minmax(0,2.3fr) minmax(0,1.25fr) minmax(0,1.7fr) auto;
  padding:11px 14px 11px 0; border-bottom:1px solid var(--row-line); position:relative;
}
.row:last-child { border-bottom:0; }
.row:hover { background:var(--row-hover); }
.rail { width:4px; align-self:stretch; border-radius:0 3px 3px 0; background:var(--faint); }
.row.blocked .rail { background:var(--danger); }
.row.stale .rail { background:var(--warn); }
.row.ok .rail { background:var(--ok); }
.cell { min-width:0; }
.hname { font-weight:600; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.hsub { margin-top:2px; font-size:11px; color:var(--faint); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pub { font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dllpath { margin-top:2px; font-size:11px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.comstate { font-size:11px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.4px; }
.pill { display:inline-block; padding:2px 8px; border-radius:20px; border:1px solid var(--line); background:var(--pill-bg);
  font-size:11px; font-weight:600; white-space:nowrap; }
.pill.good { color:var(--ok); border-color:color-mix(in srgb,var(--ok) 45%,var(--line)); background:var(--good-bg); }
.pill.warn { color:var(--warn); border-color:color-mix(in srgb,var(--warn) 45%,var(--line)); background:var(--warn-bg); }
.pill.on { color:var(--danger); border-color:color-mix(in srgb,var(--danger) 45%,var(--line)); background:var(--blocked-bg); }
.trust { margin-top:4px; }
.act { display:flex; flex-direction:column; align-items:flex-end; gap:4px; justify-self:end; }
.actbtn { min-width:96px; height:32px; padding:0 14px; border-radius:8px; border:1px solid var(--line); background:var(--panel-2);
  font-size:12px; font-weight:600; color:var(--text); transition:background .12s,border-color .12s,transform .06s; }
.actbtn:hover:not(:disabled) { border-color:var(--ink); background:var(--panel); }
.actbtn:active:not(:disabled) { transform:translateY(1px); }
.actbtn.disable { color:var(--danger); border-color:color-mix(in srgb,var(--danger) 40%,var(--line)); }
.actbtn.enable { color:var(--ok); border-color:color-mix(in srgb,var(--ok) 40%,var(--line)); }
.actbtn:disabled { opacity:.5; cursor:not-allowed; }
.actbtn.busy { color:transparent; position:relative; }
.actbtn.busy::after { content:""; position:absolute; inset:0; margin:auto; width:15px; height:15px; border-radius:50%;
  border:2px solid color-mix(in srgb,var(--text) 30%,transparent); border-top-color:var(--text); animation:spin .6s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
.rowmsg { font-size:11px; font-weight:600; height:14px; white-space:nowrap; }
.rowmsg.ok { color:var(--ok); } .rowmsg.error { color:var(--danger); }
.flash { animation:flash 1.1s ease-out; }
@keyframes flash { 0% { background:var(--accent-soft); } 100% { background:transparent; } }
.expand { margin-top:6px; }
.expand summary { display:inline-flex; align-items:center; gap:5px; cursor:pointer; color:var(--accent);
  font-size:11px; font-weight:600; user-select:none; list-style:none; width:max-content; }
.expand summary::-webkit-details-marker { display:none; }
.expand summary svg { width:12px; height:12px; transition:transform .15s; }
.expand[open] summary svg { transform:rotate(90deg); }
.evidence { margin-top:8px; padding:10px 12px; border:1px solid var(--row-line); border-radius:8px; background:var(--panel-2); }
.reg { padding:6px 0; border-bottom:1px dashed var(--row-line); font-size:11px; word-break:break-all; }
.reg:last-child { border-bottom:0; } .reg b { color:var(--muted); font-weight:600; }
.conflict { margin-top:6px; font-size:11.5px; color:var(--warn); line-height:1.4; }
.conflict a { color:var(--accent); }
.empty { padding:48px 20px; text-align:center; color:var(--faint); }
.empty svg { width:34px; height:34px; opacity:.5; margin-bottom:10px; }

@media(max-width:1040px) { .stats { display:none; } }
@media(max-width:600px) { .chip-label { display:none; } .chip { padding:0 9px; } }
@media(max-width:840px) {
  .row { grid-template-columns:4px 1fr auto; row-gap:8px; }
  .cell.pubcell { grid-column:2; } .cell.dllcell { grid-column:2; } .act { grid-column:3; grid-row:1/span 3; }
}
</style>
</head>
<body>
<div class="app">
  <header class="topbar">
    <div class="brand">
      <span class="logo" id="logo">CT</span>
      <div class="txt"><h1>Context Menu Triage</h1><span class="ver" id="version"></span></div>
    </div>
    <div class="stats" id="summary"></div>
    <div class="top-actions">
      <button class="chip" id="adminChip" type="button" title="Administrator status"></button>
      <button class="iconbtn" id="themeBtn" type="button" title="Theme" aria-label="Theme"></button>
    </div>
  </header>

  <div class="controls">
    <div class="filters">
      <div class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
        <input id="search" type="search" placeholder="Search handler, CLSID, publisher, DLL, registry key" aria-label="Search">
      </div>
      <select id="publisher" aria-label="Publisher"><option value="">All publishers</option></select>
      <select id="signature" aria-label="Trust"><option value="">All trust</option></select>
      <select id="hive" aria-label="Hive"><option value="">HKLM + HKCU</option><option>HKLM</option><option>HKCU</option></select>
      <select id="view" aria-label="Bitness"><option value="">32 + 64 bit</option><option value="64">64 bit</option><option value="32">32 bit</option></select>
      <select id="state" aria-label="COM state"><option value="">All COM states</option><option value="present">Present</option><option value="missing-clsid">Missing CLSID</option><option value="missing-inproc">Missing InprocServer32</option><option value="missing-dll">Missing DLL</option></select>
    </div>
    <div class="actions">
      <div class="segmented" role="group" aria-label="Scope">
        <button id="showAll" type="button" aria-pressed="false" title="Include Microsoft/system handlers">Show all</button>
        <button id="fullScan" type="button" aria-pressed="false" title="Full scan walks every file type and system handler (slower)">Full scan</button>
      </div>
      <button class="txtbtn" id="classicToggle" type="button" title="Toggle Windows 11 vs classic right-click menu">Windows menu</button>
      <span class="spacer"></span>
      <button class="iconbtn" id="refresh" type="button" title="Rescan" aria-label="Rescan">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v5h-5"/></svg>
      </button>
      <button class="txtbtn" id="exportBtn" type="button" title="Save a snapshot of every handler's state that you can restore later">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/></svg>Back up</button>
      <button class="txtbtn" id="importBtn" type="button" title="Restore handler states from a saved snapshot">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M4 21h16"/></svg>Restore</button>
      <button class="txtbtn warn" id="restartBtn" type="button" style="display:none" title="Restart Explorer to apply changes">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v5h-5"/></svg>Restart Explorer</button>
    </div>
  </div>

  <input id="filePath" type="hidden">
  <div class="banner" id="adminBanner">Administrator rights are required to disable, enable, or import handlers.<button class="txtbtn" id="elevateBtn" type="button">Relaunch as administrator</button></div>
  <div class="status" id="status"></div>

  <div class="listwrap"><div class="list" id="rows"></div></div>
</div>

<script>
const apiToken=${JSON.stringify(token)};
var handlers=[],conflicts=[],admin=false,classic=false,dirty=false,meta={},rowState={};
const el=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

/* theme: single click-through System -> Light -> Dark */
const ICON_AUTO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/></svg>';
const ICON_SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8"/></svg>';
const ICON_MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z"/></svg>';
const CHEV='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
const themeOrder=['system','light','dark'],themeLabel={system:'Theme: System',light:'Theme: Light',dark:'Theme: Dark'},themeIcon={system:ICON_AUTO,light:ICON_SUN,dark:ICON_MOON};
var theme='system';
function applyTheme(t){theme=themeOrder.indexOf(t)>=0?t:'system';if(theme==='system')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',theme);el('themeBtn').innerHTML=themeIcon[theme];el('themeBtn').title=themeLabel[theme];try{localStorage.setItem('triage-theme',theme);}catch(e){}}
try{applyTheme(localStorage.getItem('triage-theme')||'system');}catch(e){applyTheme('system');}
el('themeBtn').addEventListener('click',()=>applyTheme(themeOrder[(themeOrder.indexOf(theme)+1)%themeOrder.length]));

const setStatus=(msg,kind)=>{const n=el('status');n.textContent=msg||'';n.className='status '+(kind||'');};
async function api(route,options){options=options||{};options.headers=Object.assign({},options.headers||{},{'X-Triage-Token':apiToken});const r=await fetch(route,options);const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||r.statusText);return b;}
function jpost(route,body){return api(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});}

var loadTimer=null;
async function load(){const t0=Date.now();if(loadTimer)clearInterval(loadTimer);const tick=()=>{const s=Math.round((Date.now()-t0)/1000);setStatus('Scanning the registry and verifying signatures\\u2026 '+s+'s. The first full scan can take up to a minute; later scans are cached.');};tick();loadTimer=setInterval(tick,1000);
  try{[admin,classic,handlers,conflicts,meta]=await Promise.all([api('/api/admin').then(x=>x.admin),api('/api/classic-menu').then(x=>x.enabled),api('/api/handlers'),api('/api/conflicts'),api('/api/meta')]);}
  finally{clearInterval(loadTimer);loadTimer=null;}
  rowState={};
  el('adminBanner').classList.toggle('show',!admin);
  el('version').textContent='v'+meta.version+'  \\u00b7  '+(meta.scope==='all'?'full scan':'fast scan');
  el('classicToggle').textContent=classic?'Use Windows 11 menu':'Use classic menu';
  el('fullScan').setAttribute('aria-pressed',meta.scope==='all'?'true':'false');
  renderAdmin();populateFilters();render();setStatus('Ready \\u00b7 '+handlers.length+' handlers','ok');}

function renderAdmin(){const c=el('adminChip');if(admin){c.className='chip admin-yes';c.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg><span class="chip-label">Administrator</span>';c.title='Running with administrator rights';}else{c.className='chip admin-no';c.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0"/></svg><span class="chip-label">Standard \\u2014 elevate</span>';c.title='Click to relaunch as administrator';}}

function populateFilters(){const fill=(id,vals,label)=>{const cur=el(id).value;el(id).innerHTML='<option value="">'+label+'</option>'+vals.map(v=>'<option>'+esc(v)+'</option>').join('');el(id).value=cur;};fill('publisher',[...new Set(handlers.map(r=>r.pub).filter(Boolean))].sort(),'All publishers');fill('signature',[...new Set(handlers.map(r=>r.sigStatus).filter(Boolean))].sort(),'All trust');}
function conflictMap(){const m=new Map();for(const c of conflicts)for(const id of c.affectedClsids||[]){const l=m.get(id)||[];l.push(c);m.set(id,l);}return m;}
function visibleRows(){const q=el('search').value.trim().toLowerCase(),showAll=el('showAll').getAttribute('aria-pressed')==='true';return handlers.filter(r=>{if(!showAll&&r.isMs)return false;if(el('publisher').value&&r.pub!==el('publisher').value)return false;if(el('signature').value&&r.sigStatus!==el('signature').value)return false;if(el('hive').value&&!(r.registrations||[]).some(x=>x.hive===el('hive').value))return false;if(el('view').value&&!(r.registrations||[]).some(x=>x.view===el('view').value))return false;if(el('state').value&&r.comState!==el('state').value)return false;if(q){const t=[r.clsid,r.name,r.label,r.pub,r.dll,r.signer,r.reason].concat((r.registrations||[]).flatMap(x=>[x.hive,x.view,x.parent,x.key])).filter(Boolean).join(' ').toLowerCase();if(t.indexOf(q)<0)return false;}return true;});}
function srcLink(u){u=String(u||'');return (u.indexOf('https://')===0||u.indexOf('http://')===0)?'<a href="'+esc(u)+'" target="_blank" rel="noreferrer">source</a>':esc(u);}

function rowHtml(r,cmap){
  const st=rowState[r.clsid]||{},cls=r.blocked?'blocked':(r.orphan?'stale':'ok');
  const sigClass=r.orphan?'on':(r.sigStatus==='Valid'?'good':'warn');
  const conflicts=(cmap.get(r.clsid)||[]).map(c=>'<div class="conflict">'+esc(c.severity)+': '+esc(c.note||c.id)+' ('+esc(c.confidence)+', '+(c.definite?'definite':'unverified')+') '+srcLink(c.source)+'</div>').join('');
  const regs=(r.registrations||[]).map(x=>'<div class="reg mono"><b>'+esc(x.hive+' \\u00b7 '+x.view+'-bit \\u00b7 '+x.parent)+'</b><br>'+esc(x.key)+'</div>').join('');
  const nreg=(r.registrations||[]).length;
  const evid=nreg?'<details class="expand"><summary>'+CHEV+nreg+' registration'+(nreg===1?'':'s')+'</summary><div class="evidence">'+regs+'</div></details>':'';
  var btn;
  if(st.busy){btn='<button class="actbtn busy" disabled>\\u2026</button>';}
  else if(r.blocked){btn='<button class="actbtn enable" data-act="unblock" data-clsid="'+esc(r.clsid)+'"'+(admin?'':' disabled title="Requires administrator"')+'>Enable</button>';}
  else{btn='<button class="actbtn disable" data-act="block" data-clsid="'+esc(r.clsid)+'"'+(admin?'':' disabled title="Requires administrator"')+'>Disable</button>';}
  const msg=st.msg?'<div class="rowmsg '+(st.kind||'')+'">'+esc(st.msg)+'</div>':'<div class="rowmsg"></div>';
  return '<div class="row '+cls+(st.flash?' flash':'')+'" data-clsid="'+esc(r.clsid)+'">'+
    '<div class="rail"></div>'+
    '<div class="cell"><div class="hname">'+esc(r.name||r.label||r.clsid)+'</div><div class="hsub mono">'+esc(r.clsid)+'</div>'+conflicts+evid+'</div>'+
    '<div class="cell pubcell"><div class="pub">'+esc(r.pub||'Unknown')+'</div><div class="trust"><span class="pill '+sigClass+'">'+esc(r.sigStatus||'Unknown')+'</span></div></div>'+
    '<div class="cell dllcell"><div class="comstate">'+esc(r.comState||'')+'</div><div class="dllpath mono" title="'+esc(r.dll||'')+'">'+esc(r.dll||'not registered')+'</div></div>'+
    '<div class="act">'+btn+msg+'</div>'+
  '</div>';
}
function render(){
  const rows=visibleRows(),cmap=conflictMap();
  const third=handlers.filter(r=>r.thirdParty).length,stale=handlers.filter(r=>r.orphan).length,blk=handlers.filter(r=>r.blocked).length;
  el('summary').innerHTML='<span class="stat"><b>'+rows.length+'</b> shown</span><span class="stat"><b>'+handlers.length+'</b> handlers</span><span class="stat accent"><b>'+third+'</b> third-party</span><span class="stat warn"><b>'+stale+'</b> stale</span><span class="stat"><b>'+blk+'</b> blocked</span>';
  el('restartBtn').style.display=dirty?'':'none';
  el('rows').innerHTML=rows.length?rows.map(r=>rowHtml(r,cmap)).join(''):'<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></svg><div>No handlers match the current filters.</div></div>';
}

var backupNoticeShown=false;
function noteBackup(b){if(!b||backupNoticeShown)return;backupNoticeShown=true;const name=String(b).split(/[\\\\/]/).pop();setStatus('Backed up to '+name+' before the first change \\u2014 every change is reversible via Restore.','ok');}
async function toggle(clsid,act){
  const r=handlers.find(x=>x.clsid===clsid);if(!r)return;
  rowState[clsid]={busy:true};render();
  try{
    const res=(act==='block')?await jpost('/api/block',{clsid:clsid,name:r.name||r.label}):await jpost('/api/unblock',{clsid:clsid});
    r.blocked=(act==='block');dirty=true;
    rowState[clsid]={msg:act==='block'?'Disabled':'Enabled',kind:'ok',flash:true};
    noteBackup(res&&res.backup);
  }catch(e){rowState[clsid]={msg:(e.message||'Failed').replace(/\\.$/,''),kind:'error'};}
  render();
  setTimeout(()=>{if(rowState[clsid]&&!rowState[clsid].busy){delete rowState[clsid];render();}},4200);
}

/* events */
el('rows').addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b&&!b.disabled)toggle(b.getAttribute('data-clsid'),b.getAttribute('data-act'));});
['publisher','signature','hive','view','state'].forEach(id=>el(id).addEventListener('change',render));
el('search').addEventListener('input',render);
el('refresh').addEventListener('click',load);
el('showAll').addEventListener('click',e=>{const p=e.currentTarget.getAttribute('aria-pressed')==='true';e.currentTarget.setAttribute('aria-pressed',(!p).toString());render();});
el('fullScan').addEventListener('click',async e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';try{await jpost('/api/scope',{scope:on?'all':'broad'});await load();}catch(err){setStatus(err.message,'error');}});
el('adminChip').addEventListener('click',()=>{if(!admin)el('elevateBtn').click();});
el('elevateBtn').addEventListener('click',async()=>{try{const o=await jpost('/api/relaunch-admin',{});setStatus(o.alreadyAdmin?'Already running as administrator':'Administrator window requested on port '+o.port,'ok');}catch(e){setStatus(e.message,'error');}});
el('classicToggle').addEventListener('click',async()=>{try{await jpost('/api/classic-menu',{enabled:!classic});dirty=true;await load();}catch(e){setStatus(e.message,'error');}});
el('exportBtn').addEventListener('click',async()=>{try{const o=await jpost('/api/export',{file:el('filePath').value.trim()||undefined});el('filePath').value=o.file;setStatus('Backup saved: '+o.file+' ('+o.count+' handlers)','ok');}catch(e){setStatus(e.message,'error');}});
el('importBtn').addEventListener('click',async()=>{try{const f=el('filePath').value.trim()||'snapshot.json';if(!window.confirm('Apply blocked states from '+f+'?'))return;const o=await jpost('/api/import',{file:f});dirty=dirty||o.blocked||o.unblocked;await load();setStatus('Imported: '+o.blocked+' blocked, '+o.unblocked+' unblocked','ok');}catch(e){setStatus(e.message,'error');}});
el('restartBtn').addEventListener('click',async()=>{try{await jpost('/api/restart-explorer',{});dirty=false;render();setStatus('Explorer restarted','ok');}catch(e){setStatus(e.message,'error');}});

load().catch(e=>setStatus(e.message,'error'));
</script>
</body>
</html>`;
};
