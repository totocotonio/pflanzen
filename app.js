/* ============================================================
   Grünzeug – Pflanzen gießen
   Single-File PWA, Daten in localStorage (Prefix pg_)
   ============================================================ */
'use strict';

const VERSION = '1.3.0';

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
function save(sync) {
  try { localStorage.setItem(KEY, JSON.stringify(DB)); }
  catch (e) { toast('Speichern fehlgeschlagen – Speicher voll?'); }
  if (sync !== false && SYNC.user) { SYNC.dirty = true; speichereSync(); planeSync(); }
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



/* ---------- Beispielpflanzen ----------
   Typische Zimmerpflanzen mit üblichen Gießintervallen. Werden wie normal
   angelegte Pflanzen behandelt und lassen sich einzeln oder alle löschen.
   `vorTagen` streut das letzte Gießdatum, damit die Ansicht etwas zeigt. */
const BEISPIELE = [
  { name: 'Monstera',     art: 'Monstera deliciosa',  raum: 'Wohnzimmer', emoji: '🪴', intervall: 7,  vorTagen: 8, menge: '300 ml', licht: 'Hell, ohne direkte Sonne', duengerInt: 30, notiz: 'Luftwurzeln nicht abschneiden, im Frühjahr umtopfen.' },
  { name: 'Bogenhanf',    art: 'Sansevieria',         raum: 'Schlafzimmer', emoji: '🌿', intervall: 21, vorTagen: 21, menge: '150 ml', licht: 'Halbschatten', duengerInt: 0, notiz: 'Verzeiht Trockenheit, Staunässe gar nicht.' },
  { name: 'Efeutute',     art: 'Epipremnum aureum',   raum: 'Wohnzimmer', emoji: '🍀', intervall: 6,  vorTagen: 5, menge: '200 ml', licht: 'Halbschatten', duengerInt: 0, notiz: '' },
  { name: 'Basilikum',    art: '',                    raum: 'Küche',      emoji: '🌱', intervall: 2,  vorTagen: 2, menge: '100 ml', licht: 'Vollsonne', duengerInt: 0, notiz: 'Von unten gießen, Blätter trocken halten.' },
  { name: 'Kaktus',       art: 'Echinopsis',          raum: 'Fensterbank', emoji: '🌵', intervall: 30, vorTagen: 12, menge: '50 ml', licht: 'Vollsonne', duengerInt: 0, notiz: 'Im Winter fast gar nicht gießen.' },
  { name: 'Zitronenbaum', art: 'Citrus limon',        raum: 'Wintergarten', emoji: '🍋', intervall: 4, vorTagen: 3, menge: '500 ml', licht: 'Vollsonne', duengerInt: 14, notiz: 'Im Winter kühl und heller stellen.' },
  { name: 'Orchidee',     art: 'Phalaenopsis',        raum: 'Bad',        emoji: '🌺', intervall: 10, vorTagen: 6, menge: 'tauchen', licht: 'Hell, ohne direkte Sonne', duengerInt: 21, notiz: 'Alle 10 Tage tauchen, gut abtropfen lassen.' },
  { name: 'Aloe Vera',    art: 'Aloe barbadensis',    raum: 'Fensterbank', emoji: '🌵', intervall: 18, vorTagen: 4, menge: '100 ml', licht: 'Vollsonne', duengerInt: 0, notiz: '' }
];

function beispieleLaden() {
  const vorhanden = new Set(DB.plants.map(p => p.name.toLowerCase()));
  const neue = BEISPIELE
    .filter(b => !vorhanden.has(b.name.toLowerCase()))
    .map((b, i) => ({
      id: uid() + i,
      created: Date.now() + i,
      name: b.name, art: b.art, raum: b.raum, emoji: b.emoji,
      foto: null,
      intervall: b.intervall,
      letzt: toISO(new Date(Date.now() - b.vorTagen * 86400000)),
      menge: b.menge,
      duengerInt: b.duengerInt,
      duengerLetzt: b.duengerInt ? toISO(new Date(Date.now() - b.duengerInt * 86400000)) : '',
      licht: b.licht,
      notiz: b.notiz
    }));
  if (!neue.length) { toast('Die Beispiele sind schon angelegt'); return; }
  DB.plants = DB.plants.concat(neue);
  save();
  renderAll();
  toast(neue.length + ' Beispielpflanzen angelegt');
}

/** Löschen aus der Detailansicht heraus. */
function loeschePflanze(id) {
  const p = DB.plants.find(x => x.id === id);
  if (!p) return;
  if (!confirm(p.name + ' wirklich löschen?\n\nDer Gießverlauf dieser Pflanze wird mitgelöscht.')) return;
  DB.plants = DB.plants.filter(x => x.id !== id);
  DB.logs = DB.logs.filter(l => l.plantId !== id);
  save();
  renderAll();
  closeSheets();
  toast(p.name + ' gelöscht');
}

/* ---------- Versionshistorie ----------
   Muss bei jedem Release zusammen mit VERSION, VERSION-Datei, CHANGELOG.md
   und der Tabelle in README.md gepflegt werden. Neueste Version oben. */
const HISTORIE = [
  { v: '1.3.0', datum: '29.08.2026', punkte: [
    'Beispielpflanzen zum Ausprobieren – anlegbar über den leeren Startbildschirm oder unter Mehr.',
    'Pflanze löschen jetzt direkt in der Detailansicht, nicht mehr nur über Bearbeiten.'
  ]},
  { v: '1.2.0', datum: '29.08.2026', punkte: [
    'Anmeldung mit Benutzername und Passwort.',
    'Geräte-Sync: Handy und PC zeigen denselben Stand.',
    'Offline weiter nutzbar, Änderungen werden nachgeholt.',
    'Nachfrage, wenn zwei Geräte dasselbe geändert haben.',
    'Umschalter für Hell und Dunkel direkt auf der Startseite.',
    'Diese Versionshistorie.'
  ]},
  { v: '1.1.0', datum: '29.08.2026', punkte: [
    'Erscheinungsbild wählbar: System, Hell oder Dunkel.',
    'Desktop-Layout ab 768 px mit zentriertem Inhalt und größerem Raster.'
  ]},
  { v: '1.0.0', datum: '29.08.2026', punkte: [
    'Erste Fassung: Gießplan mit Fälligkeitsberechnung und Ein-Tipp-Gießen.',
    'Pflanzen-Datenbank mit Foto oder Emoji, Standort und Notizen.',
    'Dünger-Intervall, Plan-Ansicht über 14 Tage, Winter-Modus.',
    'Export und Import als JSON, Offline-Betrieb per Service Worker.'
  ]}
];

function zeigeHistorie() {
  $('#historie-liste').innerHTML = HISTORIE.map(r => `
    <div class="rel">
      <div class="rel-kopf">
        <div class="rel-nr">v${esc(r.v)}${r.v === VERSION ? '<span class="jetzt">aktuell</span>' : ''}</div>
        <div class="rel-datum">${esc(r.datum)}</div>
      </div>
      <ul>${r.punkte.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    </div>`).join('');
  openSheet('#sheet-historie');
}

/* ---------- Konto und Synchronisierung ----------
   localStorage bleibt der Primärspeicher: die App funktioniert offline
   vollständig. Änderungen werden verzögert zum Server geschoben. Die
   Revisionsnummer stammt vom Server und verhindert, dass ein Gerät die
   Änderungen eines anderen unbemerkt überschreibt. */
const API = '/api';
const SYNC_KEY = 'pg_sync';
let SYNC = { rev: 0, dirty: false, user: null, lokalOk: false, status: 'lokal', laeuft: false, timer: null };

function ladeSync() {
  try {
    const d = JSON.parse(localStorage.getItem(SYNC_KEY) || '{}');
    SYNC.rev = d.rev || 0;
    SYNC.dirty = !!d.dirty;
    SYNC.user = d.user || null;
    SYNC.lokalOk = !!d.lokalOk;
  } catch (e) { /* erster Start */ }
}
function speichereSync() {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(
      { rev: SYNC.rev, dirty: SYNC.dirty, user: SYNC.user, lokalOk: SYNC.lokalOk }));
  } catch (e) { /* Speicher voll – der Datensatz selbst hat Vorrang */ }
}

