// ===== Estado =====
let ME = null;            // { username, role }
let pautas = [];
let cuentas = [];
let otros = [];
let currentCuentaId = null;

const fmt = n => '$' + (n||0).toLocaleString('es-CO');
const parseMoney = s => parseInt(String(s).replace(/[^\d]/g,'')) || 0;
const hoy = new Date().toISOString().slice(0,10);
const PLAT_ORDER = ['X (Twitter)','Instagram','Facebook','TikTok','YouTube','Google','WhatsApp','Otra'];

// ===== API helper =====
async function api(path, opts={}){
  const r = await fetch(path, { headers:{'Content-Type':'application/json'}, ...opts });
  if(r.status===401){ showLogin(); throw new Error('Sesión expirada'); }
  const data = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error || 'Error');
  return data;
}

// ===== Login =====
function showLogin(){ document.getElementById('login-screen').style.display='flex'; document.getElementById('app').style.display='none'; }
function showApp(){ document.getElementById('login-screen').style.display='none'; document.getElementById('app').style.display='block'; }

async function doLogin(){
  const username=document.getElementById('login-user').value.trim();
  const password=document.getElementById('login-pass').value;
  const err=document.getElementById('login-err'); err.textContent='';
  try{
    await api('/api/login',{method:'POST',body:JSON.stringify({username,password})});
    await boot();
  }catch(e){ err.textContent=e.message; }
}
async function doLogout(){ await api('/api/logout',{method:'POST'}).catch(()=>{}); location.reload(); }

document.getElementById('login-pass').addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });

// ===== Permisos de UI según rol =====
function applyRole(){
  const role = ME.role;
  document.getElementById('role-badge').textContent = role;
  document.getElementById('sb-user').textContent = ME.username+' ('+role+')';
  // admin-only: solo admin
  document.querySelectorAll('.admin-only').forEach(el=> el.classList.toggle('hidden', role!=='admin'));
  // editor-admin: editor y admin
  document.querySelectorAll('.editor-admin').forEach(el=> el.classList.toggle('hidden', !(role==='admin'||role==='editor')));
  // viewer-only: solo viewer
  document.querySelectorAll('.viewer-only').forEach(el=> el.classList.toggle('hidden', role!=='viewer'));

  // El editor NO ve pautas ni reportes: ocultar esa categoría y mandarlo a cuentas
  const catPautas=document.getElementById('cat-pautas');
  const gPautas=document.getElementById('g-pautas');
  const catOtros=document.getElementById('cat-otros');
  const gOtros=document.getElementById('g-otros');
  if(role==='editor'){
    catPautas.classList.add('hidden'); gPautas.classList.add('hidden');
    if(catOtros) catOtros.classList.add('hidden'); if(gOtros) gOtros.classList.add('hidden');
  } else {
    catPautas.classList.remove('hidden'); gPautas.classList.remove('hidden');
    if(catOtros) catOtros.classList.remove('hidden'); if(gOtros) gOtros.classList.remove('hidden');
  }
}

// ===== Boot =====
async function boot(){
  const me = await api('/api/me');
  if(!me.auth){ showLogin(); return; }
  ME = me.user;
  showApp();
  applyRole();
  // cargar datos según rol
  if(ME.role!=='editor'){ await loadPautas(); await loadOtros(); }
  await loadCuentas();
  initCats();
  // vista inicial
  go(ME.role==='editor' ? 'cuentas' : 'pautas');
}

async function loadPautas(){ pautas = await api('/api/pautas'); renderPautas(); renderSidebar(); }
async function loadCuentas(){ cuentas = await api('/api/cuentas'); renderCuentas(); renderSidebar(); }

// ===== Navegación =====
const titles = {
  pautas:['Todas las pautas','Registra y controla tus pautas'],
  reportes:['Reportes','Resúmenes y exportación'],
  cuentas:['Cuentas','Gestiona las cuentas de redes'],
  otros:['Otros','Gastos extra: lives, viewers, etc.'],
  usuarios:['Usuarios','Gestión de accesos'],
};
function go(view){
  document.querySelectorAll('.sb-item').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  const btn=document.querySelector(`.sb-item[data-view="${view}"]`);
  if(btn) btn.classList.add('active');
  const sec=document.getElementById('view-'+view);
  if(sec) sec.classList.add('active');
  if(titles[view]){ document.getElementById('page-title').textContent=titles[view][0]; document.getElementById('page-sub').textContent=titles[view][1]; }
  if(view==='reportes') renderReportes();
  if(view==='usuarios') loadUsers();
  if(view==='otros') loadOtros();
  document.getElementById('sidebar').classList.remove('open');
}
document.addEventListener('click',e=>{ const b=e.target.closest('.sb-item[data-view]'); if(b) go(b.dataset.view); });

