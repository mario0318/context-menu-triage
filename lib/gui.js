'use strict';

module.exports = function guiHtml(token) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Context Menu Triage</title>
<style>
:root { color-scheme:light; --bg:#eef1f3; --panel:#fff; --line:#c9d0d5; --row-line:#dce1e4; --text:#172126; --muted:#5d6a70; --danger:#b3261e; --on-danger:#fff; --warn:#8a5a00; --ok:#08766b; --accent:#176b87; --on-accent:#fff; --ink:#26343a; --button:#fff; --button-hover:#f7f9fa; --field:#fff; --heading:#dde3e6; --heading-text:#334248; --subtle:#f1f3f4; --action-bar:#f5f7f8; --banner-bg:#fff8e4; --banner-text:#624300; --blocked-bg:#fff1f0; --good-bg:#effaf3; --warn-bg:#fff8e6; --pill-bg:#f8fafc; --backdrop:rgba(20,29,33,.45); }
:root[data-theme="dark"] { color-scheme:dark; --bg:#121516; --panel:#1b2021; --line:#3d484b; --row-line:#30393b; --text:#edf2f2; --muted:#a9b5b7; --danger:#ff8b82; --on-danger:#2a0806; --warn:#f4c56a; --ok:#61d2bd; --accent:#67c5d9; --on-accent:#08262c; --ink:#d6e0e1; --button:#252b2d; --button-hover:#30383a; --field:#15191a; --heading:#293133; --heading-text:#d9e2e3; --subtle:#15191a; --action-bar:#202627; --banner-bg:#332b18; --banner-text:#f7d990; --blocked-bg:#3b2221; --good-bg:#173129; --warn-bg:#382e18; --pill-bg:#252b2d; --backdrop:rgba(0,0,0,.68); }
@media(prefers-color-scheme:dark) { :root:not([data-theme="light"]) { color-scheme:dark; --bg:#121516; --panel:#1b2021; --line:#3d484b; --row-line:#30393b; --text:#edf2f2; --muted:#a9b5b7; --danger:#ff8b82; --on-danger:#2a0806; --warn:#f4c56a; --ok:#61d2bd; --accent:#67c5d9; --on-accent:#08262c; --ink:#d6e0e1; --button:#252b2d; --button-hover:#30383a; --field:#15191a; --heading:#293133; --heading-text:#d9e2e3; --subtle:#15191a; --action-bar:#202627; --banner-bg:#332b18; --banner-text:#f7d990; --blocked-bg:#3b2221; --good-bg:#173129; --warn-bg:#382e18; --pill-bg:#252b2d; --backdrop:rgba(0,0,0,.68); } }
* { box-sizing:border-box; }
body { margin:0; font-family:"Segoe UI",system-ui,sans-serif; color:var(--text); background:var(--bg); }
header { min-height:58px; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:10px 18px; border-bottom:3px solid var(--ink); background:var(--panel); }
.brand { display:flex; align-items:baseline; gap:10px; }
h1 { margin:0; font-family:Bahnschrift,"Arial Narrow",sans-serif; font-size:19px; font-weight:650; }
.version { color:var(--muted); font:12px Consolas,monospace; }
main { padding:12px 18px 22px; }
.toolbar { display:grid; grid-template-columns:auto auto minmax(390px,1fr); gap:8px; margin-bottom:8px; }
.filters { display:grid; grid-template-columns:minmax(220px,1fr) repeat(5,minmax(112px,auto)); gap:8px; padding:8px; border:1px solid var(--line); background:var(--panel); margin-bottom:8px; }
.group { display:inline-flex; align-items:center; gap:7px; padding:7px 8px; border:1px solid var(--line); background:var(--panel); border-radius:4px; min-height:44px; }
button,input,select { font:inherit; }
button { border:1px solid var(--line); background:var(--button); color:var(--text); border-radius:4px; padding:6px 10px; cursor:pointer; min-height:32px; white-space:nowrap; }
button:hover { border-color:var(--ink); background:var(--button-hover); }
button:focus-visible,input:focus-visible,select:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
button.primary { color:var(--on-accent); background:var(--accent); border-color:var(--accent); }
button.danger { color:var(--on-danger); background:var(--danger); border-color:var(--danger); }
button:disabled { opacity:.55; cursor:not-allowed; }
input[type="text"],input[type="search"],select { width:100%; min-width:0; border:1px solid var(--line); border-radius:4px; padding:6px 8px; min-height:34px; color:var(--text); background:var(--field); }
input[type="checkbox"] { accent-color:var(--accent); }
.theme-select { width:auto; min-width:82px; }
label { display:inline-flex; align-items:center; gap:7px; color:var(--muted); }
.banner { display:none; margin-bottom:8px; padding:8px 10px; border:1px solid #d7aa42; border-left:4px solid #d7aa42; background:var(--banner-bg); color:var(--banner-text); }
.banner.show { display:block; }
.banner button { margin-left:10px; }
.status { color:var(--muted); min-height:20px; font-size:13px; }
.status.error { color:var(--danger); }
.status.ok { color:var(--ok); }
.table-wrap { overflow:auto; border:1px solid var(--line); background:var(--panel); }
table { width:100%; border-collapse:collapse; min-width:1180px; table-layout:fixed; }
th,td { border-bottom:1px solid var(--row-line); padding:8px 9px; text-align:left; vertical-align:top; font-size:12.5px; }
th { position:sticky; top:0; background:var(--heading); z-index:1; font-size:11px; color:var(--heading-text); text-transform:uppercase; letter-spacing:0; }
tr:last-child td { border-bottom:0; }
.pub { width:150px; }.sig { width:145px; }.blocked { width:82px; }.action { width:88px; }.name { width:260px; }.dll { width:190px; color:var(--muted); word-break:break-word; }.evidence { width:330px; }
.conflict { margin-top:5px; color:var(--warn); font-size:12px; line-height:1.35; }
.pill { display:inline-block; min-width:62px; text-align:center; padding:2px 6px; border:1px solid var(--line); background:var(--pill-bg); }
.pill.on { color:var(--danger); border-color:#a75a55; background:var(--blocked-bg); }.pill.good { color:var(--ok); border-color:#468f70; background:var(--good-bg); }.pill.warn { color:var(--warn); border-color:#9e7938; background:var(--warn-bg); }
.mono { font-family:Consolas,"SFMono-Regular",monospace; font-size:11.5px; line-height:1.4; }
details summary { cursor:pointer; color:var(--accent); user-select:none; }
.registration { margin-top:5px; padding-top:5px; border-top:1px solid var(--row-line); word-break:break-all; }
dialog { width:min(700px,calc(100vw - 28px)); border:1px solid var(--ink); border-top:4px solid var(--ink); border-radius:4px; padding:0; color:var(--text); background:var(--panel); }
dialog::backdrop { background:var(--backdrop); }
.dialog-body { padding:16px; }.dialog-body h2 { margin:0 0 10px; font:650 17px Bahnschrift,sans-serif; }.dialog-body pre { max-height:330px; overflow:auto; white-space:pre-wrap; padding:10px; color:var(--text); background:var(--subtle); border:1px solid var(--line); font:11.5px/1.45 Consolas,monospace; }
.dialog-actions { display:flex; justify-content:flex-end; gap:8px; padding:10px 16px; border-top:1px solid var(--line); background:var(--action-bar); }
@media(max-width:900px) { .toolbar,.filters { grid-template-columns:1fr; }.group { width:100%; } header { align-items:flex-start; flex-direction:column; } main { padding:10px; } }
</style>
</head>
<body>
<header><div class="brand"><h1>Context Menu Triage</h1><span class="version" id="version"></span></div><div class="status" id="summary"></div></header>
<main>
  <div class="banner" id="adminBanner">Administrator rights required for disable, enable, and import.<button id="elevateBtn">Relaunch as administrator</button></div>
  <div class="toolbar">
    <div class="group"><label><input type="checkbox" id="showAll"> Show all</label><button id="refresh">Refresh</button><label>Theme <select id="theme" class="theme-select" aria-label="Theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div>
    <div class="group"><span>Windows menu</span><button id="classicToggle" class="primary">Loading</button></div>
    <div class="group"><input id="filePath" type="text" placeholder="snapshot.json"><button id="exportBtn">Export</button><button id="importBtn">Import</button><button id="restartBtn" class="danger" style="display:none">Restart Explorer</button></div>
  </div>
  <div class="filters">
    <input id="search" type="search" placeholder="Search CLSID, publisher, DLL, registry key">
    <select id="publisher"><option value="">All publishers</option></select>
    <select id="signature"><option value="">All signatures</option></select>
    <select id="hive"><option value="">HKLM + HKCU</option><option>HKLM</option><option>HKCU</option></select>
    <select id="view"><option value="">32 + 64 bit</option><option value="64">64 bit</option><option value="32">32 bit</option></select>
    <select id="state"><option value="">All COM states</option><option value="present">Present</option><option value="missing-clsid">Missing CLSID</option><option value="missing-inproc">Missing InprocServer32</option><option value="missing-dll">Missing DLL</option></select>
  </div>
  <div class="status" id="status"></div>
  <div class="table-wrap"><table><thead><tr><th class="pub">Publisher</th><th class="sig">Trust</th><th class="blocked">State</th><th class="name">Handler</th><th class="dll">COM server</th><th class="evidence">Registration evidence</th><th class="action">Action</th></tr></thead><tbody id="rows"></tbody></table></div>
</main>
<dialog id="confirmDialog"><div class="dialog-body"><h2 id="confirmTitle">Confirm change</h2><pre id="confirmEvidence"></pre></div><div class="dialog-actions"><button id="confirmCancel">Cancel</button><button id="confirmApply" class="danger">Apply</button></div></dialog>
<script>
const apiToken=${JSON.stringify(token)};
let handlers=[],conflicts=[],admin=false,classic=false,dirty=false,meta={};
const el=id=>document.getElementById(id);
function setTheme(theme){const choice=['system','light','dark'].includes(theme)?theme:'system';if(choice==='system')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',choice);el('theme').value=choice;try{localStorage.setItem('triage-theme',choice);}catch{}}
let savedTheme='system';try{savedTheme=localStorage.getItem('triage-theme')||'system';}catch{}setTheme(savedTheme);
const setStatus=(msg,kind)=>{const node=el('status');node.textContent=msg||'';node.className='status '+(kind||'');};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
async function api(route,options={}){options.headers=Object.assign({},options.headers||{}, {'X-Triage-Token':apiToken});const response=await fetch(route,options);const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||response.statusText);return body;}
async function load(){setStatus('Loading');[admin,classic,handlers,conflicts,meta]=await Promise.all([api('/api/admin').then(x=>x.admin),api('/api/classic-menu').then(x=>x.enabled),api('/api/handlers'),api('/api/conflicts'),api('/api/meta')]);el('adminBanner').classList.toggle('show',!admin);el('version').textContent='v'+meta.version+' / '+meta.scope;el('classicToggle').textContent=classic?'Use Windows 11 menu':'Use classic menu';populateFilters();render();setStatus('Ready','ok');}
function populateFilters(){const fill=(id,values,label)=>{const current=el(id).value;el(id).innerHTML='<option value="">'+label+'</option>'+values.map(v=>'<option>'+esc(v)+'</option>').join('');el(id).value=current;};fill('publisher',[...new Set(handlers.map(r=>r.pub))].sort(),'All publishers');fill('signature',[...new Set(handlers.map(r=>r.sigStatus))].sort(),'All signatures');}
function conflictMap(){const map=new Map();for(const conflict of conflicts)for(const clsid of conflict.affectedClsids||[]){const list=map.get(clsid)||[];list.push(conflict);map.set(clsid,list);}return map;}
function visibleRows(){const query=el('search').value.trim().toLowerCase();return handlers.filter(r=>{if(!el('showAll').checked&&r.isMs)return false;if(el('publisher').value&&r.pub!==el('publisher').value)return false;if(el('signature').value&&r.sigStatus!==el('signature').value)return false;if(el('hive').value&&!(r.registrations||[]).some(x=>x.hive===el('hive').value))return false;if(el('view').value&&!(r.registrations||[]).some(x=>x.view===el('view').value))return false;if(el('state').value&&r.comState!==el('state').value)return false;if(query){const text=[r.clsid,r.name,r.label,r.pub,r.dll,r.signer,r.reason].concat((r.registrations||[]).flatMap(x=>[x.hive,x.view,x.parent,x.key])).filter(Boolean).join(' ').toLowerCase();if(!text.includes(query))return false;}return true;});}
function sourceLink(url){const value=String(url||'');return (value.startsWith('https://')||value.startsWith('http://'))?'<a href="'+esc(value)+'" target="_blank" rel="noreferrer">source</a>':esc(value);}
function render(){const rows=visibleRows(),map=conflictMap();el('summary').textContent=rows.length+' shown / '+handlers.length+' handlers | '+handlers.filter(r=>r.thirdParty).length+' third-party | '+handlers.filter(r=>r.orphan).length+' stale';el('restartBtn').style.display=dirty?'':'none';el('rows').innerHTML=rows.map(r=>{const sigClass=r.orphan?'on':r.sigStatus==='Valid'?'good':'warn';const notes=(map.get(r.clsid)||[]).map(c=>'<div class="conflict">'+esc(c.severity)+': '+esc(c.note||c.id)+' ('+esc(c.confidence)+', '+(c.definite?'definite':'unverified')+') '+sourceLink(c.source)+'</div>').join('');const blocked=r.blocked?'<span class="pill on">blocked</span>':'<span class="pill">active</span>';const action=r.blocked?'<button data-unblock="'+esc(r.clsid)+'"'+(admin?'':' disabled')+'>Enable</button>':'<button data-block="'+esc(r.clsid)+'"'+(admin?'':' disabled')+'>Disable</button>';const registrations=(r.registrations||[]).map(x=>'<div class="registration mono"><strong>'+esc(x.hive+' / '+x.view+'-bit')+'</strong><br>'+esc(x.parent)+'<br>'+esc(x.key)+'</div>').join('');const evidence='<details><summary>'+(r.registrations||[]).length+' registration'+((r.registrations||[]).length===1?'':'s')+'</summary>'+registrations+'</details>';return '<tr><td>'+esc(r.pub)+'</td><td><span class="pill '+sigClass+'">'+esc(r.sigStatus)+'</span><div class="mono">'+esc(r.reason||'')+'</div></td><td>'+blocked+'</td><td>'+esc(r.name||r.label||r.clsid)+notes+'<div class="mono">'+esc(r.clsid)+'</div></td><td><strong>'+esc(r.comState)+'</strong><br><span class="mono">'+esc(r.dll||'not registered')+'</span></td><td>'+evidence+'</td><td>'+action+'</td></tr>';}).join('');}
function confirmChange(row,blocking){const dialog=el('confirmDialog');el('confirmTitle').textContent=blocking?'Disable handler in Explorer':'Enable handler in Explorer';const command=blocking?'reg add "HKLM\\\\SOFTWARE\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Shell Extensions\\\\Blocked" /v '+row.clsid+' /t REG_SZ /d "'+(row.name||row.label||row.clsid)+'" /f':'reg delete "HKLM\\\\SOFTWARE\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Shell Extensions\\\\Blocked" /v '+row.clsid+' /f';el('confirmEvidence').textContent=[row.clsid,'Publisher: '+row.pub,'Trust: '+row.sigStatus+' / '+row.reason,'COM server: '+(row.dll||'not registered'),'Affected parents: '+(row.surfaces||[]).join(', '),'Registrations: '+(row.registrations||[]).map(x=>x.hive+'/'+x.view+' '+x.key).join('\\n  '),'',command].join('\\n');dialog.showModal();return new Promise(resolve=>{const close=value=>{dialog.close();resolve(value);};el('confirmCancel').onclick=()=>close(false);el('confirmApply').onclick=()=>close(true);dialog.oncancel=event=>{event.preventDefault();close(false);};});}
document.addEventListener('click',async event=>{const block=event.target.getAttribute('data-block'),unblock=event.target.getAttribute('data-unblock');try{if(block){const row=handlers.find(r=>r.clsid===block);if(!await confirmChange(row,true))return;await api('/api/block',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clsid:block,name:row.name||row.label})});dirty=true;await load();}else if(unblock){const row=handlers.find(r=>r.clsid===unblock);if(!await confirmChange(row,false))return;await api('/api/unblock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clsid:unblock})});dirty=true;await load();}}catch(error){setStatus(error.message,'error');}});
['showAll','publisher','signature','hive','view','state'].forEach(id=>el(id).addEventListener('change',render));el('theme').addEventListener('change',event=>setTheme(event.target.value));el('search').addEventListener('input',render);el('refresh').addEventListener('click',load);
el('elevateBtn').addEventListener('click',async()=>{try{const out=await api('/api/relaunch-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});setStatus(out.alreadyAdmin?'Already running as administrator':'Administrator window requested on port '+out.port,'ok');}catch(error){setStatus(error.message,'error');}});
el('classicToggle').addEventListener('click',async()=>{try{await api('/api/classic-menu',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:!classic})});dirty=true;await load();}catch(error){setStatus(error.message,'error');}});
el('exportBtn').addEventListener('click',async()=>{try{const out=await api('/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:el('filePath').value.trim()||undefined})});el('filePath').value=out.file;setStatus('Exported '+out.count+' handlers','ok');}catch(error){setStatus(error.message,'error');}});
el('importBtn').addEventListener('click',async()=>{try{const file=el('filePath').value.trim();if(!file)throw new Error('Choose a snapshot file');if(!window.confirm('Apply blocked states from this snapshot?'))return;const out=await api('/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file})});dirty=dirty||out.blocked||out.unblocked;await load();setStatus('Imported: '+out.blocked+' blocked, '+out.unblocked+' unblocked','ok');}catch(error){setStatus(error.message,'error');}});
el('restartBtn').addEventListener('click',async()=>{try{await api('/api/restart-explorer',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});dirty=false;render();setStatus('Explorer restarted','ok');}catch(error){setStatus(error.message,'error');}});
load().catch(error=>setStatus(error.message,'error'));
</script>
</body>
</html>`;
};