function api(pfad, opts) {
  return fetch(API + pfad, Object.assign({
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }
  }, opts || {}));
}

/** Aktuellen Stand als das schicken, was der Server speichern soll. */
function nutzdaten() {
  return { plants: DB.plants, logs: DB.logs, settings: DB.settings };
}

function planeSync() {
  if (!SYNC.user) return;
  clearTimeout(SYNC.timer);
  SYNC.timer = setTimeout(schiebeHoch, 1500);
}

async function schiebeHoch() {
  if (!SYNC.user || SYNC.laeuft) return;
  SYNC.laeuft = true;
  try {
    const r = await api('/data', {
      method: 'PUT',
      body: JSON.stringify({ rev: SYNC.rev, daten: nutzdaten() })
    });
    if (r.status === 401) { SYNC.user = null; speichereSync(); zeigeLogin(); return; }
    if (r.status === 409) {
      const d = (await r.json()).detail;
      SYNC.laeuft = false;
      loeseKonflikt(d);
      return;
    }
    if (!r.ok) throw new Error('Status ' + r.status);
    SYNC.rev = (await r.json()).rev;
    SYNC.dirty = false;
    SYNC.status = 'ok';
  } catch (e) {
    SYNC.status = navigator.onLine ? 'fehler' : 'offline';
  } finally {
    SYNC.laeuft = false;
    speichereSync();
    renderMore();
  }
}