// ===== Acordeón =====
function toggleCat(groupId,catEl){
  const g=document.getElementById(groupId);
  const c=g.classList.toggle('collapsed');
  catEl.classList.toggle('collapsed',c);
  const st=JSON.parse(localStorage.getItem('catState')||'{}'); st[groupId]=c?'c':'o'; localStorage.setItem('catState',JSON.stringify(st));
}
function initCats(){
  const st=JSON.parse(localStorage.getItem('catState')||'{}');
  document.querySelectorAll('.sb-group').forEach(g=>{ if(st[g.id]==='c'){ g.classList.add('collapsed'); g.previousElementSibling.classList.add('collapsed'); } });
}

// ===== Pautas =====
document.getElementById('f-valor')?.addEventListener('input',e=>{ const v=parseMoney(e.target.value); e.target.value=v?v.toLocaleString('es-CO'):''; });
if(document.getElementById('f-fecha')) document.getElementById('f-fecha').value=hoy;

async function addPauta(){
  const cliente=document.getElementById('f-cliente').value.trim();
  const valor=parseMoney(document.getElementById('f-valor').value);
  const msg=document.getElementById('form-msg');
  if(!cliente){ msg.textContent='⚠ Escribe la cuenta/cliente'; return; }
  if(!valor){ msg.textContent='⚠ Escribe el valor'; return; }
  const nota=document.getElementById('f-nota').value.trim();
  const pauta={ fecha:document.getElementById('f-fecha').value, cliente,
    plataforma:document.getElementById('f-plataforma').value, tipo:document.getElementById('f-tipo').value,
    estado:document.getElementById('f-estado').value, valor, link:document.getElementById('f-link').value.trim(),
    seguimiento: nota?[{fecha:hoy,texto:nota}]:[] };
  await api('/api/pautas',{method:'POST',body:JSON.stringify(pauta)});
  document.getElementById('f-cliente').value=''; document.getElementById('f-valor').value='';
  document.getElementById('f-nota').value=''; document.getElementById('f-link').value='';
  msg.textContent='✓ Pauta agregada'; setTimeout(()=>msg.textContent='',2000);
  await loadPautas();
}
async function delPauta(id){ if(!confirm('¿Eliminar esta pauta?'))return; await api('/api/pautas/'+id,{method:'DELETE'}); await loadPautas(); }

// ===== Editar pauta =====
let editId=null;
function editPauta(id){
  const p=pautas.find(x=>x.id===id); if(!p)return; editId=id;
  document.getElementById('e-fecha').value=p.fecha||hoy;
  document.getElementById('e-cliente').value=p.cliente||'';
  document.getElementById('e-plataforma').value=p.plataforma||'Facebook';
  document.getElementById('e-tipo').value=p.tipo||'Video';
  document.getElementById('e-estado').value=p.estado||'pendiente';
  document.getElementById('e-valor').value=(p.valor||0).toLocaleString('es-CO');
  document.getElementById('e-link').value=p.link||'';
  document.getElementById('edit-msg').textContent='';
  document.getElementById('edit-bg').classList.add('open');
}
function closeEdit(){ document.getElementById('edit-bg').classList.remove('open'); editId=null; }
async function saveEdit(){
  if(editId==null) return;
  const cliente=document.getElementById('e-cliente').value.trim();
  const valor=parseMoney(document.getElementById('e-valor').value);
  const msg=document.getElementById('edit-msg');
  if(!cliente){ msg.style.color='var(--red)'; msg.textContent='⚠ Escribe la cuenta/cliente'; return; }
  const body={ fecha:document.getElementById('e-fecha').value, cliente,
    plataforma:document.getElementById('e-plataforma').value, tipo:document.getElementById('e-tipo').value,
    estado:document.getElementById('e-estado').value, valor, link:document.getElementById('e-link').value.trim() };
  try{ await api('/api/pautas/'+editId,{method:'PUT',body:JSON.stringify(body)});
    closeEdit(); await loadPautas();
  }catch(e){ msg.style.color='var(--red)'; msg.textContent='⚠ '+e.message; }
}
document.getElementById('e-valor')?.addEventListener('input',e=>{ const v=parseMoney(e.target.value); e.target.value=v?v.toLocaleString('es-CO'):''; });
document.getElementById('edit-bg')?.addEventListener('click',e=>{ if(e.target.id==='edit-bg')closeEdit(); });

// ===== Otros (gastos extra) =====
async function loadOtros(){ try{ otros = await api('/api/otros'); }catch{ otros=[]; } renderOtros(); if(ME && ME.role!=='editor') renderPautas(); }
if(document.getElementById('o-fecha')) document.getElementById('o-fecha').value=hoy;
document.getElementById('o-valor')?.addEventListener('input',e=>{ const v=parseMoney(e.target.value); e.target.value=v?v.toLocaleString('es-CO'):''; });

