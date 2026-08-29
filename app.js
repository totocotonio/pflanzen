/* ============================================================
   Grünzeug – Pflanzen gießen
   Single-File PWA, Daten in localStorage (Prefix pg_)
   ============================================================ */
'use strict';

const VERSION = '1.9.0';

const KEY = 'pg_data';
const EMOJIS = ['🪴','🌿','🌵','🌱','🌴','🎍','🌺','🌻','🌷','🍀','🌾','🥬','🍋','🌶️','🫒'];

/* ---------- State ---------- */
let DB = {
  v: 1,
  plants: [],
  logs: [],
  settings: { winter: 'auto', vorwarn: 2, pushZeit: '09:00', pushAktiv: false, theme: 'auto',
             anzeigename: '', appName: '', avatar: '', avatarFoto: null,
             akzent: 'gruen', hintergrund: 'keiner', hintergrundFoto: null,
             startAnsicht: 'heute' }
};
let editId = null;      // null = neue Pflanze
let editEmoji = '🪴';
let editFoto = null;
let raumFilter = 'alle';
let heuteFilter = null;   // null | 'faellig' | 'bald' | 'alle'
let letzteAktion = null;  // für "Rückgängig" nach Gießen/Düngen

/* ---------- Persistenz ---------- */
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      DB = Object.assign(DB, d);
      DB.settings = Object.assign({ winter: 'auto', vorwarn: 2, pushZeit: '09:00', pushAktiv: false, theme: 'auto',
             anzeigename: '', appName: '', avatar: '', avatarFoto: null,
             akzent: 'gruen', hintergrund: 'keiner', hintergrundFoto: null,
             startAnsicht: 'heute' }, d.settings || {});
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
/** Fenster für "demnächst": folgt der Vorwarnung, ohne Vorwarnung drei Tage. */
function vorschauTage() {
  const v = Number(DB.settings.vorwarn) || 0;
  return v > 0 ? v : 3;
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
function toast(msg, aktionText, aktion) {
  const el = $('#toast');
  el.textContent = msg;
  if (aktionText && aktion) {
    const knopf = document.createElement('button');
    knopf.className = 'toast-aktion';
    knopf.textContent = aktionText;
    knopf.onclick = () => { el.classList.remove('show'); aktion(); };
    el.appendChild(knopf);
  }
  el.classList.add('show');
  clearTimeout(toast._t);
  // Mit Aktion länger stehen lassen, sonst ist sie nicht zu treffen
  toast._t = setTimeout(() => el.classList.remove('show'), aktionText ? 6000 : 2200);
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

/* ---------- Personalisierung ----------
   Alles liegt in DB.settings und wird damit zwischen den Geräten
   synchronisiert. Jedes Konto hat eigene Einstellungen. */

const AKZENTE = {
  gruen:   { name: 'Grün',    dunkel: '#30d158', hell: '#34c759', auf: '#000' },
  blau:    { name: 'Blau',    dunkel: '#0a84ff', hell: '#007aff', auf: '#fff' },
  tuerkis: { name: 'Türkis',  dunkel: '#40cbe0', hell: '#00a6c4', auf: '#000' },
  violett: { name: 'Violett', dunkel: '#bf5af2', hell: '#af52de', auf: '#fff' },
  pink:    { name: 'Pink',    dunkel: '#ff6482', hell: '#ff2d55', auf: '#fff' },
  rot:     { name: 'Rot',     dunkel: '#ff453a', hell: '#ff3b30', auf: '#fff' },
  orange:  { name: 'Orange',  dunkel: '#ff9f0a', hell: '#ff9500', auf: '#000' },
  gelb:    { name: 'Gelb',    dunkel: '#ffd60a', hell: '#f5c400', auf: '#000' }
};

const HINTERGRUENDE = {
  keiner:      { name: 'Keiner',     dunkel: null, hell: null },
  wald:        { name: 'Wald',       dunkel: 'linear-gradient(170deg,#08301f,#000 62%)',  hell: 'linear-gradient(170deg,#d5f0e2,#f2f2f7 62%)' },
  daemmerung:  { name: 'Dämmerung',  dunkel: 'linear-gradient(170deg,#2a1b3d,#000 65%)',  hell: 'linear-gradient(170deg,#ebe2f7,#f2f2f7 65%)' },
  meer:        { name: 'Meer',       dunkel: 'linear-gradient(170deg,#062a3d,#000 62%)',  hell: 'linear-gradient(170deg,#d6ecf7,#f2f2f7 62%)' },
  sand:        { name: 'Sand',       dunkel: 'linear-gradient(170deg,#332510,#000 62%)',  hell: 'linear-gradient(170deg,#f7ecd6,#f2f2f7 62%)' },
  rose:        { name: 'Rosé',       dunkel: 'linear-gradient(170deg,#3a1420,#000 62%)',  hell: 'linear-gradient(170deg,#f9e0e7,#f2f2f7 62%)' },
  nacht:       { name: 'Nacht',      dunkel: 'linear-gradient(170deg,#101a2e,#000 62%)',  hell: 'linear-gradient(170deg,#e0e7f5,#f2f2f7 62%)' }
};

const PROFIL_EMOJIS = ['🙂','😎','🌻','🐝','🦊','🐢','🌙','⭐','🍀','🪴','🌵','🐈','🐕','🎧','☕'];

function dunkelAktiv() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Setzt Akzentfarbe, Hintergrund, Begrüßung, Titel und Symbol. */
function applyPersonalisierung() {
  const st = DB.settings;
  const dunkel = dunkelAktiv();
  const wurzel = document.documentElement;

  // Akzentfarbe
  const a = AKZENTE[st.akzent] || AKZENTE.gruen;
  wurzel.style.setProperty('--accent', dunkel ? a.dunkel : a.hell);
  wurzel.style.setProperty('--on-accent', a.auf);

  // Hintergrund: eigenes Foto schlägt den Verlauf
  const koerper = document.body;
  if (st.hintergrund === 'foto' && st.hintergrundFoto) {
    koerper.style.setProperty('--hg-bild', 'url(' + st.hintergrundFoto + ')');
    koerper.style.setProperty('--hg-schleier', 'var(--schleier)');
    koerper.classList.add('hat-hg');
  } else {
    const h = HINTERGRUENDE[st.hintergrund] || HINTERGRUENDE.keiner;
    const bild = dunkel ? h.dunkel : h.hell;
    koerper.style.setProperty('--hg-bild', bild || 'none');
    koerper.style.setProperty('--hg-schleier', 'transparent');
    koerper.classList.toggle('hat-hg', !!bild);
  }

  // Begrüßung statt "Heute"
  const name = (st.anzeigename || '').trim();
  const gruss = $('#heute-gruss');
  const titel = $('#heute-titel');
  if (name) {
    const std = new Date().getHours();
    const tageszeit = std < 5 ? 'Gute Nacht' : std < 11 ? 'Guten Morgen'
      : std < 18 ? 'Hallo' : 'Guten Abend';
    gruss.textContent = tageszeit;
    gruss.hidden = false;
    titel.textContent = name;
  } else {
    gruss.hidden = true;
    titel.textContent = 'Heute';
  }

  // App-Name
  const appName = (st.appName || '').trim() || 'Grünzeug';
  document.title = appName;
  const loginTitel = document.querySelector('.login-box h1');
  if (loginTitel) loginTitel.textContent = appName;

  // Symbol im Kopf
  const knopf = $('#btn-profil');
  if (st.avatarFoto) {
    knopf.innerHTML = '<img src="' + st.avatarFoto + '" alt="">';
    knopf.hidden = false;
  } else if (st.avatar) {
    knopf.textContent = st.avatar;
    knopf.hidden = false;
  } else {
    knopf.textContent = '';
    knopf.hidden = true;
  }
}

/* ---------- Sheet "Persönliches" ---------- */
function oeffnePersoenlich() {
  const st = DB.settings;
  $('#ps-name').value = st.anzeigename || '';
  $('#ps-appname').value = st.appName || '';
  $('#ps-foto-weg').style.display = st.avatarFoto ? 'block' : 'none';
  $('#ps-hgfoto-weg').style.display = st.hintergrundFoto ? 'block' : 'none';
  zeichnePersoenlich();
  openSheet('#sheet-persoenlich');
}

function zeichnePersoenlich() {
  const st = DB.settings;
  const dunkel = dunkelAktiv();

  $('#ps-emoji').innerHTML = PROFIL_EMOJIS.map(e =>
    `<button data-pemoji="${e}" class="${e === st.avatar && !st.avatarFoto ? 'on' : ''}">${e}</button>`
  ).join('');

  $('#ps-farben').innerHTML = Object.entries(AKZENTE).map(([schluessel, f]) =>
    `<button class="farbe ${schluessel === (st.akzent || 'gruen') ? 'on' : ''}"
       data-farbe="${schluessel}" title="${f.name}"
       style="background:${dunkel ? f.dunkel : f.hell}"></button>`
  ).join('');

  $('#ps-hintergruende').innerHTML = Object.entries(HINTERGRUENDE).map(([schluessel, h]) => {
    const bild = dunkel ? h.dunkel : h.hell;
    const aktiv = (st.hintergrund || 'keiner') === schluessel;
    const flaeche = bild || (dunkel ? '#1c1c1e' : '#fff');
    return `<button class="hg ${aktiv ? 'on' : ''} ${dunkel ? '' : 'hell'}"
      data-hg="${schluessel}" style="background:${flaeche}"><span>${h.name}</span></button>`;
  }).join('') + (DB.settings.hintergrundFoto
    ? `<button class="hg ${st.hintergrund === 'foto' ? 'on' : ''}" data-hg="foto">
         <img src="${st.hintergrundFoto}" alt=""><span>Eigenes</span></button>`
    : '');
}

/** Bild verkleinern und als JPEG zurückgeben. */
function bildVerkleinern(datei, maxKante, guete) {
  return new Promise((fertig, fehler) => {
    const leser = new FileReader();
    leser.onerror = () => fehler(new Error('Datei nicht lesbar'));
    leser.onload = e => {
      const bild = new Image();
      bild.onerror = () => fehler(new Error('Kein gültiges Bild'));
      bild.onload = () => {
        const f = Math.min(maxKante / bild.width, maxKante / bild.height, 1);
        const c = document.createElement('canvas');
        c.width = Math.round(bild.width * f);
        c.height = Math.round(bild.height * f);
        c.getContext('2d').drawImage(bild, 0, 0, c.width, c.height);
        fertig(c.toDataURL('image/jpeg', guete));
      };
      bild.src = e.target.result;
    };
    leser.readAsDataURL(datei);
  });
}

function bindePersoenlich() {
  $('#zeile-persoenlich').onclick = oeffnePersoenlich;
  $('#btn-profil').onclick = oeffnePersoenlich;

  $('#ps-name').oninput = e => {
    DB.settings.anzeigename = e.target.value.slice(0, 30);
    save(); applyPersonalisierung();
  };
  $('#ps-appname').oninput = e => {
    DB.settings.appName = e.target.value.slice(0, 30);
    save(); applyPersonalisierung();
  };

  $('#ps-foto-btn').onclick = () => $('#ps-foto').click();
  $('#ps-foto').onchange = async e => {
    if (!e.target.files[0]) return;
    try {
      DB.settings.avatarFoto = await bildVerkleinern(e.target.files[0], 200, 0.8);
      save(); applyPersonalisierung(); zeichnePersoenlich();
      $('#ps-foto-weg').style.display = 'block';
      toast('Symbol übernommen');
    } catch (err) { toast(err.message); }
    e.target.value = '';
  };
  $('#ps-foto-weg').onclick = () => {
    DB.settings.avatarFoto = null;
    save(); applyPersonalisierung(); zeichnePersoenlich();
    $('#ps-foto-weg').style.display = 'none';
  };

  $('#ps-hgfoto-btn').onclick = () => $('#ps-hgfoto').click();
  $('#ps-hgfoto').onchange = async e => {
    if (!e.target.files[0]) return;
    try {
      DB.settings.hintergrundFoto = await bildVerkleinern(e.target.files[0], 1200, 0.72);
      DB.settings.hintergrund = 'foto';
      save(); applyPersonalisierung(); zeichnePersoenlich();
      $('#ps-hgfoto-weg').style.display = 'block';
      toast('Hintergrund übernommen');
    } catch (err) { toast(err.message); }
    e.target.value = '';
  };
  $('#ps-hgfoto-weg').onclick = () => {
    DB.settings.hintergrundFoto = null;
    if (DB.settings.hintergrund === 'foto') DB.settings.hintergrund = 'keiner';
    save(); applyPersonalisierung(); zeichnePersoenlich();
    $('#ps-hgfoto-weg').style.display = 'none';
  };

  $('#set-start').onchange = e => { DB.settings.startAnsicht = e.target.value; save(); };
}

/* ---------- Versionshistorie ----------
   Muss bei jedem Release zusammen mit VERSION, VERSION-Datei, CHANGELOG.md
   und der Tabelle in README.md gepflegt werden. Neueste Version oben. */
const HISTORIE = [
  { v: '1.9.0', datum: '29.08.2026', punkte: [
    'Alle fälligen Pflanzen auf einmal gießen – ein Tipp statt vieler.',
    'Umtopfen und Schneiden als eigene Aufgaben mit Intervall in Monaten.',
    'Urlaubsmodus: zeigt, was vor der Abreise zu gießen ist und was währenddessen fällig wird.',
    'Die Liste für die Person, die gießt, lässt sich weitergeben.'
  ]},
  { v: '1.8.2', datum: '29.08.2026', punkte: [
    'Behoben: Der Versand der Benachrichtigungen scheiterte am Format des VAPID-Schlüssels.'
  ]},
  { v: '1.8.1', datum: '29.08.2026', punkte: [
    'Behoben: Die App zeigte Erinnerungen als "aktiv", obwohl kein Gerät angemeldet war.',
    'Der Testknopf meldet das Gerät jetzt selbst an, wenn der Server es nicht kennt.'
  ]},
  { v: '1.8.0', datum: '29.08.2026', punkte: [
    'Rückgängig direkt in der Meldung nach Gießen oder Düngen – sechs Sekunden lang.',
    'Nimmt das alte Datum zurück und entfernt den Eintrag aus dem Verlauf.'
  ]},
  { v: '1.7.1', datum: '29.08.2026', punkte: [
    'Knopf "Beispielpflanzen anlegen" unter Mehr entfernt; auf dem leeren Startbildschirm bleibt er.'
  ]},
  { v: '1.7.0', datum: '29.08.2026', punkte: [
    'Vorwarnung jetzt bis 7 Tage einstellbar, nicht mehr nur bis 2.',
    'Die mittlere Kachel und der Abschnitt "Demnächst" folgen dieser Einstellung.'
  ]},
  { v: '1.6.0', datum: '29.08.2026', punkte: [
    'Die Kacheln auf der Startseite filtern jetzt: fällig, in zwei Tagen oder alle Pflanzen.',
    'Nochmal auf dieselbe Kachel tippen hebt den Filter wieder auf.'
  ]},
  { v: '1.5.0', datum: '29.08.2026', punkte: [
    'Push-Erinnerungen funktionieren: der Server schickt täglich zur eingestellten Zeit eine Nachricht, wenn etwas zu gießen ist.',
    'Testnachricht auf Knopfdruck.',
    'Klare Auskunft, wenn Benachrichtigungen nicht möglich sind – auf dem iPhone mit Anleitung zum Installieren.'
  ]},
  { v: '1.4.0', datum: '29.08.2026', punkte: [
    'Eigener Name: die Startseite begrüßt dich tageszeitabhängig.',
    'Acht Akzentfarben statt festem Grün.',
    'Hintergrund wählbar: sechs Verläufe oder ein eigenes Foto.',
    'Eigenes Symbol als Emoji oder Foto im Kopf der Startseite.',
    'Name der App änderbar.',
    'Startansicht wählbar: Heute, Pflanzen oder Plan.'
  ]},
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
    pushZustandPruefen();
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

  // Akzentfarbe und Hintergrund haben je Modus eigene Werte
  if (typeof applyPersonalisierung === 'function') applyPersonalisierung();
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

  const fenster = vorschauTage();
  const faellig = DB.plants.filter(p => tageBis(p) <= 0);
  const bald = DB.plants.filter(p => { const t = tageBis(p); return t > 0 && t <= fenster; });

  $('#st-faellig').textContent = faellig.length;
  $('#st-bald').textContent = bald.length;
  $('#st-gesamt').textContent = DB.plants.length;
  $('#st-bald-text').textContent = fenster === 1 ? 'morgen' : 'in ' + fenster + ' Tagen';

  $$('.stat').forEach(k => k.classList.toggle('on', k.dataset.filter === heuteFilter));

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
  if (heuteFilter) {
    const auswahl = heuteFilter === 'faellig' ? faellig
      : heuteFilter === 'bald' ? bald
      : DB.plants.slice();
    const ueberschrift = heuteFilter === 'faellig' ? 'Jetzt gießen'
      : heuteFilter === 'bald'
        ? (fenster === 1 ? 'Morgen fällig' : 'In den nächsten ' + fenster + ' Tagen')
        : 'Alle Pflanzen';
    const kopf = `<div class="section-title mit-aktion"><span>${ueberschrift}</span>` +
                 `<span class="aktion" data-filter-weg>Filter aufheben</span></div>`;
    if (!auswahl.length) {
      box.innerHTML = kopf + `<div class="empty"><div class="big">✅</div>
        <p>Hier ist gerade nichts.</p></div>`;
      return;
    }
    auswahl.sort((a, b) => tageBis(a) - tageBis(b));
    box.innerHTML = kopf + auswahl.map(plantRow).join('');
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
    html += `<div class="section-title mit-aktion"><span>Jetzt gießen</span>` +
            (faellig.length > 1 ? `<span class="aktion" data-alle-giessen>Alle ${faellig.length} gießen</span>` : '') +
            `</div>`;
    html += faellig.sort((a, b) => tageBis(a) - tageBis(b)).map(plantRow).join('');
  }
  if (bald.length) {
    html += `<div class="section-title">Demnächst</div>`;
    html += bald.sort((a, b) => tageBis(a) - tageBis(b)).map(plantRow).join('');
  }
  const pflege = faelligeAufgaben();
  if (pflege.length) {
    html += `<div class="section-title">Weitere Pflege</div>`;
    html += pflege.map(({ pflanze, aufgabe }) => `
      <div class="plant" data-open="${pflanze.id}">
        ${avatarHTML(pflanze)}
        <div class="info">
          <div class="nm">${esc(pflanze.name)}</div>
          <div class="meta">${aufgabe.name} fällig${pflanze.raum ? ' · ' + esc(pflanze.raum) : ''}</div>
        </div>
        <button class="water-btn due" data-aufgabe="${aufgabe.schluessel}" data-pid="${pflanze.id}"
          title="${aufgabe.name}">${aufgabe.emoji}</button>
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
  $('#set-start').value = DB.settings.startAnsicht || 'heute';
  $('#persoenlich-kurz').textContent =
    (DB.settings.anzeigename || '').trim() ||
    (AKZENTE[DB.settings.akzent] || AKZENTE.gruen).name + ' ›';
  $('#set-winter').value = DB.settings.winter;
  $('#set-vorwarn').value = String(DB.settings.vorwarn);
  $('#set-pushzeit').value = DB.settings.pushZeit;
  updatePushUI();
}

/* ---------- Aktionen ---------- */
function giessen(id) {
  const p = DB.plants.find(x => x.id === id);
  if (!p) return;
  const logId = uid();
  letzteAktion = { eintraege: [{ feld: 'letzt', plantId: id, vorher: p.letzt, logId }] };
  p.letzt = toISO(new Date());
  DB.logs.push({ id: logId, plantId: id, typ: 'wasser', ts: Date.now() });
  save(); renderAll();
  if (navigator.vibrate) navigator.vibrate(12);
  toast('💧 ' + p.name + ' gegossen', 'Rückgängig', rueckgaengig);
}
function duengen(id) { aufgabeErledigt(id, 'duenger'); }

/** Nimmt den letzten Gieß- oder Düngevorgang zurück: altes Datum wieder
    herstellen und den Verlaufseintrag entfernen. */
function rueckgaengig() {
  if (!letzteAktion) return;
  const { eintraege } = letzteAktion;
  const ids = new Set(eintraege.map(e => e.logId));
  for (const e of eintraege) {
    const p = DB.plants.find(x => x.id === e.plantId);
    if (p) p[e.feld] = e.vorher;
  }
  DB.logs = DB.logs.filter(l => !ids.has(l.id));
  const ersteId = eintraege[0] && eintraege[0].plantId;
  letzteAktion = null;
  save();
  renderAll();
  if ($('#sheet-detail').classList.contains('open') && ersteId) openDetail(ersteId);
  toast(eintraege.length > 1 ? 'Zurückgenommen (' + eintraege.length + ')' : 'Zurückgenommen');
}

/* ---------- Pflegeaufgaben neben dem Gießen ----------
   Düngen rechnet in Tagen, Umtopfen und Schneiden in Monaten. Alle drei
   verhalten sich sonst gleich, deshalb stehen sie in einer Tabelle statt
   dreimal im Code. */
const AUFGABEN = [
  { schluessel: 'duenger',  name: 'Düngen',   partizip: 'gedüngt',     emoji: '🌿',
    feldInt: 'duengerInt',  feldLetzt: 'duengerLetzt',  einheit: 'tage' },
  { schluessel: 'umtopfen', name: 'Umtopfen', partizip: 'umgetopft',   emoji: '🪴',
    feldInt: 'umtopfenMon', feldLetzt: 'umtopfenLetzt', einheit: 'monate' },
  { schluessel: 'schneiden', name: 'Schneiden', partizip: 'geschnitten', emoji: '✂️',
    feldInt: 'schneidenMon', feldLetzt: 'schneidenLetzt', einheit: 'monate' }
];

/** Tage bis zur nächsten Fälligkeit einer Aufgabe, null wenn abgeschaltet. */
function aufgabeTageBis(p, a) {
  const intervall = Number(p[a.feldInt]) || 0;
  const letzt = p[a.feldLetzt];
  if (!intervall || !letzt) return null;
  const d = fromISO(letzt);
  const ziel = a.einheit === 'monate'
    ? new Date(d.getFullYear(), d.getMonth() + intervall, d.getDate())
    : new Date(d.getTime() + intervall * 86400000);
  ziel.setHours(0, 0, 0, 0);
  return tageDiff(heute0(), ziel);
}

/** Alle heute fälligen Aufgaben über alle Pflanzen. */
function faelligeAufgaben() {
  const treffer = [];
  for (const p of DB.plants) {
    for (const a of AUFGABEN) {
      const t = aufgabeTageBis(p, a);
      if (t !== null && t <= 0) treffer.push({ pflanze: p, aufgabe: a, tage: t });
    }
  }
  return treffer;
}

/** Aufgabe als erledigt eintragen. */
function aufgabeErledigt(id, schluessel) {
  const p = DB.plants.find(x => x.id === id);
  const a = AUFGABEN.find(x => x.schluessel === schluessel);
  if (!p || !a) return;
  const logId = uid();
  letzteAktion = { eintraege: [{ feld: a.feldLetzt, plantId: id, vorher: p[a.feldLetzt], logId }] };
  p[a.feldLetzt] = toISO(new Date());
  DB.logs.push({ id: logId, plantId: id, typ: schluessel, ts: Date.now() });
  save();
  renderAll();
  if ($('#sheet-detail').classList.contains('open')) openDetail(id);
  toast(a.emoji + ' ' + p.name + ' ' + a.partizip, 'Rückgängig', rueckgaengig);
}

/* ---------- Alles auf einmal ---------- */

/** Markiert alle gerade fälligen Pflanzen als gegossen. */
function alleGiessen() {
  const faellig = DB.plants.filter(p => tageBis(p) <= 0);
  if (!faellig.length) { toast('Gerade ist nichts fällig'); return; }

  const heute = toISO(new Date());
  const eintraege = [];
  for (const p of faellig) {
    const logId = uid();
    eintraege.push({ feld: 'letzt', plantId: p.id, vorher: p.letzt, logId });
    p.letzt = heute;
    DB.logs.push({ id: logId, plantId: p.id, typ: 'wasser', ts: Date.now() });
  }
  letzteAktion = { eintraege };
  save();
  renderAll();
  if (navigator.vibrate) navigator.vibrate(18);
  toast('💧 ' + faellig.length + ' Pflanzen gegossen', 'Rückgängig', rueckgaengig);
}

/* ---------- Urlaubsmodus ----------
   Beantwortet zwei Fragen: Was muss vor der Abreise noch gegossen werden,
   und was wird während der Abwesenheit fällig? Letzteres ergibt die Liste
   für die Person, die währenddessen gießt. */

function urlaubOeffnen() {
  const heute = new Date();
  const inEinerWoche = new Date(heute.getTime() + 7 * 86400000);
  if (!$('#url-von').value) $('#url-von').value = toISO(heute);
  if (!$('#url-bis').value) $('#url-bis').value = toISO(inEinerWoche);
  urlaubRechnen();
  openSheet('#sheet-urlaub');
}

/** Alle Termine einer Pflanze im Zeitraum, ausgehend vom letzten Gießen. */
function giesstermine(p, bis) {
  const termine = [];
  const iv = effIntervall(p);
  if (!p.letzt) return termine;
  let d = new Date(fromISO(p.letzt).getTime() + iv * 86400000);
  d.setHours(0, 0, 0, 0);
  // Überfälliges nachholen, aber nicht endlos rechnen
  let schutz = 0;
  while (d <= bis && schutz++ < 200) {
    termine.push(new Date(d));
    d = new Date(d.getTime() + iv * 86400000);
  }
  return termine;
}

function urlaubRechnen() {
  const vonWert = $('#url-von').value;
  const bisWert = $('#url-bis').value;
  const box = $('#urlaub-ergebnis');
  if (!vonWert || !bisWert) { box.innerHTML = ''; return; }

  const von = fromISO(vonWert); von.setHours(0, 0, 0, 0);
  const bis = fromISO(bisWert); bis.setHours(0, 0, 0, 0);
  if (bis < von) {
    box.innerHTML = `<div class="empty"><p>Das Rückkehrdatum liegt vor der Abreise.</p></div>`;
    return;
  }
  const tage = tageDiff(von, bis) + 1;

  const vorher = [];   // vor der Abreise noch gießen
  const waehrend = []; // braucht Betreuung

  for (const p of DB.plants) {
    const termine = giesstermine(p, bis);
    // Alles, was bis einschließlich Abreisetag dran ist: vorher gießen
    const vorAbreise = termine.filter(d => d <= von);
    if (vorAbreise.length) vorher.push(p);
    // Termine im Zeitraum nach der Abreise
    const drin = termine.filter(d => d > von && d <= bis);
    if (drin.length) waehrend.push({ pflanze: p, termine: drin });
  }

  let html = `<div class="card" style="text-align:center">
      <b style="font-size:20px">${tage} ${tage === 1 ? 'Tag' : 'Tage'}</b>
      <div style="color:var(--text-2);font-size:14px;margin-top:2px">
        ${von.toLocaleDateString('de-DE')} – ${bis.toLocaleDateString('de-DE')}</div>
    </div>`;

  html += `<div class="section-title">Vor der Abreise gießen</div>`;
  html += vorher.length
    ? vorher.map(p => `<div class="plant" data-open="${p.id}">
        ${avatarHTML(p)}
        <div class="info"><div class="nm">${esc(p.name)}</div>
          <div class="meta">${statusText(p)}${p.menge ? ' · ' + esc(p.menge) : ''}</div></div>
        <button class="water-btn due" data-water="${p.id}" title="Gegossen">💧</button>
      </div>`).join('')
    : `<div class="card" style="color:var(--text-2)">Nichts – alles frisch gegossen.</div>`;

  html += `<div class="section-title">Braucht während deiner Abwesenheit Wasser</div>`;
  if (!waehrend.length) {
    html += `<div class="card" style="color:var(--text-2)">
      Keine Pflanze wird in dieser Zeit fällig. Du kannst beruhigt fahren.</div>`;
  } else {
    html += waehrend
      .sort((a, b) => a.termine[0] - b.termine[0])
      .map(({ pflanze, termine }) => `
        <div class="plant" data-open="${pflanze.id}">
          ${avatarHTML(pflanze)}
          <div class="info">
            <div class="nm">${esc(pflanze.name)}</div>
            <div class="meta">${termine.map(d => d.toLocaleDateString('de-DE',
              { day: 'numeric', month: 'short' })).join(', ')}${pflanze.menge ? ' · ' + esc(pflanze.menge) : ''}</div>
          </div>
        </div>`).join('');
    html += `<button class="btn sec" id="btn-urlaub-teilen">Liste zum Weitergeben</button>`;
  }

  box.innerHTML = html;
  const teilen = $('#btn-urlaub-teilen');
  if (teilen) teilen.onclick = () => urlaubTeilen(von, bis, waehrend);
}

/** Erzeugt eine Textliste und gibt sie weiter – per Teilen-Dialog oder Zwischenablage. */
async function urlaubTeilen(von, bis, waehrend) {
  const zeilen = [
    'Gießplan ' + von.toLocaleDateString('de-DE') + ' bis ' + bis.toLocaleDateString('de-DE'),
    ''
  ];
  for (const { pflanze, termine } of waehrend) {
    const wo = pflanze.raum ? ' (' + pflanze.raum + ')' : '';
    const menge = pflanze.menge ? ', ' + pflanze.menge : '';
    zeilen.push('• ' + pflanze.name + wo + menge);
    zeilen.push('  ' + termine.map(d => d.toLocaleDateString('de-DE',
      { weekday: 'short', day: 'numeric', month: 'short' })).join(', '));
    if (pflanze.notiz) zeilen.push('  Hinweis: ' + pflanze.notiz);
  }
  const text = zeilen.join('\n');

  try {
    if (navigator.share) {
      await navigator.share({ title: 'Gießplan', text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast('Liste in die Zwischenablage kopiert');
  } catch (e) {
    if (e && e.name === 'AbortError') return;   // Teilen abgebrochen
    toast('Konnte die Liste nicht weitergeben');
  }
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
  $('#f-umtopfen-int').value = p ? (p.umtopfenMon || 0) : 0;
  $('#f-umtopfen-letzt').value = p ? (p.umtopfenLetzt || '') : '';
  $('#f-schneiden-int').value = p ? (p.schneidenMon || 0) : 0;
  $('#f-schneiden-letzt').value = p ? (p.schneidenLetzt || '') : '';
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
    umtopfenMon: Math.max(0, Number($('#f-umtopfen-int').value) || 0),
    umtopfenLetzt: $('#f-umtopfen-letzt').value || '',
    schneidenMon: Math.max(0, Number($('#f-schneiden-int').value) || 0),
    schneidenLetzt: $('#f-schneiden-letzt').value || '',
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
    ${AUFGABEN.filter(a => Number(p[a.feldInt]) > 0).map(a =>
      `<button class="btn sec" data-aufgabe="${a.schluessel}" data-pid="${p.id}">${a.emoji} ${a.name}</button>`).join('')}

    <div class="section-title">Pflege</div>
    <div class="group">
      <div class="field"><label>Gießintervall</label><span class="hint">alle ${p.intervall} Tage${winterAktiv() ? ' (Winter: ' + effIntervall(p) + ')' : ''}</span></div>
      <div class="field"><label>Zuletzt gegossen</label><span class="hint">${p.letzt ? fromISO(p.letzt).toLocaleDateString('de-DE') : '–'}</span></div>
      ${p.menge ? `<div class="field"><label>Wassermenge</label><span class="hint">${esc(p.menge)}</span></div>` : ''}
      ${p.licht ? `<div class="field"><label>Licht</label><span class="hint">${esc(p.licht)}</span></div>` : ''}
      ${AUFGABEN.map(a => {
        const t = aufgabeTageBis(p, a);
        if (t === null) return '';
        return `<div class="field"><label>${a.name}</label><span class="hint">${
          t <= 0 ? 'fällig' : 'in ' + t + (t === 1 ? ' Tag' : ' Tagen')}</span></div>`;
      }).join('')}
    </div>

    ${p.notiz ? `<div class="section-title">Notizen</div><div class="card" style="white-space:pre-wrap">${esc(p.notiz)}</div>` : ''}

    ${logs.length ? `<div class="section-title">Verlauf</div><div class="group">` + logs.map(l => `
      <div class="log-item"><span>${logText(l.typ)}</span>
      <span>${new Date(l.ts).toLocaleDateString('de-DE')}</span></div>`).join('') + `</div>` : ''}

    <button class="btn sec" data-edit="${p.id}">Bearbeiten</button>
    <button class="btn danger" data-del="${p.id}">Pflanze löschen</button>
    <button class="btn sec" data-close>Schließen</button>
  `;
  openSheet('#sheet-detail');
}

/** Beschriftung eines Verlaufseintrags. */
function logText(typ) {
  if (typ === 'wasser') return '💧 Gegossen';
  const a = AUFGABEN.find(x => x.schluessel === typ);
  return a ? a.emoji + ' ' + a.partizip.charAt(0).toUpperCase() + a.partizip.slice(1) : typ;
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

/* ---------- Push-Benachrichtigungen ----------
   Braucht drei Dinge: eine Anmeldung (der Server muss wissen, wessen
   Pflanzen gemeint sind), die Notification-API und einen Service Worker.
   Auf dem iPhone stellt Safari die API nur bereit, wenn die Seite als App
   auf dem Home-Bildschirm liegt – das erklärt die Anzeige entsprechend. */

const istApple = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const alsAppInstalliert = window.matchMedia('(display-mode: standalone)').matches ||
  navigator.standalone === true;

/** Was der Push-Einrichtung gerade im Weg steht, oder null. */
function pushHindernis() {
  if (!SYNC.user) return 'anmeldung';
  if (!('serviceWorker' in navigator)) return 'kein-sw';
  if (!('Notification' in window) || !('PushManager' in window)) {
    return (istApple && !alsAppInstalliert) ? 'ios-installieren' : 'nicht-unterstuetzt';
  }
  if (Notification.permission === 'denied') return 'blockiert';
  return null;
}

function updatePushUI() {
  const anzeige = $('#push-status');
  const knopf = $('#btn-push-toggle');
  const test = $('#btn-push-test');
  const hindernis = pushHindernis();

  test.style.display = 'none';
  knopf.style.display = 'block';
  knopf.className = 'btn';

  if (DB.settings.pushAktiv && !hindernis) {
    anzeige.textContent = 'aktiv';
    knopf.textContent = 'Erinnerungen abschalten';
    knopf.className = 'btn sec';
    test.style.display = 'block';
    return;
  }

  switch (hindernis) {
    case 'anmeldung':
      anzeige.textContent = 'Anmeldung nötig';
      knopf.textContent = 'Dafür anmelden';
      knopf.className = 'btn sec';
      return;
    case 'ios-installieren':
      anzeige.textContent = 'App installieren';
      knopf.textContent = 'Wie geht das?';
      knopf.className = 'btn sec';
      return;
    case 'blockiert':
      anzeige.textContent = 'im Browser blockiert';
      knopf.style.display = 'none';
      return;
    case 'nicht-unterstuetzt':
    case 'kein-sw':
      anzeige.textContent = 'von diesem Browser nicht unterstützt';
      knopf.style.display = 'none';
      return;
    default:
      anzeige.textContent = 'nicht aktiv';
      knopf.textContent = 'Erinnerungen einschalten';
  }
}

function urlB64ToUint8(s) {
  const auffuellen = '='.repeat((4 - s.length % 4) % 4);
  const b64 = (s + auffuellen).replace(/-/g, '+').replace(/_/g, '/');
  const roh = atob(b64);
  return Uint8Array.from(roh, c => c.charCodeAt(0));
}

/** Schlüssel aus einem PushSubscription-Objekt als Base64. */
function aboSchluessel(abo, name) {
  const roh = abo.getKey(name);
  return btoa(String.fromCharCode.apply(null, new Uint8Array(roh)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Legt das Abo an bzw. erneuert es und meldet es beim Server an.
    Wird beim Einschalten benutzt und wenn der Server ein Gerät nicht kennt. */
async function aboAnlegen() {
  const reg = await navigator.serviceWorker.ready;
  const antwort = await api('/push/key');
  if (!antwort.ok) throw new Error('Server liefert keinen Schlüssel');
  const { key } = await antwort.json();

  let abo = await reg.pushManager.getSubscription();
  if (abo) {
    // Ein Abo mit anderem Schlüssel ist wertlos – neu anlegen
    const alt = new Uint8Array(abo.options.applicationServerKey || []);
    const neu = urlB64ToUint8(key);
    if (alt.length !== neu.length || !alt.every((v, i) => v === neu[i])) {
      await abo.unsubscribe();
      abo = null;
    }
  }
  if (!abo) {
    abo = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8(key)
    });
  }

  const r = await api('/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: abo.endpoint,
      p256dh: aboSchluessel(abo, 'p256dh'),
      auth: aboSchluessel(abo, 'auth'),
      zeit: DB.settings.pushZeit || '09:00'
    })
  });
  if (!r.ok) throw new Error('Server hat das Gerät nicht angenommen (' + r.status + ')');
  return true;
}

async function pushEin() {
  const erlaubnis = await Notification.requestPermission();
  if (erlaubnis !== 'granted') { toast('Berechtigung abgelehnt'); updatePushUI(); return; }
  await aboAnlegen();
  DB.settings.pushAktiv = true;
  save();
  updatePushUI();
  toast('Erinnerungen aktiv – täglich um ' + (DB.settings.pushZeit || '09:00'));
}

/** Gleicht die gespeicherte Einstellung mit der Wirklichkeit ab.

    Frühere Fassungen setzten `pushAktiv` schon nach der Berechtigungsabfrage,
    weil es noch keinen Push-Server gab. Dieser Wert wurde mitsynchronisiert und
    lässt die App "aktiv" anzeigen, obwohl kein Gerät angemeldet ist. Ebenso kann
    ein Abo im Browser vorhanden sein, das der Server nicht (mehr) kennt. */
async function pushZustandPruefen() {
  if (!DB.settings.pushAktiv || pushHindernis()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const abo = await reg.pushManager.getSubscription();
    if (!abo) {
      DB.settings.pushAktiv = false;
      save();
      updatePushUI();
      return;
    }
    // Abo da, aber vielleicht kennt der Server es nicht – still nachmelden
    await aboAnlegen();
  } catch (e) {
    DB.settings.pushAktiv = false;
    save();
    updatePushUI();
  }
}

async function pushAus() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const abo = await reg.pushManager.getSubscription();
    if (abo) {
      await api('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: abo.endpoint }) });
      await abo.unsubscribe();
    }
  } catch (e) { /* Gerät ist dann ohnehin nicht mehr erreichbar */ }
  DB.settings.pushAktiv = false;
  save();
  updatePushUI();
  toast('Erinnerungen abgeschaltet');
}

async function pushToggle() {
  const hindernis = pushHindernis();

  if (hindernis === 'anmeldung') {
    SYNC.lokalOk = false; speichereSync(); zeigeLogin(); return;
  }
  if (hindernis === 'ios-installieren') {
    alert('Auf dem iPhone erlaubt Safari Benachrichtigungen nur, wenn Grünzeug ' +
          'als App auf dem Home-Bildschirm liegt.\n\n' +
          'So geht es:\n' +
          '1. In Safari unten auf das Teilen-Symbol tippen\n' +
          '2. "Zum Home-Bildschirm" wählen\n' +
          '3. Grünzeug über das neue Symbol öffnen\n' +
          '4. Hier die Erinnerungen einschalten');
    return;
  }
  if (hindernis) { updatePushUI(); return; }

  const knopf = $('#btn-push-toggle');
  knopf.disabled = true;
  try {
    if (DB.settings.pushAktiv) await pushAus();
    else await pushEin();
  } catch (e) {
    toast(e.message);
  } finally {
    knopf.disabled = false;
  }
}

/** Uhrzeit geändert: dem Server Bescheid geben, sonst kommt sie zur alten Zeit. */
async function pushZeitGeaendert() {
  if (!DB.settings.pushAktiv || pushHindernis()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const abo = await reg.pushManager.getSubscription();
    if (!abo) return;
    await api('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: abo.endpoint,
        p256dh: aboSchluessel(abo, 'p256dh'),
        auth: aboSchluessel(abo, 'auth'),
        zeit: DB.settings.pushZeit
      })
    });
    toast('Erinnerung jetzt um ' + DB.settings.pushZeit);
  } catch (e) { /* beim nächsten Einschalten korrigiert sich das */ }
}

