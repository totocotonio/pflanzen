/* ============================================================
   Grünzeug – Pflanzen gießen
   Single-File PWA, Daten in localStorage (Prefix pg_)
   ============================================================ */
'use strict';

const VERSION = '1.1.0';

/* Push-Server – wird gesetzt, sobald der LXC steht */
const PUSH_SERVER = '';
const VAPID_PUBLIC = '';

const KEY = 'pg_data';
const EMOJIS = ['🪴','🌿','🌵','🌱','🌴','🎍','🌺','🌻','🌷','🍀','🌾','🥬','🍋','🌶️','🫒'];

/* ---------- State ---------- */
let DB = {
  v: 1,
  plants: [],
  logs: [],
  settings: { winter: 'auto', vorwarn: 2, pushZeit: '09:00', pushAktiv: false, theme: 'auto' }
};
let editId = null;      // null = neue Pflanze
let editEmoji = '🪴';
let editFoto = null;
let raumFilter = 'alle';

/* ---------- Persistenz ---------- */
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      DB = Object.assign(DB, d);
      DB.settings = Object.assign({ winter: 'auto', vorwarn: 2, pushZeit: '09:00', pushAktiv: false, theme: 'auto' }, d.settings || {});
      DB.plants = d.plants || [];
      DB.logs = d.logs || [];
    }
  } catch (e) { console.error('Laden fehlgeschlagen', e); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(DB)); }
  catch (e) { toast('Speichern fehlgeschlagen – Speicher voll?'); }
}

/* ---------- Helfer ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function heute0() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function toISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fromISO(s) { const [y, m, t] = String(s).split('-').map(Number); return new Date(y, m - 1, t); }
function tageDiff(a, b) { return Math.round((b - a) / 86400000); }

function winterAktiv() {
  const w = DB.settings.winter;
  if (w === '1') return true;
  if (w === '0') return false;
  const m = new Date().getMonth(); // 0=Jan
  return m >= 10 || m <= 1;        // Nov, Dez, Jan, Feb
}
function effIntervall(p) {
  const f = winterAktiv() ? 1.5 : 1;
  return Math.max(1, Math.round((Number(p.intervall) || 7) * f));
}
/** Tage bis zum nächsten Gießen. Negativ = überfällig. */
function tageBis(p) {
  if (!p.letzt) return 0;
  const naechste = new Date(fromISO(p.letzt).getTime() + effIntervall(p) * 86400000);
  naechste.setHours(0, 0, 0, 0);
  return tageDiff(heute0(), naechste);
}
function duengerTageBis(p) {
  const iv = Number(p.duengerInt) || 0;
  if (!iv || !p.duengerLetzt) return null;
  const n = new Date(fromISO(p.duengerLetzt).getTime() + iv * 86400000);
  n.setHours(0, 0, 0, 0);
  return tageDiff(heute0(), n);
}
function statusOf(p) {
  const t = tageBis(p);
  if (t < 0) return 'over';
  if (t === 0) return 'due';
  if (t <= (Number(DB.settings.vorwarn) || 0)) return 'soon';
  return 'ok';
}
function statusText(p) {
  const t = tageBis(p);
  if (t < 0) return Math.abs(t) === 1 ? '1 Tag überfällig' : Math.abs(t) + ' Tage überfällig';
  if (t === 0) return 'Heute gießen';
  if (t === 1) return 'Morgen';
  return 'in ' + t + ' Tagen';
}
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}
function avatarHTML(p, cls) {
  const c = 'avatar' + (cls ? ' ' + cls : '');
  return p.foto
    ? `<div class="${c}"><img src="${p.foto}" alt=""></div>`
    : `<div class="${c}">${p.emoji || '🪴'}</div>`;
}

/* ---------- Erscheinungsbild ---------- */
/** Setzt data-theme am <html> und passt die Statusleistenfarbe an.
    'auto' entfernt das Attribut, dann entscheidet prefers-color-scheme. */