/** Serverstand lokal übernehmen. */
function uebernehmeServer(s) {
  const d = s.daten || {};
  DB.plants = d.plants || [];
  DB.logs = d.logs || [];
  DB.settings = Object.assign(DB.settings, d.settings || {});
  SYNC.rev = s.rev;
  SYNC.dirty = false;
  SYNC.status = 'ok';
  save(false);
  speichereSync();
  applyTheme();
  renderAll();
}

/** Beide Seiten wurden geändert – das kann nur der Mensch entscheiden. */
function loeseKonflikt(s) {
  const zahl = n => (n === 1 ? '1 Pflanze' : n + ' Pflanzen');
  const aufServer = ((s.daten || {}).plants || []).length;
  const hier = DB.plants.length;
  const text =
    'Auf einem anderen Gerät wurde ebenfalls geändert.\n\n' +
    'Server: ' + zahl(aufServer) + '\n' +
    'Dieses Gerät: ' + zahl(hier) + ' (noch nicht hochgeladen)\n\n' +
    'OK\t\t= Stand vom Server übernehmen\n' +
    '\t\t  (Änderungen auf diesem Gerät gehen verloren)\n' +
    'Abbrechen\t= diesen Stand hochladen\n' +
    '\t\t  (Änderungen vom anderen Gerät gehen verloren)';
  if (confirm(text)) {
    uebernehmeServer(s);
    toast('Stand vom Server übernommen');
  } else {
    SYNC.rev = s.rev;         // auf den Serverstand aufsetzen und überschreiben
    speichereSync();
    schiebeHoch();
    toast('Dieses Gerät hat den Server überschrieben');
  }
}

/** Erster Abgleich nach dem Anmelden bzw. beim Start. */
async function abgleichen() {
  const r = await api('/data');
  if (r.status === 401) { SYNC.user = null; speichereSync(); zeigeLogin(); return; }
  if (!r.ok) throw new Error('Status ' + r.status);
  const s = await r.json();

  if (s.rev === 0) {
    // Server noch leer
    if (DB.plants.length) { SYNC.rev = 0; SYNC.dirty = true; await schiebeHoch(); }
    else { SYNC.rev = 0; SYNC.dirty = false; SYNC.status = 'ok'; }
  } else if (!SYNC.dirty) {
    uebernehmeServer(s);
  } else if (SYNC.rev === s.rev) {
    await schiebeHoch();
  } else {
    loeseKonflikt(s);
  }
  speichereSync();
  renderMore();
}

function zeigeLogin() {
  if (SYNC.lokalOk) return;
  $('#login-screen').hidden = false;
  $('#lg-fehler').textContent = '';
  setTimeout(() => $('#lg-name').focus(), 120);
}
function versteckeLogin() { $('#login-screen').hidden = true; }