function renderOtros(){
  const tbody=document.getElementById('otros-tbody'); if(!tbody) return;
  if(otros.length===0){ tbody.innerHTML=`<tr><td colspan="9" class="empty">No hay gastos extra todavía.</td></tr>`; }
  else{
    tbody.innerHTML=otros.map(o=>`<tr>
      <td>${formatFecha(o.fecha)}</td><td>${(o.concepto||'').replace(/</g,'&lt;')}</td><td>${o.red||'-'}</td>
      <td>${o.duracion||'-'}</td><td>${o.cantidad||'-'}</td>
      <td><span class="pill ${o.estado==='pendiente'?'pendiente':'pagada'}">${o.estado||'-'}</span></td>
      <td class="val" style="text-align:right">${fmt(o.valor)}</td>
      <td>${(o.nota||'').replace(/</g,'&lt;')}</td>
      ${isAdmin()?`<td style="text-align:right;white-space:nowrap"><button class="seg" onclick="editOtro(${o.id})">✎</button> <button class="del" onclick="delOtro(${o.id})">✕</button></td>`:''}</tr>`).join('');
    const tot=otros.reduce((s,o)=>s+(o.valor||0),0);
    tbody.innerHTML+=`<tr class="total-row"><td colspan="6">TOTAL (${otros.length})</td><td style="text-align:right">${fmt(tot)}</td><td colspan="2"></td></tr>`;
  }
  const total=otros.reduce((s,o)=>s+(o.valor||0),0), mes=hoy.slice(0,7);
  const delMes=otros.filter(o=>(o.fecha||'').slice(0,7)===mes);
  const g=(id,v)=>{const el=document.getElementById(id); if(el) el.textContent=v;};
  g('ok-total',fmt(total)); g('ok-count',otros.length+' registros');
  g('ok-mes',fmt(delMes.reduce((s,o)=>s+(o.valor||0),0))); g('ok-mes-count',delMes.length+' registros');
}

async function addOtro(){
  const concepto=document.getElementById('o-concepto').value.trim();
  const valor=parseMoney(document.getElementById('o-valor').value);
  const msg=document.getElementById('otro-msg');
  if(!concepto){ msg.style.color='var(--red)'; msg.textContent='⚠ Escribe el concepto'; return; }
  const o={ fecha:document.getElementById('o-fecha').value, concepto,
    red:document.getElementById('o-red').value, duracion:document.getElementById('o-duracion').value.trim(),
    cantidad:document.getElementById('o-cantidad').value.trim(), valor,
    estado:document.getElementById('o-estado').value, nota:document.getElementById('o-nota').value.trim() };
  try{ await api('/api/otros',{method:'POST',body:JSON.stringify(o)});
    document.getElementById('o-concepto').value=''; document.getElementById('o-valor').value='';
    document.getElementById('o-duracion').value=''; document.getElementById('o-cantidad').value='';
    document.getElementById('o-nota').value='';
    msg.style.color='var(--mut)'; msg.textContent='✓ Gasto agregado'; setTimeout(()=>msg.textContent='',2000);
    await loadOtros();
  }catch(e){ msg.style.color='var(--red)'; msg.textContent='⚠ '+e.message; }
}

async function delOtro(id){ if(!confirm('¿Eliminar este gasto?'))return; await api('/api/otros/'+id,{method:'DELETE'}); await loadOtros(); }