function applyTheme() {
  const t = DB.settings.theme || 'auto';
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);

  const dunkel = t === 'dark' ||
    (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dunkel ? '#000000' : '#f2f2f7');
}

/* ---------- Rendering ---------- */
function renderAll() {
  renderHeute();
  renderPflanzen();
  renderPlan();
  renderMore();
}

function renderHeute() {
  const d = new Date();
  $('#heute-datum').textContent = d.toLocaleDateString('de-DE',
    { weekday: 'long', day: 'numeric', month: 'long' });

  const faellig = DB.plants.filter(p => tageBis(p) <= 0);
  const bald = DB.plants.filter(p => { const t = tageBis(p); return t > 0 && t <= 2; });

  $('#st-faellig').textContent = faellig.length;
  $('#st-bald').textContent = bald.length;
  $('#st-gesamt').textContent = DB.plants.length;

  const box = $('#heute-liste');
  if (!DB.plants.length) {
    box.innerHTML = `<div class="empty"><div class="big">🌱</div>
      <p><b>Noch keine Pflanzen</b></p>
      <p>Tippe oben auf ＋ und leg deine erste Pflanze an.</p></div>`;
    return;
  }
  if (!faellig.length && !bald.length) {
    const naechst = DB.plants.slice().sort((a, b) => tageBis(a) - tageBis(b))[0];
    box.innerHTML = `<div class="empty"><div class="big">✅</div>
      <p><b>Alles gegossen</b></p>
      <p>Nächste Pflanze: ${esc(naechst.name)} ${statusText(naechst).toLowerCase()}.</p></div>`;
    return;
  }

  let html = '';
  if (faellig.length) {
    html += `<div class="section-title">Jetzt gießen</div>`;
    html += faellig.sort((a, b) => tageBis(a) - tageBis(b)).map(plantRow).join('');
  }
  if (bald.length) {
    html += `<div class="section-title">Demnächst</div>`;
    html += bald.sort((a, b) => tageBis(a) - tageBis(b)).map(plantRow).join('');
  }
  const dueng = DB.plants.filter(p => { const t = duengerTageBis(p); return t !== null && t <= 0; });
  if (dueng.length) {
    html += `<div class="section-title">Düngen fällig</div>`;
    html += dueng.map(p => `
      <div class="plant" data-open="${p.id}">
        ${avatarHTML(p)}
        <div class="info">
          <div class="nm">${esc(p.name)}</div>
          <div class="meta">Dünger fällig${p.raum ? ' · ' + esc(p.raum) : ''}</div>
        </div>
        <button class="water-btn due" data-dueng="${p.id}">🌿</button>
      </div>`).join('');
  }
  box.innerHTML = html;
}

function plantRow(p) {
  const st = statusOf(p);
  const iv = effIntervall(p);
  const t = tageBis(p);
  const pct = Math.max(0, Math.min(100, Math.round((1 - (t / iv)) * 100)));
  return `
  <div class="plant" data-open="${p.id}">
    ${avatarHTML(p)}
    <div class="info">
      <div class="nm">${esc(p.name)}</div>
      <div class="meta">${statusText(p)}${p.raum ? ' · ' + esc(p.raum) : ''}${p.menge ? ' · ' + esc(p.menge) : ''}</div>
      <div class="bar"><i class="${st === 'over' ? 'over' : st === 'soon' ? 'soon' : ''}" style="width:${pct}%"></i></div>
    </div>
    <button class="water-btn ${st === 'over' ? 'over' : st === 'due' ? 'due' : ''}" data-water="${p.id}" title="Gegossen">💧</button>
  </div>`;
}