async function anmelden(name, passwort) {
  const r = await api('/login', { method: 'POST', body: JSON.stringify({ name, passwort }) });
  if (r.status === 401) throw new Error('Name oder Passwort stimmt nicht');
  if (r.status === 429) throw new Error('Zu viele Versuche. Bitte ein paar Minuten warten.');
  if (!r.ok) throw new Error('Anmeldung fehlgeschlagen (' + r.status + ')');
  SYNC.user = (await r.json()).name;
  SYNC.lokalOk = false;
  speichereSync();
}

async function abmelden() {
  if (SYNC.dirty && !confirm('Es sind noch Änderungen nicht hochgeladen. Trotzdem abmelden?')) return;
  try { await api('/logout', { method: 'POST' }); } catch (e) { /* egal */ }
  SYNC.user = null;
  SYNC.rev = 0;
  SYNC.dirty = false;
  SYNC.status = 'lokal';
  SYNC.lokalOk = false;
  speichereSync();
  renderMore();
  zeigeLogin();
}

function syncText() {
  if (!SYNC.user) return 'aus – nur auf diesem Gerät';
  switch (SYNC.status) {
    case 'ok': return SYNC.dirty ? 'wird gesichert …' : 'aktuell';
    case 'offline': return 'offline – wird nachgeholt';
    case 'fehler': return 'Server nicht erreichbar';
    default: return SYNC.dirty ? 'noch nicht gesichert' : 'aktuell';
  }
}

/** Start: lokale Daten stehen sofort, der Server wird danach befragt. */
async function starte() {
  try {
    const r = await api('/me');
    if (r.status === 401) {
      SYNC.user = null; SYNC.status = 'lokal'; speichereSync();
      zeigeLogin(); renderMore(); return;
    }
    if (!r.ok) throw new Error('Status ' + r.status);
    SYNC.user = (await r.json()).name;
    speichereSync();
    versteckeLogin();
    await abgleichen();
  } catch (e) {
    // Kein Netz oder kein Server: wer die App schon nutzt, arbeitet weiter
    SYNC.status = SYNC.user ? 'offline' : 'lokal';
    if (SYNC.user || SYNC.lokalOk || DB.plants.length) versteckeLogin();
    else zeigeLogin();
    renderMore();
  }
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

  // Der Knopf zeigt, wohin es geht, nicht wo man ist
  const knopf = document.querySelector('#btn-theme');
  if (knopf) {
    knopf.textContent = dunkel ? '☀️' : '🌙';
    knopf.title = dunkel ? 'Auf Hell umschalten' : 'Auf Dunkel umschalten';
  }
}

/** Umschalter im Kopf der Startseite: springt zwischen Hell und Dunkel.
    Die dritte Möglichkeit "System" bleibt unter Mehr wählbar. */