// Edición in-place reutilizando el formulario: carga datos y cambia el botón a "Guardar"
let editOtroId=null;
function editOtro(id){
  const o=otros.find(x=>x.id===id); if(!o)return; editOtroId=id;
  document.getElementById('o-fecha').value=o.fecha||hoy;
  document.getElementById('o-concepto').value=o.concepto||'';
  document.getElementById('o-red').value=o.red||'Facebook';
  document.getElementById('o-duracion').value=o.duracion||'';
  document.getElementById('o-cantidad').value=o.cantidad||'';
  document.getElementById('o-valor').value=(o.valor||0).toLocaleString('es-CO');
  document.getElementById('o-estado').value=o.estado||'pagado';
  document.getElementById('o-nota').value=o.nota||'';
  const btn=document.querySelector('#view-otros .btn[onclick="addOtro()"], #view-otros .btn[onclick="saveOtro()"]');
  if(btn){ btn.textContent='Guardar cambios'; btn.setAttribute('onclick','saveOtro()'); }
  const msg=document.getElementById('otro-msg'); msg.style.color='var(--mut)'; msg.textContent='Editando registro #'+id+' — ';
  // botón cancelar
  if(!document.getElementById('o-cancel')){
    const c=document.createElement('button'); c.id='o-cancel'; c.className='btn btn-ghost'; c.textContent='Cancelar'; c.setAttribute('onclick','cancelEditOtro()');
    btn.parentElement.insertBefore(c, btn.nextSibling);
  }
  document.getElementById('o-concepto').focus();
}
function cancelEditOtro(){
  editOtroId=null;
  document.getElementById('o-concepto').value=''; document.getElementById('o-valor').value='';
  document.getElementById('o-duracion').value=''; document.getElementById('o-cantidad').value=''; document.getElementById('o-nota').value='';
  const btn=document.querySelector('#view-otros .btn[onclick="saveOtro()"]');
  if(btn){ btn.textContent='Agregar gasto'; btn.setAttribute('onclick','addOtro()'); }
  const c=document.getElementById('o-cancel'); if(c) c.remove();
  document.getElementById('otro-msg').textContent='';
}
async function saveOtro(){
  if(editOtroId==null){ return addOtro(); }
  const concepto=document.getElementById('o-concepto').value.trim();
  const valor=parseMoney(document.getElementById('o-valor').value);
  const msg=document.getElementById('otro-msg');
  if(!concepto){ msg.style.color='var(--red)'; msg.textContent='⚠ Escribe el concepto'; return; }
  const body={ fecha:document.getElementById('o-fecha').value, concepto,
    red:document.getElementById('o-red').value, duracion:document.getElementById('o-duracion').value.trim(),
    cantidad:document.getElementById('o-cantidad').value.trim(), valor,
    estado:document.getElementById('o-estado').value, nota:document.getElementById('o-nota').value.trim() };
  try{ await api('/api/otros/'+editOtroId,{method:'PUT',body:JSON.stringify(body)});
    cancelEditOtro(); await loadOtros();
  }catch(e){ msg.style.color='var(--red)'; msg.textContent='⚠ '+e.message; }
}