function renderPflanzen() {
  const raeume = Array.from(new Set(DB.plants.map(p => p.raum).filter(Boolean))).sort();
  $('#pflanzen-sub').textContent = DB.plants.length + (DB.plants.length === 1 ? ' Pflanze' : ' Pflanzen');

  $('#raum-chips').innerHTML = raeume.length
    ? [`<button class="chip ${raumFilter === 'alle' ? 'on' : ''}" data-raum="alle">Alle</button>`]
      .concat(raeume.map(r => `<button class="chip ${raumFilter === r ? 'on' : ''}" data-raum="${esc(r)}">${esc(r)}</button>`))
      .join('')
    : '';

  const liste = raumFilter === 'alle' ? DB.plants : DB.plants.filter(p => p.raum === raumFilter);
  const grid = $('#pflanzen-grid');
  if (!liste.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">🪴</div>
      <p>Keine Pflanzen in dieser Ansicht.</p></div>`;
    return;
  }
  grid.innerHTML = liste.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')).map(p => `
    <button class="tile" data-open="${p.id}">
      ${avatarHTML(p)}
      <div class="nm">${esc(p.name)}</div>
      <div class="meta">${statusText(p)}</div>
    </button>`).join('');

  $('#raum-list').innerHTML = raeume.map(r => `<option value="${esc(r)}">`).join('');
}

function renderPlan() {
  const box = $('#plan-liste');
  if (!DB.plants.length) { box.innerHTML = `<div class="empty"><div class="big">🗓</div><p>Noch nichts geplant.</p></div>`; return; }

  let html = '';
  const heute = heute0();
  const ueber = DB.plants.filter(p => tageBis(p) < 0);
  if (ueber.length) {
    html += `<div class="section-title" style="color:var(--red)">Überfällig</div>`;
    html += ueber.sort((a, b) => tageBis(a) - tageBis(b)).map(plantRow).join('');
  }
  for (let i = 0; i < 14; i++) {
    const tag = new Date(heute.getTime() + i * 86400000);
    const drin = DB.plants.filter(p => tageBis(p) === i);
    if (!drin.length) continue;
    const label = i === 0 ? 'Heute' : i === 1 ? 'Morgen'
      : tag.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'short' });
    html += `<div class="section-title">${label}</div>` + drin.map(plantRow).join('');
  }
  if (!html) html = `<div class="empty"><div class="big">😌</div><p>In den nächsten 14 Tagen ist nichts fällig.</p></div>`;
  box.innerHTML = html;
}

function renderMore() {
  $('#version-sub').textContent = 'Version ' + VERSION;
  $('#about-version').textContent = VERSION;
  $('#dat-anzahl').textContent = DB.plants.length;
  $('#dat-logs').textContent = DB.logs.length;
  $('#set-theme').value = DB.settings.theme || 'auto';
  $('#set-winter').value = DB.settings.winter;
  $('#set-vorwarn').value = String(DB.settings.vorwarn);
  $('#set-pushzeit').value = DB.settings.pushZeit;
  updatePushUI();
}

/* ---------- Aktionen ---------- */
function giessen(id) {
  const p = DB.plants.find(x => x.id === id);
  if (!p) return;
  p.letzt = toISO(new Date());
  DB.logs.push({ id: uid(), plantId: id, typ: 'wasser', ts: Date.now() });
  save(); renderAll();
  if (navigator.vibrate) navigator.vibrate(12);
  toast('💧 ' + p.name + ' gegossen');
}
function duengen(id) {
  const p = DB.plants.find(x => x.id === id);
  if (!p) return;
  p.duengerLetzt = toISO(new Date());
  DB.logs.push({ id: uid(), plantId: id, typ: 'duenger', ts: Date.now() });
  save(); renderAll();
  toast('🌿 ' + p.name + ' gedüngt');
}

/* ---------- Sheets ---------- */
function openSheet(sel) { $(sel).classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeSheets() { $$('.sheet').forEach(s => s.classList.remove('open')); document.body.style.overflow = ''; }

function openEdit(id) {
  editId = id || null;
  const p = id ? DB.plants.find(x => x.id === id) : null;
  $('#edit-title').textContent = p ? 'Pflanze bearbeiten' : 'Neue Pflanze';
  $('#f-name').value = p ? p.name : '';
  $('#f-art').value = p ? (p.art || '') : '';
  $('#f-raum').value = p ? (p.raum || '') : '';
  $('#f-intervall').value = p ? p.intervall : 7;
  $('#f-letzt').value = p ? (p.letzt || toISO(new Date())) : toISO(new Date());
  $('#f-menge').value = p ? (p.menge || '') : '';
  $('#f-duenger-int').value = p ? (p.duengerInt || 0) : 0;
  $('#f-duenger-letzt').value = p ? (p.duengerLetzt || '') : '';
  $('#f-licht').value = p ? (p.licht || '') : '';
  $('#f-notiz').value = p ? (p.notiz || '') : '';
  editEmoji = p ? (p.emoji || '🪴') : '🪴';
  editFoto = p ? (p.foto || null) : null;
  $('#btn-delete').style.display = p ? 'block' : 'none';
  $('#btn-foto-del').style.display = editFoto ? 'block' : 'none';
  renderEmojiPick();
  openSheet('#sheet-edit');
  if (!p) setTimeout(() => $('#f-name').focus(), 300);
}

function renderEmojiPick() {
  $('#emoji-pick').innerHTML = EMOJIS.map(e =>
    `<button data-emoji="${e}" class="${e === editEmoji && !editFoto ? 'on' : ''}">${e}</button>`).join('');
}

function speichern() {
  const name = $('#f-name').value.trim();
  if (!name) { toast('Bitte einen Namen eingeben'); $('#f-name').focus(); return; }
  const daten = {
    name,
    art: $('#f-art').value.trim(),
    raum: $('#f-raum').value.trim(),
    emoji: editEmoji,
    foto: editFoto,
    intervall: Math.max(1, Number($('#f-intervall').value) || 7),
    letzt: $('#f-letzt').value || toISO(new Date()),
    menge: $('#f-menge').value.trim(),
    duengerInt: Math.max(0, Number($('#f-duenger-int').value) || 0),
    duengerLetzt: $('#f-duenger-letzt').value || '',
    licht: $('#f-licht').value,
    notiz: $('#f-notiz').value.trim()
  };
  if (editId) {
    const p = DB.plants.find(x => x.id === editId);
    Object.assign(p, daten);
    toast('Gespeichert');
  } else {
    DB.plants.push(Object.assign({ id: uid(), created: Date.now() }, daten));
    toast('🪴 ' + name + ' angelegt');
  }
  save(); renderAll(); closeSheets();
}

function loeschen() {
  const p = DB.plants.find(x => x.id === editId);
  if (!p) return;
  if (!confirm(p.name + ' wirklich löschen?')) return;
  DB.plants = DB.plants.filter(x => x.id !== editId);
  DB.logs = DB.logs.filter(l => l.plantId !== editId);
  save(); renderAll(); closeSheets();
  toast('Gelöscht');
}

function openDetail(id) {
  const p = DB.plants.find(x => x.id === id);
  if (!p) return;
  const st = statusOf(p);
  const dt = duengerTageBis(p);
  const logs = DB.logs.filter(l => l.plantId === id).sort((a, b) => b.ts - a.ts).slice(0, 8);

  $('#detail-body').innerHTML = `
    <div class="grabber"></div>
    <div class="detail-hero">
      ${avatarHTML(p)}
      <h2>${esc(p.name)}</h2>
      <p>${esc(p.art || '')}${p.art && p.raum ? ' · ' : ''}${esc(p.raum || '')}</p>
      <p style="margin-top:10px"><span class="badge ${st === 'ok' ? '' : st}">${statusText(p)}</span></p>
    </div>

    <button class="btn" data-water="${p.id}">💧 Jetzt gegossen</button>
    ${p.duengerInt ? `<button class="btn sec" data-dueng="${p.id}">🌿 Gedüngt</button>` : ''}

    <div class="section-title">Pflege</div>
    <div class="group">
      <div class="field"><label>Gießintervall</label><span class="hint">alle ${p.intervall} Tage${winterAktiv() ? ' (Winter: ' + effIntervall(p) + ')' : ''}</span></div>
      <div class="field"><label>Zuletzt gegossen</label><span class="hint">${p.letzt ? fromISO(p.letzt).toLocaleDateString('de-DE') : '–'}</span></div>
      ${p.menge ? `<div class="field"><label>Wassermenge</label><span class="hint">${esc(p.menge)}</span></div>` : ''}
      ${p.licht ? `<div class="field"><label>Licht</label><span class="hint">${esc(p.licht)}</span></div>` : ''}
      ${dt !== null ? `<div class="field"><label>Düngen</label><span class="hint">${dt <= 0 ? 'fällig' : 'in ' + dt + ' Tagen'}</span></div>` : ''}
    </div>

    ${p.notiz ? `<div class="section-title">Notizen</div><div class="card" style="white-space:pre-wrap">${esc(p.notiz)}</div>` : ''}

    ${logs.length ? `<div class="section-title">Verlauf</div><div class="group">` + logs.map(l => `
      <div class="log-item"><span>${l.typ === 'wasser' ? '💧 Gegossen' : '🌿 Gedüngt'}</span>
      <span>${new Date(l.ts).toLocaleDateString('de-DE')}</span></div>`).join('') + `</div>` : ''}

    <button class="btn sec" data-edit="${p.id}">Bearbeiten</button>
    <button class="btn sec" data-close>Schließen</button>
  `;
  openSheet('#sheet-detail');
}

/* ---------- Foto ---------- */
function fotoVerarbeiten(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const max = 400;
      const s = Math.min(max / img.width, max / img.height, 1);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      editFoto = c.toDataURL('image/jpeg', 0.72);
      $('#btn-foto-del').style.display = 'block';
      renderEmojiPick();
      toast('Foto übernommen');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ---------- Export / Import ---------- */
function exportieren() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'gruenzeug-' + toISO(new Date()) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importieren(file) {
  const r = new FileReader();
  r.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      if (!Array.isArray(d.plants)) throw new Error('Kein gültiges Grünzeug-Backup');
      if (!confirm('Import ersetzt alle aktuellen Daten (' + DB.plants.length + ' Pflanzen). Fortfahren?')) return;
      DB.plants = d.plants;
      DB.logs = d.logs || [];
      DB.settings = Object.assign(DB.settings, d.settings || {});
      save(); renderAll();
      toast(d.plants.length + ' Pflanzen importiert');
    } catch (err) { toast('Import fehlgeschlagen: ' + err.message); }
  };
  r.readAsText(file);
}

/* ---------- Push ---------- */
function updatePushUI() {
  const el = $('#push-status');
  const btn = $('#btn-push-toggle');
  if (!('Notification' in window)) {
    el.textContent = 'nicht unterstützt'; btn.style.display = 'none'; return;
  }
  if (DB.settings.pushAktiv && Notification.permission === 'granted') {
    el.textContent = 'aktiv';
    btn.textContent = 'Push deaktivieren';
    btn.className = 'btn sec';
  } else {
    el.textContent = Notification.permission === 'denied' ? 'vom Browser blockiert' : 'nicht aktiv';
    btn.textContent = 'Push aktivieren';
    btn.className = 'btn';
  }
}

async function pushToggle() {
  if (DB.settings.pushAktiv) {
    DB.settings.pushAktiv = false; save(); updatePushUI();
    toast('Erinnerungen deaktiviert');
    return;
  }
  if (!('Notification' in window)) { toast('Dieser Browser kann keine Benachrichtigungen'); return; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Berechtigung abgelehnt'); updatePushUI(); return; }

  if (!PUSH_SERVER || !VAPID_PUBLIC) {
    DB.settings.pushAktiv = true; save(); updatePushUI();
    toast('Berechtigung erteilt – Push-Server folgt im nächsten Schritt');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8(VAPID_PUBLIC)
    });
    await fetch(PUSH_SERVER + '/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub, zeit: DB.settings.pushZeit })
    });
    DB.settings.pushAktiv = true; save(); updatePushUI();
    toast('Erinnerungen aktiviert');
  } catch (e) {
    toast('Push fehlgeschlagen: ' + e.message);
  }
}
function urlB64ToUint8(s) {
  const pad = '='.repeat((4 - s.length % 4) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

/* ---------- Tabs ---------- */
function tab(name) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + name).classList.add('active');
  $$('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  window.scrollTo(0, 0);
}

/* ---------- Events ---------- */
function bind() {
  $$('.tabbar button').forEach(b => b.onclick = () => tab(b.dataset.tab));
  $('#btn-add-top').onclick = () => openEdit(null);
  $('#btn-add-2').onclick = () => openEdit(null);
  $('#btn-save').onclick = speichern;
  $('#btn-delete').onclick = loeschen;

  $('#btn-foto').onclick = () => $('#f-foto').click();
  $('#f-foto').onchange = e => { if (e.target.files[0]) fotoVerarbeiten(e.target.files[0]); e.target.value = ''; };
  $('#btn-foto-del').onclick = () => { editFoto = null; $('#btn-foto-del').style.display = 'none'; renderEmojiPick(); };

  $('#btn-export').onclick = exportieren;
  $('#btn-import').onclick = () => $('#file-import').click();
  $('#file-import').onchange = e => { if (e.target.files[0]) importieren(e.target.files[0]); e.target.value = ''; };
  $('#btn-reset').onclick = () => {
    if (!confirm('Wirklich ALLE Pflanzen und Verläufe löschen? Das lässt sich nicht rückgängig machen.')) return;
    DB.plants = []; DB.logs = []; save(); renderAll(); toast('Alle Daten gelöscht');
  };

  $('#btn-push-toggle').onclick = pushToggle;
  $('#set-theme').onchange = e => { DB.settings.theme = e.target.value; save(); applyTheme(); };
  $('#set-winter').onchange = e => { DB.settings.winter = e.target.value; save(); renderAll(); };
  $('#set-vorwarn').onchange = e => { DB.settings.vorwarn = Number(e.target.value); save(); renderAll(); };
  $('#set-pushzeit').onchange = e => { DB.settings.pushZeit = e.target.value; save(); };

  /* Delegation für dynamische Inhalte */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-water],[data-dueng],[data-open],[data-emoji],[data-raum],[data-edit],[data-close]');
    if (!t) return;
    if (t.dataset.close !== undefined) { closeSheets(); return; }
    if (t.dataset.water) { e.stopPropagation(); giessen(t.dataset.water); if ($('#sheet-detail').classList.contains('open')) openDetail(t.dataset.water); return; }
    if (t.dataset.dueng) { e.stopPropagation(); duengen(t.dataset.dueng); if ($('#sheet-detail').classList.contains('open')) openDetail(t.dataset.dueng); return; }
    if (t.dataset.edit) { closeSheets(); setTimeout(() => openEdit(t.dataset.edit), 180); return; }
    if (t.dataset.open) { openDetail(t.dataset.open); return; }
    if (t.dataset.emoji) { editEmoji = t.dataset.emoji; editFoto = null; $('#btn-foto-del').style.display = 'none'; renderEmojiPick(); return; }
    if (t.dataset.raum) { raumFilter = t.dataset.raum; renderPflanzen(); return; }
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheets(); });

  /* Beim Zurückkehren neu berechnen (Tageswechsel) */
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });
}

/* ---------- Start ---------- */
load();
applyTheme();
bind();
renderAll();

/* Systemwechsel nur nachziehen, solange 'System' eingestellt ist */
window.matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => { if ((DB.settings.theme || 'auto') === 'auto') applyTheme(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW:', e));
  });
}