function themeUmschalten() {
  const dunkelJetzt = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.getAttribute('data-theme') &&
     window.matchMedia('(prefers-color-scheme: dark)').matches);
  DB.settings.theme = dunkelJetzt ? 'light' : 'dark';
  save();
  applyTheme();
  renderMore();
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
      <p>Tippe oben auf ＋ und leg deine erste Pflanze an.</p>
      <button class="btn sec" id="btn-beispiele-leer" style="max-width:260px;margin:22px auto 0">
        Beispiele zum Ausprobieren</button></div>`;
    $('#btn-beispiele-leer').onclick = beispieleLaden;
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
  $('#konto-name').textContent = SYNC.user || 'nicht angemeldet';
  $('#sync-status').textContent = syncText();
  $('#btn-logout').style.display = SYNC.user ? 'block' : 'none';
  $('#btn-anmelden').style.display = SYNC.user ? 'none' : 'block';
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
    <button class="btn danger" data-del="${p.id}">Pflanze löschen</button>
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
  $('#zeile-historie').onclick = zeigeHistorie;
  $('#btn-theme').onclick = themeUmschalten;
  $('#btn-add-top').onclick = () => openEdit(null);
  $('#btn-add-2').onclick = () => openEdit(null);
  $('#btn-save').onclick = speichern;
  $('#btn-delete').onclick = loeschen;

  $('#btn-foto').onclick = () => $('#f-foto').click();
  $('#f-foto').onchange = e => { if (e.target.files[0]) fotoVerarbeiten(e.target.files[0]); e.target.value = ''; };
  $('#btn-foto-del').onclick = () => { editFoto = null; $('#btn-foto-del').style.display = 'none'; renderEmojiPick(); };

  $('#btn-beispiele').onclick = beispieleLaden;
  $('#btn-export').onclick = exportieren;
  $('#btn-import').onclick = () => $('#file-import').click();
  $('#file-import').onchange = e => { if (e.target.files[0]) importieren(e.target.files[0]); e.target.value = ''; };
  $('#btn-reset').onclick = () => {
    if (!confirm('Wirklich ALLE Pflanzen und Verläufe löschen? Das lässt sich nicht rückgängig machen.')) return;
    DB.plants = []; DB.logs = []; save(); renderAll(); toast('Alle Daten gelöscht');
  };

  $('#login-form').onsubmit = async e => {
    e.preventDefault();
    const btn = $('#lg-btn');
    btn.disabled = true; btn.textContent = 'Anmelden …';
    $('#lg-fehler').textContent = '';
    try {
      await anmelden($('#lg-name').value.trim(), $('#lg-pass').value);
      $('#lg-pass').value = '';
      versteckeLogin();
      await abgleichen();
      toast('Angemeldet als ' + SYNC.user);
    } catch (err) {
      $('#lg-fehler').textContent = err.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Anmelden';
    }
  };
  $('#lg-offline').onclick = () => {
    SYNC.lokalOk = true; SYNC.status = 'lokal'; speichereSync();
    versteckeLogin(); renderMore();
  };
  $('#btn-logout').onclick = abmelden;
  $('#btn-anmelden').onclick = () => { SYNC.lokalOk = false; speichereSync(); zeigeLogin(); };

  /* Nicht hochgeladene Änderungen nachholen, sobald es wieder geht */
  window.addEventListener('online', () => { if (SYNC.dirty) schiebeHoch(); });

  $('#btn-push-toggle').onclick = pushToggle;
  $('#set-theme').onchange = e => { DB.settings.theme = e.target.value; save(); applyTheme(); };
  $('#set-winter').onchange = e => { DB.settings.winter = e.target.value; save(); renderAll(); };
  $('#set-vorwarn').onchange = e => { DB.settings.vorwarn = Number(e.target.value); save(); renderAll(); };
  $('#set-pushzeit').onchange = e => { DB.settings.pushZeit = e.target.value; save(); };

  /* Delegation für dynamische Inhalte */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-water],[data-dueng],[data-open],[data-emoji],[data-raum],[data-edit],[data-del],[data-close]');
    if (!t) return;
    if (t.dataset.close !== undefined) { closeSheets(); return; }
    if (t.dataset.water) { e.stopPropagation(); giessen(t.dataset.water); if ($('#sheet-detail').classList.contains('open')) openDetail(t.dataset.water); return; }
    if (t.dataset.dueng) { e.stopPropagation(); duengen(t.dataset.dueng); if ($('#sheet-detail').classList.contains('open')) openDetail(t.dataset.dueng); return; }
    if (t.dataset.edit) { closeSheets(); setTimeout(() => openEdit(t.dataset.edit), 180); return; }
    if (t.dataset.del) { loeschePflanze(t.dataset.del); return; }
    if (t.dataset.open) { openDetail(t.dataset.open); return; }
    if (t.dataset.emoji) { editEmoji = t.dataset.emoji; editFoto = null; $('#btn-foto-del').style.display = 'none'; renderEmojiPick(); return; }
    if (t.dataset.raum) { raumFilter = t.dataset.raum; renderPflanzen(); return; }
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheets(); });

  /* Beim Zurückkehren neu berechnen (Tageswechsel) */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    renderAll();
    if (!SYNC.user) return;
    if (SYNC.dirty) schiebeHoch();
    else abgleichen().catch(() => { SYNC.status = 'offline'; renderMore(); });
  });
}

/* ---------- Start ---------- */
load();
ladeSync();
applyTheme();
bind();
renderAll();
starte();

/* Systemwechsel nur nachziehen, solange 'System' eingestellt ist */
window.matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => { if ((DB.settings.theme || 'auto') === 'auto') applyTheme(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW:', e));
  });
}