async function pushTesten() {
  const knopf = $('#btn-push-test');
  knopf.disabled = true;
  try {
    let r = await api('/push/test', { method: 'POST' });

    // 400 heißt: der Server kennt kein Gerät. Einmal nachmelden und erneut versuchen.
    if (r.status === 400) {
      toast('Gerät wird angemeldet …');
      await aboAnlegen();
      r = await api('/push/test', { method: 'POST' });
    }

    if (r.ok) toast('Testnachricht verschickt');
    else toast((await r.json()).detail || 'Versand fehlgeschlagen');
  } catch (e) {
    toast(e.message || 'Server nicht erreichbar');
  } finally {
    knopf.disabled = false;
  }
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
  bindePersoenlich();
  $('#zeile-historie').onclick = zeigeHistorie;
  $('#btn-urlaub').onclick = urlaubOeffnen;
  $('#url-von').onchange = urlaubRechnen;
  $('#url-bis').onchange = urlaubRechnen;
  $('#btn-theme').onclick = themeUmschalten;
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
      updatePushUI();
      pushZustandPruefen();
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
  $('#set-pushzeit').onchange = e => { DB.settings.pushZeit = e.target.value; save(); pushZeitGeaendert(); };
  $('#btn-push-test').onclick = pushTesten;

  /* Delegation für dynamische Inhalte */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-water],[data-dueng],[data-aufgabe],[data-alle-giessen],[data-open],[data-emoji],[data-raum],[data-edit],[data-del],[data-close],[data-farbe],[data-hg],[data-pemoji],[data-filter],[data-filter-weg]');
    if (!t) return;
    if (t.dataset.close !== undefined) { closeSheets(); return; }
    if (t.dataset.filterWeg !== undefined) { heuteFilter = null; renderHeute(); return; }
    if (t.dataset.filter) {
      // Dieselbe Kachel noch einmal hebt den Filter wieder auf
      heuteFilter = heuteFilter === t.dataset.filter ? null : t.dataset.filter;
      renderHeute();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (t.dataset.water) { e.stopPropagation(); giessen(t.dataset.water); if ($('#sheet-detail').classList.contains('open')) openDetail(t.dataset.water); return; }
    if (t.dataset.dueng) { e.stopPropagation(); duengen(t.dataset.dueng); return; }
    if (t.dataset.aufgabe) { e.stopPropagation(); aufgabeErledigt(t.dataset.pid, t.dataset.aufgabe); return; }
    if (t.dataset.alleGiessen !== undefined) { e.stopPropagation(); alleGiessen(); return; }
    if (t.dataset.edit) { closeSheets(); setTimeout(() => openEdit(t.dataset.edit), 180); return; }
    if (t.dataset.del) { loeschePflanze(t.dataset.del); return; }
    if (t.dataset.open) { openDetail(t.dataset.open); return; }
    if (t.dataset.emoji) { editEmoji = t.dataset.emoji; editFoto = null; $('#btn-foto-del').style.display = 'none'; renderEmojiPick(); return; }
    if (t.dataset.raum) { raumFilter = t.dataset.raum; renderPflanzen(); return; }
    if (t.dataset.farbe) {
      DB.settings.akzent = t.dataset.farbe;
      save(); applyPersonalisierung(); zeichnePersoenlich(); renderMore(); return;
    }
    if (t.dataset.hg) {
      DB.settings.hintergrund = t.dataset.hg;
      save(); applyPersonalisierung(); zeichnePersoenlich(); return;
    }
    if (t.dataset.pemoji) {
      DB.settings.avatar = t.dataset.pemoji;
      DB.settings.avatarFoto = null;
      $('#ps-foto-weg').style.display = 'none';
      save(); applyPersonalisierung(); zeichnePersoenlich(); return;
    }
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
applyPersonalisierung();
bind();
renderAll();
if (DB.settings.startAnsicht && DB.settings.startAnsicht !== 'heute') tab(DB.settings.startAnsicht);
starte();

/* Systemwechsel nur nachziehen, solange 'System' eingestellt ist */
window.matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => { if ((DB.settings.theme || 'auto') === 'auto') applyTheme(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW:', e));
  });
}