function linkIcon(l){ return l?` <a href="${l}" target="_blank" class="link-ic" onclick="event.stopPropagation()">ver ↗</a>`:''; }
function formatFecha(f){ if(!f)return'-'; const[y,m,d]=f.split('-'); const M=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']; return `${d} ${M[+m-1]} ${y}`; }
const isAdmin=()=>ME&&ME.role==='admin';

function renderPautas(){
  if(ME.role==='editor') return;
  const search=(document.getElementById('search').value||'').toLowerCase();
  const fplat=document.getElementById('filter-plat').value;
  const tbody=document.getElementById('tbody');
  let list=pautas.filter(p=>{const t=(p.cliente+' '+p.plataforma+' '+p.tipo).toLowerCase();return t.includes(search)&&(!fplat||p.plataforma===fplat);});
  const colDel = isAdmin()?'<td style="text-align:right"><button class="del" onclick="delPauta(ID)">✕</button></td>':'';
  if(list.length===0){ tbody.innerHTML=`<tr><td colspan="8" class="empty">No hay pautas todavía.</td></tr>`; }
  else{
    tbody.innerHTML=list.map(p=>{const n=(p.seguimiento||[]).length;return `<tr>
      <td>${formatFecha(p.fecha)}</td><td>${p.cliente}</td><td>${p.plataforma}</td><td>${p.tipo}${linkIcon(p.link)}</td>
      <td><span class="pill ${p.estado}">${p.estado}</span></td><td class="val" style="text-align:right">${fmt(p.valor)}</td>
      <td style="text-align:center"><button class="seg ${n?'has':''}" onclick="openModal(${p.id})">${n?'notas ('+n+')':'notas'}</button></td>
      ${isAdmin()?`<td style="text-align:right;white-space:nowrap"><button class="seg" onclick="editPauta(${p.id})">✎</button> <button class="del" onclick="delPauta(${p.id})">✕</button></td>`:''}</tr>`;}).join('');
    const tot=list.reduce((s,p)=>s+p.valor,0);
    tbody.innerHTML+=`<tr class="total-row"><td colspan="5">TOTAL (${list.length})</td><td style="text-align:right">${fmt(tot)}</td><td colspan="2"></td></tr>`;
  }
  const totalPautas=pautas.reduce((s,p)=>s+p.valor,0), mes=hoy.slice(0,7);
  const totalOtros=(otros||[]).reduce((s,o)=>s+(o.valor||0),0);
  const total=totalPautas+totalOtros;
  const delMes=pautas.filter(p=>(p.fecha||'').slice(0,7)===mes), pend=pautas.filter(p=>p.estado==='pendiente');
  const otrosMes=(otros||[]).filter(o=>(o.fecha||'').slice(0,7)===mes).reduce((s,o)=>s+(o.valor||0),0);
  document.getElementById('kpi-total').textContent=fmt(total);
  document.getElementById('kpi-count').textContent=pautas.length+' pautas'+(totalOtros?' + extras':'');
  document.getElementById('kpi-mes').textContent=fmt(delMes.reduce((s,p)=>s+p.valor,0)+otrosMes);
  document.getElementById('kpi-mes-count').textContent=delMes.length+' pautas'+(otrosMes?' + extras':'');
  document.getElementById('kpi-pend').textContent=fmt(pend.reduce((s,p)=>s+p.valor,0));
  document.getElementById('kpi-pend-count').textContent=pend.length+' pautas';
  const cl=new Set(pautas.map(p=>p.cliente)); document.getElementById('kpi-clientes').textContent=cl.size;
  document.getElementById('clientes-list').innerHTML=[...cl].map(c=>`<option value="${c}">`).join('');
}

// ===== Agrupar =====
function grupos(){
  const g={}; cuentas.forEach(c=>{(g[c.plataforma]=g[c.plataforma]||[]).push(c);});
  const keys=[...PLAT_ORDER.filter(p=>g[p]),...Object.keys(g).filter(p=>!PLAT_ORDER.includes(p))];
  return keys.map(k=>[k,g[k]]);
}

// ===== Cuentas =====
function renderCuentas(){
  const grid=document.getElementById('acct-grid');
  if(cuentas.length===0){ grid.innerHTML='<div class="empty">No hay cuentas. Importa un CSV arriba.</div>'; return; }
  const st=JSON.parse(localStorage.getItem('platState')||'{}');
  grid.innerHTML=grupos().map(([plat,arr])=>{
    const col=st[plat]!=='open';
    return `<div class="plat-section">
      <div class="plat-title ${col?'collapsed':''}" onclick="togglePlat(this,'${plat.replace(/'/g,"\\'")}')"><span class="chev">▾</span> ${plat} <span class="plat-count">${arr.length}</span></div>
      <div class="acct-row ${col?'collapsed':''}">
        ${arr.map(c=>`<div class="acct" onclick="openCuenta(${c.id})">
          <div class="ic">${(c.nombre||'?').charAt(0).toUpperCase()}</div>
          <h4>${c.nombre}</h4><div class="plat">${c.correo||c.url||''}</div>
          ${isAdmin()?`<button class="del" style="position:absolute;top:12px;right:10px" onclick="event.stopPropagation();delCuenta(${c.id})">✕</button>`:''}
        </div>`).join('')}
      </div></div>`;
  }).join('');
}
function togglePlat(el,plat){
  const row=el.parentElement.querySelector('.acct-row');
  const col=row.classList.toggle('collapsed'); el.classList.toggle('collapsed',col);
  const st=JSON.parse(localStorage.getItem('platState')||'{}'); st[plat]=col?'closed':'open'; localStorage.setItem('platState',JSON.stringify(st));
}
async function addCuentaManual(){ /* reservado */ }
async function delCuenta(id){ if(!confirm('¿Eliminar esta cuenta?'))return; await api('/api/cuentas/'+id,{method:'DELETE'}); await loadCuentas(); }

function openCuenta(id){
  const c=cuentas.find(x=>x.id===id); if(!c) return;
  currentCuentaId=id;
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(x=>x.classList.remove('active'));
  document.getElementById('view-detalle').classList.add('active');
  document.getElementById('page-title').textContent=c.nombre;
  document.getElementById('page-sub').textContent='Datos de la cuenta';
  const canSecret = ME.role==='admin'||ME.role==='editor';
  const row=(lbl,val,secret)=>{ if(!val && !(secret&&canSecret)) { if(!val) return ''; }
    if(!val) return '';
    const safe=String(val).replace(/"/g,'&quot;');
    const shown=secret?'••••••••':safe;
    return `<div class="cred-row"><span class="cred-lbl">${lbl}</span>
      <span class="cred-val" ${secret?`data-secret="${safe}"`:''}>${shown}</span>
      ${secret?`<button class="cred-btn" onclick="revealCred(this)">ver</button>`:''}
      <button class="cred-btn" onclick="copyCred('${safe}')">copiar</button></div>`;
  };
  let html=`<div class="cred-head">${c.plataforma}</div>`;
  html+=row('Usuario',c.nombre,false);
  html+=row('URL',c.url,false);
  html+=row('Correo',c.correo,false);
  if(canSecret){
    html+=row('Contraseña',c.password,true);
    html+=row('Contraseña correo',c.passCorreo,true);
    html+=row('Código 2FA',c.fa2,true);
  } else {
    html+=`<div class="cred-row"><span class="cred-lbl">Contraseñas</span><span class="cred-val" style="color:var(--mut)">ocultas para tu rol</span></div>`;
  }
  html+=row('Notas',c.notas,false);
  document.getElementById('d-cred').innerHTML=html;
  // Cerrar el sidebar en móvil al abrir una cuenta y subir al inicio
  document.getElementById('sidebar').classList.remove('open');
  window.scrollTo(0,0);
}

// ===== Editar cuenta (admin / editor) =====
function openEditCuenta(){
  const c=cuentas.find(x=>x.id===currentCuentaId); if(!c) return;
  document.getElementById('ec-nombre').value=c.nombre||'';
  document.getElementById('ec-plataforma').value=c.plataforma||'Otra';
  document.getElementById('ec-url').value=c.url||'';
  document.getElementById('ec-correo').value=c.correo||'';
  document.getElementById('ec-password').value='';
  document.getElementById('ec-passCorreo').value='';
  document.getElementById('ec-fa2').value='';
  document.getElementById('ec-notas').value=c.notas||'';
  document.getElementById('editc-msg').textContent='';
  document.getElementById('editc-bg').classList.add('open');
}
function closeEditCuenta(){ document.getElementById('editc-bg').classList.remove('open'); }
async function saveEditCuenta(){
  const msg=document.getElementById('editc-msg'); msg.style.color='var(--mut)'; msg.textContent='Guardando...';
  const body={
    nombre:document.getElementById('ec-nombre').value.trim(),
    plataforma:document.getElementById('ec-plataforma').value,
    url:document.getElementById('ec-url').value.trim(),
    correo:document.getElementById('ec-correo').value.trim(),
    password:document.getElementById('ec-password').value,
    passCorreo:document.getElementById('ec-passCorreo').value,
    fa2:document.getElementById('ec-fa2').value,
    notas:document.getElementById('ec-notas').value.trim(),
  };
  if(!body.nombre){ msg.style.color='var(--red)'; msg.textContent='El usuario/nombre es obligatorio'; return; }
  try{
    await api('/api/cuentas/'+currentCuentaId,{method:'PUT',body:JSON.stringify(body)});
    await loadCuentas();
    closeEditCuenta();
    openCuenta(currentCuentaId);
    toast('Cuenta actualizada');
  }catch(e){ msg.style.color='var(--red)'; msg.textContent='⚠ '+e.message; }
}
function revealCred(btn){ const s=btn.previousElementSibling; if(btn.textContent==='ver'){ s.textContent=s.dataset.secret; btn.textContent='ocultar'; } else { s.textContent='••••••••'; btn.textContent='ver'; } }
function toast(txt,ok=true){ const m=document.createElement('div'); m.textContent=txt; m.className='toast'; if(!ok){m.style.background='var(--red)';m.style.color='#fff';} document.body.appendChild(m); setTimeout(()=>m.remove(),1400); }
function copyCred(val){ if(navigator.clipboard&&window.isSecureContext){ navigator.clipboard.writeText(val).then(()=>toast('Copiado')).catch(()=>fallbackCopy(val)); } else fallbackCopy(val); }
function fallbackCopy(val){ const ta=document.createElement('textarea'); ta.value=val; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); try{ const ok=document.execCommand('copy'); toast(ok?'Copiado':'No se pudo',ok); }catch{ toast('No se pudo',false);} document.body.removeChild(ta); }

// Sidebar cuentas agrupadas y colapsables
function renderSidebar(){
  const box=document.getElementById('sb-cuentas'); if(!box) return;
  const st=JSON.parse(localStorage.getItem('platStateSb')||'{}');
  box.innerHTML=grupos().map(([plat,arr])=>{
    const col=st[plat]!=='open'; const pid='sbp-'+plat.replace(/[^a-zA-Z]/g,'');
    return `<div class="sb-subcat ${col?'collapsed':''}" onclick="toggleSbPlat(this,'${plat.replace(/'/g,"\\'")}','${pid}')"><span class="chev">▾</span> ${plat} <span class="count">${arr.length}</span></div>
      <div class="sb-subgroup ${col?'collapsed':''}" id="${pid}">
      ${arr.map(c=>`<button class="sb-item sb-sub" onclick="openCuenta(${c.id})"><span class="item-mono">${(c.nombre||'?').charAt(0).toUpperCase()}</span><span class="item-txt">${c.nombre}</span></button>`).join('')}
      </div>`;
  }).join('') || '<div class="sb-empty">Sin cuentas aún</div>';
}
function toggleSbPlat(el,plat,pid){ const g=document.getElementById(pid); const col=g.classList.toggle('collapsed'); el.classList.toggle('collapsed',col); const st=JSON.parse(localStorage.getItem('platStateSb')||'{}'); st[plat]=col?'closed':'open'; localStorage.setItem('platStateSb',JSON.stringify(st)); }

// ===== Reportes =====
function renderReportes(){
  const byC={},byP={};
  pautas.forEach(p=>{ byC[p.cliente]=byC[p.cliente]||{n:0,t:0}; byC[p.cliente].n++; byC[p.cliente].t+=p.valor; byP[p.plataforma]=byP[p.plataforma]||{n:0,t:0}; byP[p.plataforma].n++; byP[p.plataforma].t+=p.valor; });
  const rows=o=>Object.entries(o).sort((a,b)=>b[1].t-a[1].t).map(([k,v])=>`<tr><td>${k}</td><td style="text-align:center">${v.n}</td><td class="val" style="text-align:right">${fmt(v.t)}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">Sin datos</td></tr>';
  document.getElementById('rep-cliente').innerHTML=rows(byC);
  document.getElementById('rep-plat').innerHTML=rows(byP);
}
function exportCSV(){
  if(pautas.length===0){ alert('No hay pautas'); return; }
  let csv='Fecha,Cuenta,Plataforma,Tipo,Estado,Valor,Link\n';
  pautas.forEach(p=>csv+=`${p.fecha},${p.cliente},${p.plataforma},${p.tipo},${p.estado},${p.valor},${p.link||''}\n`);
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='pautas.csv'; a.click();
}

// ===== Modal seguimiento =====
let modalId=null;
function openModal(id){ modalId=id; const p=pautas.find(x=>x.id===id); if(!p)return;
  const link=p.link?` · <a href="${p.link}" target="_blank" style="color:var(--gold-soft)">ver ↗</a>`:'';
  document.getElementById('modal-meta').innerHTML=`${p.cliente} · ${p.plataforma} · ${p.tipo} · ${fmt(p.valor)} · ${formatFecha(p.fecha)}${link}`;
  renderTimeline(); const mi=document.getElementById('modal-input'); if(mi) mi.value='';
  document.getElementById('modal-bg').classList.add('open');
}
function closeModal(){ document.getElementById('modal-bg').classList.remove('open'); modalId=null; }
function renderTimeline(){
  const p=pautas.find(x=>x.id===modalId); const seg=(p.seguimiento||[]).slice().reverse();
  document.getElementById('modal-timeline').innerHTML=seg.length?seg.map((s,i)=>`<li>${isAdmin()?`<button class="t-del" onclick="delNota(${seg.length-1-i})">✕</button>`:''}<div class="t-fecha">${formatFecha(s.fecha)}</div><div class="t-texto">${s.texto.replace(/</g,'&lt;')}</div></li>`).join(''):'<div class="no-seg">Aún no hay notas.</div>';
}
async function addNota(){
  const txt=document.getElementById('modal-input').value.trim(); if(!txt)return;
  const p=pautas.find(x=>x.id===modalId); if(!p.seguimiento)p.seguimiento=[]; p.seguimiento.push({fecha:hoy,texto:txt});
  await api('/api/pautas/'+modalId,{method:'PUT',body:JSON.stringify({seguimiento:p.seguimiento})});
  document.getElementById('modal-input').value=''; renderTimeline(); renderPautas();
}
async function delNota(idx){ const p=pautas.find(x=>x.id===modalId); p.seguimiento.splice(idx,1); await api('/api/pautas/'+modalId,{method:'PUT',body:JSON.stringify({seguimiento:p.seguimiento})}); renderTimeline(); renderPautas(); }
document.getElementById('modal-bg').addEventListener('click',e=>{ if(e.target.id==='modal-bg')closeModal(); });

// ===== Importar CSV / Pegar =====
function parseCSV(text){ const rows=[]; let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){ const ch=text[i],nx=text[i+1];
    if(q){ if(ch==='"'&&nx==='"'){cell+='"';i++;} else if(ch==='"'){q=false;} else cell+=ch; }
    else { if(ch==='"')q=true; else if(ch===','){row.push(cell);cell='';} else if(ch==='\n'){row.push(cell);rows.push(row);row=[];cell='';} else if(ch==='\r'){} else cell+=ch; } }
  if(cell.length||row.length){row.push(cell);rows.push(row);} return rows;
}
function parseTSV(text){ return text.split(/\r?\n/).map(l=>l.split(/\t|,/)); }

function procesarBloques(rows){
  let seccion=null; const out=[];
  const detect=t=>{t=(t||'').toLowerCase().trim();
    if(t.startsWith('cuentas x')||t.includes('twitter'))return'X (Twitter)';
    if(t.startsWith('cuentas instagram'))return'Instagram';
    if(t.startsWith('cuentas tiktok')||t.startsWith('cuentas tik tok'))return'TikTok';
    if(t.startsWith('cuentas facebook'))return'Facebook';
    if(t.startsWith('cuentas youtube'))return'YouTube';
    return null;};
  const esHeader=c=>{const t=(c||'').toLowerCase().trim();return t.startsWith('nombre de usuario')||t.startsWith('correo');};
  for(const r of rows){
    const c0=(r[0]||'').trim(); const ns=detect(c0);
    if(ns){seccion=ns;continue;} if(!seccion)continue; if(esHeader(c0))continue; if(!c0)continue;
    let c=null;
    if(seccion==='X (Twitter)') c={nombre:c0,plataforma:'X (Twitter)',password:r[1]||'',fa2:r[2]||'',url:r[3]||'',correo:r[4]||'',passCorreo:r[5]||'',notas:''};
    else if(seccion==='Instagram') c={nombre:(r[2]||c0),plataforma:'Instagram',correo:c0,passCorreo:r[1]||'',password:r[3]||'',url:r[4]||'',fa2:'',notas:(r[5]?'correo respaldo: '+r[5]:'')};
    else if(seccion==='TikTok') c={nombre:(r[2]||c0),plataforma:'TikTok',correo:c0,passCorreo:r[1]||'',password:r[3]||'',url:r[4]||'',fa2:'',notas:''};
    else if(seccion==='Facebook') c={nombre:(r[0]||'').split('@')[0],plataforma:'Facebook',correo:c0,password:r[1]||'',passCorreo:r[1]||'',url:r[2]||'',fa2:'',notas:''};
    else if(seccion==='YouTube') c={nombre:(r[2]||c0),plataforma:'YouTube',correo:c0,passCorreo:r[1]||'',password:r[3]||'',url:r[4]||'',fa2:'',notas:''};
    if(c&&c.nombre) out.push(c);
  }
  return out;
}
async function enviarCuentas(list,msgEl){
  if(list.length===0){ msgEl.style.color='var(--red)'; msgEl.textContent='No se detectaron cuentas'; return; }
  const res=await api('/api/cuentas/bulk',{method:'POST',body:JSON.stringify({cuentas:list})});
  msgEl.style.color='var(--green)'; msgEl.textContent=`✓ Importadas ${res.nuevas} (${res.dup} ya existían)`;
  await loadCuentas();
}
function importCSV(ev){
  const file=ev.target.files[0]; if(!file)return; const msg=document.getElementById('import-msg');
  const reader=new FileReader();
  reader.onload=async e=>{ try{ await enviarCuentas(procesarBloques(parseCSV(e.target.result)),msg); }catch(err){ msg.style.color='var(--red)'; msg.textContent='⚠ '+err.message; } ev.target.value=''; };
  reader.readAsText(file,'UTF-8');
}
async function importPaste(){
  const txt=document.getElementById('paste-area').value; const msg=document.getElementById('paste-msg');
  if(!txt.trim()){ msg.textContent='Pega algo primero'; return; }
  try{ await enviarCuentas(procesarBloques(parseTSV(txt)),msg); document.getElementById('paste-area').value=''; }catch(err){ msg.style.color='var(--red)'; msg.textContent='⚠ '+err.message; }
}

// ===== Usuarios (admin) =====
async function loadUsers(){
  const users=await api('/api/users');
  document.getElementById('users-tbody').innerHTML=users.map(u=>`<tr><td>${u.username}</td><td><span class="pill activa">${u.role}</span></td><td style="text-align:right">${u.username!==ME.username?`<button class="del" onclick="delUser(${u.id})">✕</button>`:'<span style="color:var(--mut);font-size:.75rem">tú</span>'}</td></tr>`).join('');
}
async function addUser(){
  const username=document.getElementById('u-nombre').value.trim();
  const password=document.getElementById('u-pass').value.trim();
  const role=document.getElementById('u-rol').value; const msg=document.getElementById('u-msg');
  if(!username||!password){ msg.textContent='⚠ Faltan datos'; return; }
  try{ await api('/api/users',{method:'POST',body:JSON.stringify({username,password,role})});
    document.getElementById('u-nombre').value=''; document.getElementById('u-pass').value='';
    msg.textContent='✓ Usuario creado'; setTimeout(()=>msg.textContent='',2000); loadUsers();
  }catch(e){ msg.style.color='var(--red)'; msg.textContent='⚠ '+e.message; }
}
async function delUser(id){ if(!confirm('¿Eliminar usuario?'))return; await api('/api/users/'+id,{method:'DELETE'}); loadUsers(); }

// ===== Arranque =====
boot().catch(()=>showLogin());
