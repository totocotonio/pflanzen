/* ============================================================
   Grünzeug – Pflanzen gießen
   Single-File PWA, Daten in localStorage (Prefix pg_)
   ============================================================ */
'use strict';

const VERSION = '1.16.0';

const KEY = 'pg_data';
/* Standorte, die es in fast jeder Wohnung gibt. Eigene Räume kommen aus den
   bereits angelegten Pflanzen dazu, neue lassen sich im Formular ergänzen. */
const STANDORTE = ['Wohnzimmer', 'Schlafzimmer', 'Küche', 'Bad', 'Flur',
  'Arbeitszimmer', 'Kinderzimmer', 'Esszimmer', 'Wintergarten', 'Fensterbank',
  'Balkon', 'Terrasse', 'Garten', 'Keller', 'Treppenhaus'];

/* Ein Cannabis-Emoji gibt es in Unicode nicht; 🍁 hat fünf Zacken und wird
   dafür üblicherweise genommen. */
const EMOJIS = ['🪴','🌿','🌵','🌱','🌴','🎍','🍁','🌺','🌻','🌷','🌸','🌼','🪻','🪷','🍀','🌾','🥬','🍋','🍅','🍓','🌶️','🫒','🌳','🥀'];

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
let suchText = '';
let sortierung = 'dringlich';
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

/** Alle Pflanzen ohne die archivierten. Fast überall gemeint, wenn von
    "den Pflanzen" die Rede ist – nur Archivansicht und Statistik greifen
    bewusst auf DB.plants zu. */
function aktive() {
  return DB.plants.filter(p => !p.archiviert);
}

function winterAktiv() {
  const w = DB.settings.winter;
  if (w === '1') return true;
  if (w === '0') return false;
  const m = new Date().getMonth(); // 0=Jan
  return m >= 10 || m <= 1;        // Nov, Dez, Jan, Feb
}
function effIntervall(p) {
  // Eigener Winterwert der Pflanze schlägt die allgemeine Einstellung
  const eigen = Number(p.winterFaktor) || 0;
  const f = winterAktiv() ? (eigen || 1.5) : 1;
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
  { v: '1.16.0', datum: '29.08.2026', punkte: [
    'Archivieren statt löschen: Pflanze verschwindet aus der Liste, Verlauf und Fotos bleiben.',
    'Pflanzenliste sortierbar nach Dringlichkeit, Name oder Standort.',
    'Winterruhe je Pflanze einstellbar, statt pauschal für alle.',
    'QR-Code für den Topf: ausdrucken, ankleben, scannen öffnet die Pflanze direkt.'
  ]},
  { v: '1.15.0', datum: '29.08.2026', punkte: [
    'Gieß-Runde: führt nach Standort geordnet durch die Wohnung, eine Pflanze nach der anderen.',
    'Problem-Hilfe zu zehn typischen Symptomen, mit Prüfung der eigenen Werte.',
    'Erinnerung lässt sich um zwei Stunden verschieben.'
  ]},
  { v: '1.14.2', datum: '29.08.2026', punkte: [
    'Symbolauswahl von 15 auf 24 erweitert, darunter 🍁 als Ersatz für das fehlende Hanf-Emoji.'
  ]},
  { v: '1.14.1', datum: '29.08.2026', punkte: [
    'Hanf mit aufgenommen.'
  ]},
  { v: '1.14.0', datum: '29.08.2026', punkte: [
    'Küchenkräuter ergänzt: Koriander, Dill, Zitronenmelisse und Kresse.'
  ]},
  { v: '1.13.1', datum: '29.08.2026', punkte: [
    'Pflegehinweise für die restlichen Arten ergänzt, unter anderem Petersilie, Salbei und Oregano.'
  ]},
  { v: '1.13.0', datum: '29.08.2026', punkte: [
    'Pflanzenliste von 32 auf 75 Arten erweitert, mit Sorten von Monstera, Alocasia und Gummibaum.',
    'Zweitnamen werden erkannt: "Benjamini", "Schwiegermutterzunge" oder "Fensterblatt" finden jetzt den richtigen Eintrag.',
    'Mehrzahl und Umlaut-Schreibweisen werden mit erkannt, etwa "Efeutüten" oder "Geranien".'
  ]},
  { v: '1.12.0', datum: '29.08.2026', punkte: [
    'Namensfeld schlägt bekannte Zimmerpflanzen beim Tippen vor.',
    'Standort ist jetzt ein Dropdown mit den üblichen Räumen plus deinen eigenen.'
  ]},
  { v: '1.11.0', datum: '29.08.2026', punkte: [
    'Suche in der Pflanzenliste – über Name, Art, Standort, Notiz, Licht und Wassermenge.'
  ]},
  { v: '1.10.0', datum: '29.08.2026', punkte: [
    'Pflegevorschläge: Bei bekannten Arten schlägt die App Intervall, Licht, Menge und Hinweise vor.',
    'Fotoverlauf je Pflanze – bis zu sechs Bilder mit Datum.',
    'Statistik unter Mehr: Gießvorgänge je Woche, Wasserverbrauch und Pünktlichkeit.'
  ]},
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
  const liste = aktive();
  const faellig = liste.filter(p => tageBis(p) <= 0);
  const bald = liste.filter(p => { const t = tageBis(p); return t > 0 && t <= fenster; });

  $('#st-faellig').textContent = faellig.length;
  $('#st-bald').textContent = bald.length;
  $('#st-gesamt').textContent = liste.length;
  $('#st-bald-text').textContent = fenster === 1 ? 'morgen' : 'in ' + fenster + ' Tagen';

  $$('.stat').forEach(k => k.classList.toggle('on', k.dataset.filter === heuteFilter));

  const box = $('#heute-liste');
  if (!liste.length) {
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
      : liste.slice();
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
    const naechst = liste.slice().sort((a, b) => tageBis(a) - tageBis(b))[0];
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
    if (faellig.length > 2) {
      html += `<button class="btn" data-runde-start style="margin:0 0 12px">🚿 Gieß-Runde starten</button>`;
    }
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

/** Durchsucht Name, Art, Standort und Notiz. */
function passtZurSuche(p) {
  if (!suchText) return true;
  const heuhaufen = [p.name, p.art, p.raum, p.notiz, p.licht, p.menge]
    .filter(Boolean).join(' ').toLowerCase();
  // Mehrere Wörter müssen alle vorkommen, Reihenfolge egal
  return suchText.split(/\s+/).every(wort => heuhaufen.includes(wort));
}

function renderPflanzen() {
  const archivZahl = DB.plants.filter(p => p.archiviert).length;
  // Wird die letzte archivierte Pflanze zurückgeholt, gäbe es sonst keinen
  // Weg mehr aus der leeren Archivansicht heraus
  if (raumFilter === '__archiv' && !archivZahl) raumFilter = 'alle';
  const archivAn = raumFilter === '__archiv';
  const grundmenge = archivAn ? DB.plants.filter(p => p.archiviert) : aktive();
  const raeume = Array.from(new Set(aktive().map(p => p.raum).filter(Boolean))).sort();

  $('#pflanzen-sub').textContent = archivAn
    ? archivZahl + (archivZahl === 1 ? ' archivierte Pflanze' : ' archivierte Pflanzen')
    : aktive().length + (aktive().length === 1 ? ' Pflanze' : ' Pflanzen');

  // Chips: Alle, die Standorte, und das Archiv wenn es etwas enthält
  $('#raum-chips').hidden = !!suchText;
  const chips = [`<button class="chip ${raumFilter === 'alle' ? 'on' : ''}" data-raum="alle">Alle</button>`]
    .concat(raeume.map(r => `<button class="chip ${raumFilter === r ? 'on' : ''}" data-raum="${esc(r)}">${esc(r)}</button>`));
  if (archivZahl) {
    chips.push(`<button class="chip ${archivAn ? 'on' : ''}" data-raum="__archiv">📦 Archiv (${archivZahl})</button>`);
  }
  $('#raum-chips').innerHTML = (raeume.length || archivZahl) ? chips.join('') : '';

  let liste = grundmenge
    .filter(p => archivAn || raumFilter === 'alle' || p.raum === raumFilter)
    .filter(passtZurSuche);

  if (suchText) {
    $('#pflanzen-sub').textContent = liste.length + ' Treffer';
  }

  const grid = $('#pflanzen-grid');
  if (!liste.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">${suchText ? '🔍' : archivAn ? '📦' : '🪴'}</div>
      <p>${suchText ? 'Nichts gefunden.' : archivAn ? 'Das Archiv ist leer.' : 'Keine Pflanzen in dieser Ansicht.'}</p>
      ${suchText ? '<p>Andere Schreibweise versuchen?</p>' : ''}</div>`;
    return;
  }

  const kachel = p => `
    <button class="tile ${p.archiviert ? 'archiviert' : ''}" data-open="${p.id}">
      ${avatarHTML(p)}
      <div class="nm">${esc(p.name)}</div>
      <div class="meta">${p.archiviert ? 'archiviert' : statusText(p)}</div>
    </button>`;

  // Nach Standort wird gruppiert, sonst einfach sortiert
  if (sortierung === 'raum' && !archivAn) {
    const gruppen = {};
    for (const p of liste) (gruppen[p.raum || 'Ohne Standort'] ||= []).push(p);
    grid.innerHTML = Object.keys(gruppen).sort((a, b) => a.localeCompare(b, 'de')).map(raum =>
      `<div class="gruppe-titel">${esc(raum)}</div>` +
      gruppen[raum].sort((a, b) => a.name.localeCompare(b.name, 'de')).map(kachel).join('')
    ).join('');
    return;
  }

  liste = liste.slice().sort(sortierung === 'name' || archivAn
    ? (a, b) => a.name.localeCompare(b.name, 'de')
    : (a, b) => tageBis(a) - tageBis(b));
  grid.innerHTML = liste.map(kachel).join('');
}

/** Archivieren statt löschen: die Pflanze bleibt mit ihrem Verlauf erhalten,
    zählt aber nirgends mehr mit. */
function archivieren(id, zurueck) {
  const p = DB.plants.find(x => x.id === id);
  if (!p) return;
  p.archiviert = !zurueck;
  if (zurueck) delete p.archiviert;
  save();
  renderAll();
  closeSheets();
  toast(zurueck ? p.name + ' ist wieder in der Liste' : p.name + ' archiviert');
}

function renderPlan() {
  const box = $('#plan-liste');
  if (!aktive().length) { box.innerHTML = `<div class="empty"><div class="big">🗓</div><p>Noch nichts geplant.</p></div>`; return; }

  let html = '';
  const heute = heute0();
  const ueber = aktive().filter(p => tageBis(p) < 0);
  if (ueber.length) {
    html += `<div class="section-title" style="color:var(--red)">Überfällig</div>`;
    html += ueber.sort((a, b) => tageBis(a) - tageBis(b)).map(plantRow).join('');
  }
  for (let i = 0; i < 14; i++) {
    const tag = new Date(heute.getTime() + i * 86400000);
    const drin = aktive().filter(p => tageBis(p) === i);
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
  for (const p of aktive()) {
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
  const faellig = aktive().filter(p => tageBis(p) <= 0);
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

  for (const p of aktive()) {
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

/* ---------- Pflegevorschläge nach Art ----------
   Richtwerte für verbreitete Zimmer- und Balkonpflanzen. Sie ersetzen keinen
   Blick in den Topf: die Werte gelten für einen durchschnittlichen Standort im
   Sommer, der Winter-Modus verlängert sie ohnehin.

   n      = geläufigster Name          art = botanischer Name
   alias  = weitere gebräuchliche Namen, damit auch "Benjamini" oder
            "Schwiegermutterzunge" gefunden werden
   iv     = Gießintervall in Tagen     d   = Düngen in Tagen (0 = aus)
   um     = Umtopfen in Monaten (0 = aus) */
const ARTEN = [
  // --- Klassiker mit großen Blättern ---
  { n: 'Monstera', art: 'Monstera deliciosa', alias: 'Fensterblatt, Köstliches Fensterblatt', iv: 7, licht: 'Hell, ohne direkte Sonne', menge: '300 ml', d: 30, um: 24, hinweis: 'Luftwurzeln nicht abschneiden. Blätter gelegentlich abwischen.' },
  { n: 'Monstera Monkey Mask', art: 'Monstera adansonii', alias: 'Adansonii, Monkey Mask, Fensterblatt klein', iv: 6, licht: 'Hell, ohne direkte Sonne', menge: '200 ml', d: 30, um: 18, hinweis: 'Kleiner und durstiger als die deliciosa, mag eine Rankhilfe.' },
  { n: 'Monstera Variegata', art: 'Monstera deliciosa variegata', alias: 'Variegata, Albo, Thai Constellation', iv: 8, licht: 'Hell, ohne direkte Sonne', menge: '250 ml', d: 45, um: 24, hinweis: 'Weiße Blattteile arbeiten nicht mit: heller stellen, aber nie in die pralle Sonne, sonst verbrennen sie.' },
  { n: 'Efeutute', art: 'Epipremnum aureum', alias: 'Goldene Efeutute, Pothos', iv: 7, licht: 'Halbschatten', menge: '200 ml', d: 30, um: 24, hinweis: 'Verzeiht auch dunklere Ecken.' },
  { n: 'Philodendron', art: 'Philodendron', alias: 'Baumfreund', iv: 7, licht: 'Halbschatten', menge: '250 ml', d: 30, um: 24, hinweis: 'Rankt gerne, eine Stütze hilft beim Wachsen.' },
  { n: 'Zimmeraralie', art: 'Fatsia japonica', alias: '', iv: 5, licht: 'Halbschatten', menge: '300 ml', d: 30, um: 24, hinweis: 'Mag es kühl, verträgt keine Heizungsluft.' },
  { n: 'Schefflera', art: 'Schefflera arboricola', alias: 'Strahlenaralie', iv: 8, licht: 'Hell, ohne direkte Sonne', menge: '250 ml', d: 30, um: 24, hinweis: 'Zu wenig Licht lässt sie lang und dünn werden.' },
  { n: 'Kolbenfaden', art: 'Aglaonema', alias: '', iv: 8, licht: 'Halbschatten', menge: '200 ml', d: 30, um: 24, hinweis: 'Kommt mit wenig Licht gut zurecht.' },
  { n: 'Dieffenbachia', art: 'Dieffenbachia', alias: '', iv: 6, licht: 'Halbschatten', menge: '250 ml', d: 30, um: 24, hinweis: 'Pflanzensaft reizt Haut und Schleimhäute.' },
  { n: 'Alocasia', art: 'Alocasia', alias: 'Elefantenohr, Pfeilblatt', iv: 5, licht: 'Hell, ohne direkte Sonne', menge: '250 ml', d: 21, um: 18, hinweis: 'Braucht viel Luftfeuchtigkeit. Zieht im Winter oft ein und treibt im Frühjahr wieder aus.' },
  { n: 'Alocasia Zebrina', art: 'Alocasia zebrina', alias: 'Zebrina, Zebrastiel', iv: 5, licht: 'Hell, ohne direkte Sonne', menge: '250 ml', d: 21, um: 18, hinweis: 'Gestreifte Stiele brauchen Licht, sonst wird die Pflanze lang und kippt.' },
  { n: 'Alocasia Polly', art: 'Alocasia amazonica', alias: 'Polly, Amazonica, Alocasia Sanderiana', iv: 4, licht: 'Hell, ohne direkte Sonne', menge: '200 ml', d: 21, um: 18, hinweis: 'Empfindlich gegen trockene Heizungsluft, gerne besprühen.' },
  { n: 'Alocasia Frydek', art: 'Alocasia micholitziana', alias: 'Frydek, Green Velvet', iv: 5, licht: 'Halbschatten', menge: '200 ml', d: 21, um: 18, hinweis: 'Samtige Blätter nicht besprühen, lieber die Luftfeuchte erhöhen.' },
  { n: 'Calathea', art: 'Calathea', alias: 'Korbmarante, Goeppertia', iv: 4, licht: 'Halbschatten', menge: '200 ml', d: 21, um: 24, hinweis: 'Empfindlich gegen Kalk, weiches Wasser nehmen.' },
  { n: 'Pilea', art: 'Pilea peperomioides', alias: 'Ufopflanze, Glückstaler', iv: 7, licht: 'Hell, ohne direkte Sonne', menge: '150 ml', d: 30, um: 18, hinweis: 'Regelmäßig drehen, wächst sonst schief.' },

  // --- Feigen ---
  { n: 'Ficus Benjamini', art: 'Ficus benjamina', alias: 'Benjamini, Birkenfeige, Benjamin', iv: 7, licht: 'Hell, ohne direkte Sonne', menge: '300 ml', d: 30, um: 24, hinweis: 'Mag keinen Standortwechsel und wirft dann Blätter ab.' },
  { n: 'Gummibaum', art: 'Ficus elastica', alias: 'Ficus elastica, Gummibaum Robusta', iv: 8, licht: 'Hell, ohne direkte Sonne', menge: '300 ml', d: 30, um: 24, hinweis: 'Blätter gelegentlich abstauben, das verbessert die Lichtausbeute deutlich.' },
  { n: 'Gummibaum Tineke', art: 'Ficus elastica Tineke', alias: 'Tineke, Ruby, Belize, panaschierter Gummibaum', iv: 9, licht: 'Hell, ohne direkte Sonne', menge: '250 ml', d: 45, um: 24, hinweis: 'Die hellen Blattränder brauchen mehr Licht, vertragen aber keine direkte Mittagssonne.' },
  { n: 'Geigenfeige', art: 'Ficus lyrata', alias: 'Lyrata', iv: 8, licht: 'Hell, ohne direkte Sonne', menge: '300 ml', d: 30, um: 24, hinweis: 'Reagiert empfindlich auf Zugluft.' },
  { n: 'Kletterfeige', art: 'Ficus pumila', alias: '', iv: 5, licht: 'Halbschatten', menge: '150 ml', d: 30, um: 18, hinweis: 'Erde gleichmäßig feucht halten.' },

  // --- Genügsame ---
  { n: 'Bogenhanf', art: 'Sansevieria', alias: 'Schwiegermutterzunge, Sansevieria', iv: 21, licht: 'Halbschatten', menge: '150 ml', d: 60, um: 36, hinweis: 'Staunässe ist der häufigste Fehler.' },
  { n: 'Glücksfeder', art: 'Zamioculcas zamiifolia', alias: 'Zamioculcas, ZZ-Pflanze, Glücksfeder', iv: 21, licht: 'Halbschatten', menge: '200 ml', d: 60, um: 36, hinweis: 'Sehr genügsam, lieber zu wenig gießen.' },
  { n: 'Drachenbaum', art: 'Dracaena', alias: 'Dracaena', iv: 10, licht: 'Hell, ohne direkte Sonne', menge: '250 ml', d: 45, um: 30, hinweis: 'Reagiert empfindlich auf Fluorid im Leitungswasser.' },
  { n: 'Yucca', art: 'Yucca elephantipes', alias: 'Yuccapalme, Palmlilie', iv: 14, licht: 'Vollsonne', menge: '250 ml', d: 60, um: 36, hinweis: 'Der Stamm darf nicht weich werden.' },
  { n: 'Elefantenfuß', art: 'Beaucarnea recurvata', alias: 'Flaschenbaum', iv: 21, licht: 'Vollsonne', menge: '200 ml', d: 60, um: 36, hinweis: 'Speichert Wasser im verdickten Stamm.' },
  { n: 'Grünlilie', art: 'Chlorophytum comosum', alias: 'Chlorophytum', iv: 5, licht: 'Hell, ohne direkte Sonne', menge: '200 ml', d: 21, um: 12, hinweis: 'Ableger lassen sich einfach abtrennen.' },
  { n: 'Zebrakraut', art: 'Tradescantia', alias: 'Dreimasterblume', iv: 5, licht: 'Hell, ohne direkte Sonne', menge: '150 ml', d: 21, um: 12, hinweis: 'Regelmäßig zurückschneiden, sonst verkahlt sie.' },
  { n: 'Bubikopf', art: 'Soleirolia soleirolii', alias: '', iv: 3, licht: 'Halbschatten', menge: '100 ml', d: 21, um: 12, hinweis: 'Darf nie austrocknen.' },

  // --- Blühende ---
  { n: 'Einblatt', art: 'Spathiphyllum', alias: 'Friedenslilie, Scheidenblatt', iv: 4, licht: 'Halbschatten', menge: '250 ml', d: 21, um: 24, hinweis: 'Lässt die Blätter hängen, wenn es Durst hat.' },
  { n: 'Flamingoblume', art: 'Anthurium', alias: 'Anthurie', iv: 5, licht: 'Hell, ohne direkte Sonne', menge: '200 ml', d: 21, um: 24, hinweis: 'Mag hohe Luftfeuchtigkeit.' },
  { n: 'Orchidee', art: 'Phalaenopsis', alias: 'Schmetterlingsorchidee, Phalaenopsis', iv: 10, licht: 'Hell, ohne direkte Sonne', menge: 'tauchen', d: 21, um: 24, hinweis: 'Tauchen statt gießen, gut abtropfen lassen.' },
  { n: 'Usambaraveilchen', art: 'Saintpaulia', alias: 'Veilchen', iv: 6, licht: 'Hell, ohne direkte Sonne', menge: '100 ml', d: 21, um: 12, hinweis: 'Von unten gießen, Blätter nicht nass machen.' },
  { n: 'Alpenveilchen', art: 'Cyclamen', alias: 'Cyclame', iv: 4, licht: 'Hell, ohne direkte Sonne', menge: '150 ml', d: 21, um: 12, hinweis: 'Kühl stellen, von unten gießen.' },
  { n: 'Weihnachtsstern', art: 'Euphorbia pulcherrima', alias: 'Poinsettie', iv: 5, licht: 'Hell, ohne direkte Sonne', menge: '150 ml', d: 30, um: 0, hinweis: 'Keine Zugluft, keine kalten Füße.' },
  { n: 'Amaryllis', art: 'Hippeastrum', alias: 'Ritterstern', iv: 7, licht: 'Hell, ohne direkte Sonne', menge: '150 ml', d: 21, um: 24, hinweis: 'Nach der Blüte einziehen lassen und trocken halten.' },
  { n: 'Zimmerhibiskus', art: 'Hibiscus rosa-sinensis', alias: 'Hibiskus, Roseneibisch', iv: 3, licht: 'Vollsonne', menge: '400 ml', d: 14, um: 24, hinweis: 'Im Sommer sehr durstig.' },
  { n: 'Gardenie', art: 'Gardenia jasminoides', alias: '', iv: 4, licht: 'Hell, ohne direkte Sonne', menge: '200 ml', d: 14, um: 24, hinweis: 'Nur kalkfreies, zimmerwarmes Wasser.' },
  { n: 'Azalee', art: 'Rhododendron simsii', alias: 'Zimmerazalee', iv: 3, licht: 'Halbschatten', menge: '300 ml', d: 21, um: 24, hinweis: 'Ballen nie austrocknen lassen, weiches Wasser.' },
  { n: 'Bromelie', art: 'Guzmania', alias: 'Guzmania, Vriesea', iv: 7, licht: 'Hell, ohne direkte Sonne', menge: '150 ml', d: 30, um: 0, hinweis: 'Wasser in den Blatttrichter geben.' },
  { n: 'Kalanchoe', art: 'Kalanchoe blossfeldiana', alias: 'Flammendes Käthchen', iv: 12, licht: 'Vollsonne', menge: '100 ml', d: 30, um: 18, hinweis: 'Dickblättrig, verzeiht Trockenheit.' },
  { n: 'Fleißiges Lieschen', art: 'Impatiens', alias: 'Impatiens', iv: 2, licht: 'Halbschatten', menge: '200 ml', d: 14, um: 0, hinweis: 'Braucht durchgehend feuchte Erde.' },

  // --- Sukkulenten und Kakteen ---
  { n: 'Aloe Vera', art: 'Aloe barbadensis', alias: 'Aloe', iv: 18, licht: 'Vollsonne', menge: '100 ml', d: 60, um: 24, hinweis: 'Im Winter fast gar nicht gießen.' },
  { n: 'Kaktus', art: '', alias: 'Säulenkaktus, Kugelkaktus, Kakteen', iv: 30, licht: 'Vollsonne', menge: '50 ml', d: 60, um: 36, hinweis: 'Von Oktober bis März trocken halten.' },
  { n: 'Weihnachtskaktus', art: 'Schlumbergera', alias: 'Schlumbergera, Osterkaktus', iv: 10, licht: 'Hell, ohne direkte Sonne', menge: '100 ml', d: 30, um: 24, hinweis: 'Während der Knospenbildung nicht drehen.' },
  { n: 'Geldbaum', art: 'Crassula ovata', alias: 'Pfennigbaum, Jadebaum, Crassula', iv: 18, licht: 'Vollsonne', menge: '150 ml', d: 60, um: 36, hinweis: 'Dicke Blätter speichern Wasser.' },
  { n: 'Echeveria', art: 'Echeveria', alias: 'Sukkulente', iv: 18, licht: 'Vollsonne', menge: '80 ml', d: 60, um: 24, hinweis: 'Nicht über die Rosette gießen.' },
  { n: 'Haworthia', art: 'Haworthia', alias: '', iv: 18, licht: 'Hell, ohne direkte Sonne', menge: '80 ml', d: 60, um: 36, hinweis: 'Braucht deutlich weniger Sonne als andere Sukkulenten.' },
  { n: 'Christusdorn', art: 'Euphorbia milii', alias: '', iv: 14, licht: 'Vollsonne', menge: '100 ml', d: 45, um: 36, hinweis: 'Milchsaft ist giftig.' },

  // --- Palmen und Grünes ---
  { n: 'Bergpalme', art: 'Chamaedorea elegans', alias: 'Zimmerpalme, Chamaedorea, Palme', iv: 7, licht: 'Halbschatten', menge: '300 ml', d: 30, um: 36, hinweis: 'Braune Spitzen deuten auf trockene Luft.' },
  { n: 'Kentiapalme', art: 'Howea forsteriana', alias: 'Howea', iv: 8, licht: 'Halbschatten', menge: '350 ml', d: 30, um: 36, hinweis: 'Sehr robust, verträgt auch dunklere Ecken.' },
  { n: 'Arecapalme', art: 'Dypsis lutescens', alias: 'Goldfruchtpalme, Areca', iv: 6, licht: 'Hell, ohne direkte Sonne', menge: '350 ml', d: 30, um: 36, hinweis: 'Erde gleichmäßig feucht halten.' },
  { n: 'Glücksbambus', art: 'Dracaena sanderiana', alias: 'Lucky Bamboo, Zimmerbambus', iv: 4, licht: 'Halbschatten', menge: '200 ml', d: 30, um: 24, hinweis: 'Im Wasserglas den Pegel halten, Wasser wöchentlich wechseln.' },
  { n: 'Zyperngras', art: 'Cyperus alternifolius', alias: 'Papyrus', iv: 2, licht: 'Hell, ohne direkte Sonne', menge: '300 ml', d: 21, um: 12, hinweis: 'Untersetzer darf dauerhaft Wasser enthalten.' },
  { n: 'Farn', art: 'Nephrolepis', alias: 'Schwertfarn, Zimmerfarn', iv: 3, licht: 'Halbschatten', menge: '200 ml', d: 21, um: 24, hinweis: 'Erde darf nie ganz austrocknen.' },
  { n: 'Efeu', art: 'Hedera helix', alias: 'Zimmerefeu', iv: 5, licht: 'Halbschatten', menge: '200 ml', d: 30, um: 24, hinweis: 'Regelmäßig abbrausen, das hält Spinnmilben fern.' },
  { n: 'Zimmerlinde', art: 'Sparrmannia africana', alias: '', iv: 3, licht: 'Hell, ohne direkte Sonne', menge: '400 ml', d: 21, um: 24, hinweis: 'Großer Wasserbedarf im Sommer.' },
  { n: 'Croton', art: 'Codiaeum variegatum', alias: 'Wunderstrauch, Kroton', iv: 5, licht: 'Hell, ohne direkte Sonne', menge: '200 ml', d: 21, um: 24, hinweis: 'Je heller, desto kräftiger die Blattfarben.' },
  { n: 'Buntnessel', art: 'Coleus', alias: 'Plectranthus', iv: 3, licht: 'Hell, ohne direkte Sonne', menge: '200 ml', d: 14, um: 12, hinweis: 'Spitzen ausknipsen für buschigen Wuchs.' },
  { n: 'Venusfliegenfalle', art: 'Dionaea muscipula', alias: 'Fleischfressende Pflanze', iv: 2, licht: 'Vollsonne', menge: '100 ml', d: 0, um: 12, hinweis: 'Nur Regen- oder destilliertes Wasser, niemals düngen.' },

  // --- Zitrus, Kräuter, Balkon ---
  { n: 'Zitronenbaum', art: 'Citrus limon', alias: 'Zitrone, Zitruspflanze', iv: 4, licht: 'Vollsonne', menge: '500 ml', d: 14, um: 36, hinweis: 'Im Winter kühl und hell überwintern.' },
  { n: 'Olivenbaum', art: 'Olea europaea', alias: 'Olive', iv: 6, licht: 'Vollsonne', menge: '400 ml', d: 30, um: 36, hinweis: 'Verträgt Trockenheit besser als Nässe.' },
  { n: 'Kaffeepflanze', art: 'Coffea arabica', alias: 'Kaffeestrauch', iv: 4, licht: 'Hell, ohne direkte Sonne', menge: '250 ml', d: 21, um: 24, hinweis: 'Kalkfreies Wasser, keine pralle Sonne.' },
  { n: 'Basilikum', art: 'Ocimum basilicum', alias: '', iv: 2, licht: 'Vollsonne', menge: '100 ml', d: 14, um: 0, hinweis: 'Von unten gießen, Blätter trocken halten.' },
  { n: 'Minze', art: 'Mentha', alias: 'Pfefferminze', iv: 2, licht: 'Halbschatten', menge: '150 ml', d: 21, um: 12, hinweis: 'Wuchert, am besten allein im Topf.' },
  { n: 'Petersilie', art: 'Petroselinum crispum', alias: '', iv: 2, licht: 'Halbschatten', menge: '150 ml', d: 21, um: 0, hinweis: 'Braucht dauerhaft feuchte Erde, verträgt aber keine Staunässe.' },
  { n: 'Schnittlauch', art: 'Allium schoenoprasum', alias: '', iv: 2, licht: 'Hell, ohne direkte Sonne', menge: '150 ml', d: 21, um: 12, hinweis: 'Nach dem Schnitt kräftig gießen.' },
  { n: 'Koriander', art: 'Coriandrum sativum', alias: 'Cilantro', iv: 2, licht: 'Hell, ohne direkte Sonne', menge: '150 ml', d: 21, um: 0, hinweis: 'Schießt bei Hitze schnell, lieber nicht in die pralle Mittagssonne.' },
  { n: 'Dill', art: 'Anethum graveolens', alias: '', iv: 2, licht: 'Vollsonne', menge: '150 ml', d: 21, um: 0, hinweis: 'Tiefer Topf, die Pfahlwurzel braucht Platz.' },
  { n: 'Zitronenmelisse', art: 'Melissa officinalis', alias: 'Melisse', iv: 3, licht: 'Halbschatten', menge: '200 ml', d: 21, um: 12, hinweis: 'Wächst kräftig, regelmäßig ernten hält sie buschig.' },
  { n: 'Kresse', art: 'Lepidium sativum', alias: 'Gartenkresse', iv: 1, licht: 'Hell, ohne direkte Sonne', menge: '50 ml', d: 0, um: 0, hinweis: 'Täglich feucht halten, nach dem Schnitt neu aussäen.' },
  { n: 'Rosmarin', art: 'Salvia rosmarinus', alias: '', iv: 7, licht: 'Vollsonne', menge: '150 ml', d: 30, um: 24, hinweis: 'Lieber zu trocken als zu nass.' },
  { n: 'Thymian', art: 'Thymus vulgaris', alias: '', iv: 7, licht: 'Vollsonne', menge: '120 ml', d: 30, um: 24, hinweis: 'Mag durchlässige, eher magere Erde.' },
  { n: 'Salbei', art: 'Salvia officinalis', alias: '', iv: 5, licht: 'Vollsonne', menge: '200 ml', d: 30, um: 24, hinweis: 'Nach der Blüte zurückschneiden, dann treibt er buschig nach.' },
  { n: 'Oregano', art: 'Origanum vulgare', alias: 'Majoran', iv: 5, licht: 'Vollsonne', menge: '150 ml', d: 30, um: 24, hinweis: 'Je sonniger der Standort, desto kräftiger das Aroma.' },
  { n: 'Lavendel', art: 'Lavandula angustifolia', alias: '', iv: 6, licht: 'Vollsonne', menge: '250 ml', d: 30, um: 24, hinweis: 'Verträgt keine Staunässe, im Frühjahr zurückschneiden.' },
  { n: 'Hortensie', art: 'Hydrangea', alias: '', iv: 2, licht: 'Halbschatten', menge: '500 ml', d: 14, um: 24, hinweis: 'Braucht im Sommer sehr viel Wasser.' },
  { n: 'Geranie', art: 'Pelargonium', alias: 'Pelargonie', iv: 3, licht: 'Vollsonne', menge: '250 ml', d: 14, um: 12, hinweis: 'Verblühtes regelmäßig ausputzen.' },
  { n: 'Fuchsie', art: 'Fuchsia', alias: '', iv: 2, licht: 'Halbschatten', menge: '250 ml', d: 14, um: 12, hinweis: 'Keine pralle Mittagssonne.' },
  { n: 'Petunie', art: 'Petunia', alias: '', iv: 2, licht: 'Vollsonne', menge: '300 ml', d: 7, um: 0, hinweis: 'Im Hochsommer täglich gießen.' },
  { n: 'Hanf', art: 'Cannabis sativa', alias: 'Cannabis, Nutzhanf', iv: 3, licht: 'Vollsonne', menge: '500 ml', d: 10, um: 0, hinweis: 'Erst gießen, wenn die oberen zwei bis drei Zentimeter Erde trocken sind – Staunässe ist der häufigste Fehler. Bedarf steigt mit der Topfgröße deutlich.' }
];

/** Vereinheitlicht Schreibweisen: Umlaute, Sonderzeichen, Groß/Klein. */
function normName(text) {
  return String(text || '').toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Wortstamm ohne die üblichen deutschen Mehrzahl-Endungen.
    So findet "Efeutüten" auch "Efeutute" und "Geranien" die "Geranie". */
function wortStamm(text) {
  return normName(text).split(' ')
    .map(w => w.length > 4 ? w.replace(/(en|nen|n|e|s)$/, '') : w)
    .join(' ');
}

/** Sucht einen Richtwert-Eintrag zu Name oder Art, auch über Zweitnamen. */
function artFinden(text) {
  const roh = (text || '').trim();
  if (roh.length < 3) return null;
  const suche = normName(roh);
  const stamm = wortStamm(roh);

  const namen = a => [a.n, a.art].concat((a.alias || '').split(','))
    .map(x => (x || '').trim()).filter(Boolean);

  // 1. genau so geschrieben
  let treffer = ARTEN.find(a => namen(a).some(n => normName(n) === suche));
  if (treffer) return treffer;

  // 2. Teiltreffer in beide Richtungen
  treffer = ARTEN.find(a => namen(a).some(n => {
    const nn = normName(n);
    return suche.includes(nn) || nn.includes(suche);
  }));
  if (treffer) return treffer;

  // 3. auf den Wortstamm reduziert – fängt Mehrzahl und Endungen ab.
  //    Erst der genaue Stamm, sonst gewinnt bei "Palmen" die Yuccapalme
  //    gegen die Bergpalme, nur weil sie weiter oben in der Liste steht.
  treffer = ARTEN.find(a => namen(a).some(n => wortStamm(n) === stamm));
  if (treffer) return treffer;

  return ARTEN.find(a => namen(a).some(n => {
    const ns = wortStamm(n);
    return ns.length > 2 && (stamm.includes(ns) || ns.includes(stamm));
  })) || null;
}

/** Zeigt unter dem Namensfeld an, dass Richtwerte bereitstehen. */
function artVorschlagPruefen() {
  const box = $('#art-vorschlag');
  const treffer = artFinden($('#f-name').value) || artFinden($('#f-art').value);
  if (!treffer) { box.hidden = true; box.dataset.art = ''; return; }
  box.dataset.art = treffer.n;
  box.innerHTML = `<span>Richtwerte für <b>${esc(treffer.n)}</b>: alle ${treffer.iv} Tage` +
    `${treffer.menge ? ', ' + esc(treffer.menge) : ''}</span>` +
    `<button type="button" class="aktion" id="btn-art-uebernehmen">Übernehmen</button>`;
  box.hidden = false;
  $('#btn-art-uebernehmen').onclick = () => artUebernehmen(treffer);
}

/** Baut das Standort-Dropdown: Standardräume, eigene Räume, und ein
    Eintrag zum Anlegen eines neuen. */
function raumWahlFuellen(aktuell) {
  const eigene = aktive().map(p => p.raum).filter(Boolean);
  const alle = Array.from(new Set(STANDORTE.concat(eigene)))
    .sort((a, b) => a.localeCompare(b, 'de'));
  const bekannt = aktuell && alle.includes(aktuell);

  $('#f-raum-wahl').innerHTML =
    `<option value="">ohne Standort</option>` +
    alle.map(r => `<option value="${esc(r)}"${r === aktuell ? ' selected' : ''}>${esc(r)}</option>`).join('') +
    `<option value="__neu">Anderer Standort …</option>`;

  // Ein Standort, den es nicht mehr in der Liste gibt, darf nicht verloren gehen
  if (aktuell && !bekannt) {
    $('#f-raum-wahl').value = '__neu';
    $('#f-raum').value = aktuell;
    $('#feld-raum-neu').hidden = false;
  } else {
    $('#f-raum').value = '';
    $('#feld-raum-neu').hidden = true;
  }
}

/** Der gewählte Standort, egal ob aus der Liste oder neu eingetippt. */
function gewaehlterRaum() {
  const wahl = $('#f-raum-wahl').value;
  return wahl === '__neu' ? $('#f-raum').value.trim() : wahl;
}

/** Füllt die Felder mit den Richtwerten. Was schon ausgefüllt ist, bleibt. */
function artUebernehmen(a) {
  const fuelle = (wahl, wert, nurWennLeer = true) => {
    const feld = $(wahl);
    if (!feld || !wert) return;
    const leer = !feld.value || feld.value === '0';
    if (!nurWennLeer || leer) feld.value = wert;
  };

  fuelle('#f-art', a.art);
  fuelle('#f-menge', a.menge);
  fuelle('#f-licht', a.licht);
  fuelle('#f-duenger-int', a.d);
  fuelle('#f-umtopfen-int', a.um);
  // Das Gießintervall steht auf 7 vorbelegt – hier ist der Richtwert die
  // bessere Auskunft, solange der Nutzer nichts anderes eingetragen hat.
  const iv = $('#f-intervall');
  if (!iv.value || iv.value === '7') iv.value = a.iv;

  const notiz = $('#f-notiz');
  if (a.hinweis && !notiz.value.trim()) notiz.value = a.hinweis;

  // Ein Datum brauchen die Aufgaben, sonst rechnet nichts
  const heute = toISO(new Date());
  if (a.d && !$('#f-duenger-letzt').value) $('#f-duenger-letzt').value = heute;
  if (a.um && !$('#f-umtopfen-letzt').value) $('#f-umtopfen-letzt').value = heute;

  $('#art-vorschlag').hidden = true;
  toast('Richtwerte für ' + a.n + ' übernommen');
}

/* ---------- Fotoverlauf ----------
   Mehrere Fotos je Pflanze mit Datum. Die Bilder liegen als JPEG im
   localStorage und werden mitsynchronisiert, deshalb die Begrenzung auf
   sechs Stück und 500 px Kantenlänge. */
const FOTOS_MAX = 6;

function fotosVon(p) {
  return Array.isArray(p.fotos) ? p.fotos : [];
}

function fotoGalerieHTML(p) {
  const liste = fotosVon(p);
  const bilder = liste.map(f => `
    <button class="galerie-bild" data-foto="${f.id}" data-fpid="${p.id}">
      <img src="${f.bild}" alt="">
      <span>${new Date(f.ts).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
    </button>`).join('');
  const platz = liste.length < FOTOS_MAX
    ? `<button class="galerie-neu" data-foto-neu="${p.id}">＋<span>Foto</span></button>` : '';
  return `<div class="section-title mit-aktion"><span>Fotoverlauf</span>` +
         `<span style="text-transform:none;letter-spacing:0;font-weight:400">${liste.length}/${FOTOS_MAX}</span></div>` +
         `<div class="galerie">${bilder}${platz}</div>`;
}

async function fotoHinzufuegen(pid, datei) {
  const p = DB.plants.find(x => x.id === pid);
  if (!p) return;
  const liste = fotosVon(p);
  if (liste.length >= FOTOS_MAX) { toast('Mehr als ' + FOTOS_MAX + ' Fotos gehen nicht'); return; }
  try {
    const bild = await bildVerkleinern(datei, 500, 0.7);
    p.fotos = liste.concat([{ id: uid(), bild, ts: Date.now() }]);
    save();
    openDetail(pid);
    toast('Foto hinzugefügt');
  } catch (e) {
    toast(e.message || 'Foto konnte nicht gelesen werden');
  }
}

function fotoAnsehen(pid, fid) {
  const p = DB.plants.find(x => x.id === pid);
  const f = fotosVon(p).find(x => x.id === fid);
  if (!f) return;
  $('#foto-gross').innerHTML = `
    <div class="grabber"></div>
    <img src="${f.bild}" alt="" class="foto-voll">
    <p style="text-align:center;color:var(--text-2);margin:12px 0 0">
      ${esc(p.name)} · ${new Date(f.ts).toLocaleDateString('de-DE',
        { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
    <button class="btn danger" data-foto-weg="${fid}" data-fpid="${pid}">Foto löschen</button>
    <button class="btn sec" data-close>Schließen</button>`;
  openSheet('#sheet-foto');
}

function fotoLoeschen(pid, fid) {
  const p = DB.plants.find(x => x.id === pid);
  if (!p) return;
  p.fotos = fotosVon(p).filter(f => f.id !== fid);
  save();
  closeSheets();
  setTimeout(() => openDetail(pid), 160);
  toast('Foto gelöscht');
}

/* ---------- Statistik ----------
   Alles wird aus DB.logs gerechnet. Aussagekräftig wird das erst nach ein
   paar Wochen Nutzung – vorher steht entsprechend wenig da. */

/** Gießvorgänge je Kalenderwoche der letzten acht Wochen. */
function wochenBalken() {
  const heute = heute0();
  const wochen = [];
  for (let i = 7; i >= 0; i--) {
    const bis = new Date(heute.getTime() - i * 7 * 86400000);
    const von = new Date(bis.getTime() - 6 * 86400000);
    von.setHours(0, 0, 0, 0);
    const ende = new Date(bis.getTime() + 86400000);
    const anzahl = DB.logs.filter(l => l.typ === 'wasser' && l.ts >= von.getTime() && l.ts < ende.getTime()).length;
    wochen.push({ von, anzahl });
  }
  return wochen;
}

/** Wie pünktlich wurde eine Pflanze gegossen? Positiv = im Schnitt zu spät. */
function verspaetung(p) {
  const eigene = DB.logs.filter(l => l.plantId === p.id && l.typ === 'wasser')
    .sort((a, b) => a.ts - b.ts);
  if (eigene.length < 2) return null;
  const iv = Number(p.intervall) || 7;
  let summe = 0, n = 0;
  for (let i = 1; i < eigene.length; i++) {
    const abstand = Math.round((eigene[i].ts - eigene[i - 1].ts) / 86400000);
    if (abstand > iv * 4) continue;   // längere Pausen (Urlaub) verzerren nur
    summe += abstand - iv;
    n++;
  }
  return n ? { schnitt: summe / n, anzahl: eigene.length } : null;
}

/** Wassermenge in Millilitern aus dem Freitextfeld, wenn möglich. */
function mengeMl(p) {
  const treffer = String(p.menge || '').match(/(\d+[.,]?\d*)\s*(l|ml)?/i);
  if (!treffer) return null;
  const zahl = parseFloat(treffer[1].replace(',', '.'));
  if (!isFinite(zahl)) return null;
  return (treffer[2] || 'ml').toLowerCase() === 'l' ? zahl * 1000 : zahl;
}

function zeigeStatistik() {
  const box = $('#statistik-inhalt');
  const wasser = DB.logs.filter(l => l.typ === 'wasser');
  const vor30 = Date.now() - 30 * 86400000;
  const letzte30 = wasser.filter(l => l.ts >= vor30);

  // Wasserverbrauch der letzten 30 Tage
  let ml = 0, unbekannt = 0;
  for (const l of letzte30) {
    const p = DB.plants.find(x => x.id === l.plantId);
    const m = p && mengeMl(p);
    if (m) ml += m; else unbekannt++;
  }

  const balken = wochenBalken();
  const hoechst = Math.max(1, ...balken.map(b => b.anzahl));

  let html = `<div class="stat-row" style="margin-bottom:16px">
      <div class="stat" style="border:0"><b>${wasser.length}</b><span>Gießvorgänge</span></div>
      <div class="stat" style="border:0"><b>${letzte30.length}</b><span>letzte 30 Tage</span></div>
      <div class="stat" style="border:0"><b>${ml >= 1000 ? (ml / 1000).toFixed(1).replace('.', ',') + ' l' : Math.round(ml) + ' ml'}</b><span>Wasser</span></div>
    </div>`;

  if (unbekannt) {
    html += `<p style="color:var(--text-3);font-size:12.5px;text-align:center;margin:-8px 0 14px">
      ${unbekannt} Vorgänge ohne Mengenangabe sind nicht mitgerechnet.</p>`;
  }

  if (!wasser.length) {
    box.innerHTML = html + `<div class="empty"><div class="big">📊</div>
      <p>Noch nichts zu zeigen.</p>
      <p>Sobald du ein paar Wochen gießt, entsteht hier ein Bild.</p></div>`;
    return;
  }

  html += `<div class="section-title">Gießvorgänge je Woche</div><div class="card"><div class="balken">`;
  for (const b of balken) {
    const hoehe = Math.round((b.anzahl / hoechst) * 100);
    html += `<div class="balken-spalte" title="${b.anzahl}">
      <div class="balken-zahl">${b.anzahl || ''}</div>
      <div class="balken-stab" style="height:${Math.max(hoehe, b.anzahl ? 6 : 2)}%"></div>
      <div class="balken-text">${b.von.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}</div>
    </div>`;
  }
  html += `</div></div>`;

  // Zuverlässigkeit je Pflanze
  const bewertet = aktive()
    .map(p => ({ p, v: verspaetung(p) }))
    .filter(x => x.v)
    .sort((a, b) => b.v.schnitt - a.v.schnitt);

  if (bewertet.length) {
    html += `<div class="section-title">Pünktlichkeit</div><div class="group">`;
    for (const { p, v } of bewertet.slice(0, 8)) {
      const tage = v.schnitt;
      const zahl = n => n.toFixed(1).replace('.', ',');
      const text = Math.abs(tage) < 0.5 ? 'pünktlich'
        : tage > 0 ? '⌀ ' + zahl(tage) + ' Tage zu spät'
                   : '⌀ ' + zahl(Math.abs(tage)) + ' Tage zu früh';
      const farbe = tage > 1.5 ? 'var(--red)' : tage > 0.5 ? 'var(--orange)' : 'var(--accent)';
      html += `<div class="field"><label>${esc(p.name)}</label>
        <span class="hint" style="color:${farbe}">${text}</span></div>`;
    }
    html += `</div><p style="color:var(--text-3);font-size:12.5px;margin:2px 4px 0">
      Verglichen wird der tatsächliche Abstand zwischen zwei Gießvorgängen mit
      dem eingestellten Intervall. Längere Pausen, etwa im Urlaub, bleiben außen vor.</p>`;
  }

  // Häufigkeit je Aufgabe
  const proTyp = {};
  for (const l of DB.logs) proTyp[l.typ] = (proTyp[l.typ] || 0) + 1;
  const zeilen = Object.entries(proTyp)
    .sort((a, b) => b[1] - a[1])
    .map(([typ, n]) => `<div class="field"><label>${logText(typ)}</label><span class="hint">${n}</span></div>`)
    .join('');
  if (zeilen) html += `<div class="section-title">Verlauf gesamt</div><div class="group">${zeilen}</div>`;

  box.innerHTML = html;
}

/* ---------- Gieß-Runde ----------
   Führt einmal durch die Wohnung, nach Standort gruppiert. Immer nur eine
   Pflanze auf dem Schirm, damit man beim Gießen nicht in einer Liste sucht.
   Gegossen wird erst am Ende gespeichert – so lässt sich die ganze Runde
   in einem Zug zurücknehmen. */
let runde = null;   // { pflanzen: [], index: 0, erledigt: Set }

function rundeStarten() {
  const faellig = aktive().filter(p => tageBis(p) <= 0);
  if (!faellig.length) { toast('Gerade ist nichts fällig'); return; }

  // Nach Standort gruppieren, damit man nicht zwischen Zimmern hin und her läuft
  const nachRaum = {};
  for (const p of faellig) (nachRaum[p.raum || 'Ohne Standort'] ||= []).push(p);
  const sortiert = Object.keys(nachRaum).sort((a, b) => a.localeCompare(b, 'de'))
    .flatMap(raum => nachRaum[raum].sort((a, b) => tageBis(a) - tageBis(b)));

  runde = { pflanzen: sortiert, index: 0, erledigt: new Set() };
  rundeZeichnen();
  openSheet('#sheet-runde');
}

function rundeZeichnen() {
  if (!runde) return;
  const box = $('#runde-inhalt');

  if (runde.index >= runde.pflanzen.length) { rundeAbschluss(box); return; }

  const p = runde.pflanzen[runde.index];
  const nummer = runde.index + 1;
  const gesamt = runde.pflanzen.length;
  const anteil = Math.round((runde.index / gesamt) * 100);
  const naechste = runde.pflanzen[runde.index + 1];

  box.innerHTML = `
    <div class="runde-fortschritt">
      <div class="bar"><i style="width:${anteil}%"></i></div>
      <div class="runde-zaehler">${nummer} von ${gesamt}</div>
    </div>

    <div class="runde-karte">
      ${avatarHTML(p, 'gross')}
      <h3>${esc(p.name)}</h3>
      <p class="runde-ort">${p.raum ? esc(p.raum) : 'ohne Standort'}</p>
      ${p.menge ? `<p class="runde-menge">${esc(p.menge)}</p>` : ''}
      <p class="runde-status"><span class="badge ${statusOf(p)}">${statusText(p)}</span></p>
      ${p.notiz ? `<p class="runde-notiz">${esc(p.notiz)}</p>` : ''}
    </div>

    <button class="btn" data-runde="gegossen">💧 Gegossen, weiter</button>
    <button class="btn sec" data-runde="ueberspringen">Überspringen</button>
    ${naechste ? `<p class="runde-naechste">Danach: ${esc(naechste.name)}${
      naechste.raum ? ' · ' + esc(naechste.raum) : ''}</p>` : ''}
    <button class="btn sec" data-runde="abbruch">Runde beenden</button>`;
}

function rundeAbschluss(box) {
  const n = runde.erledigt.size;
  const offen = runde.pflanzen.length - n;
  box.innerHTML = `
    <div class="empty">
      <div class="big">${n ? '✅' : '🤔'}</div>
      <p><b>${n === 0 ? 'Nichts gegossen' : n === 1 ? 'Eine Pflanze gegossen' : n + ' Pflanzen gegossen'}</b></p>
      ${offen ? `<p>${offen} ${offen === 1 ? 'wurde' : 'wurden'} übersprungen und ${
        offen === 1 ? 'bleibt' : 'bleiben'} fällig.</p>` : '<p>Alles erledigt.</p>'}
    </div>
    <button class="btn" data-runde="fertig">Fertig</button>`;
}

/** Übernimmt die Runde in die Daten – ein Eintrag, damit Rückgängig alles fasst. */
function rundeSpeichern() {
  if (!runde || !runde.erledigt.size) { runde = null; closeSheets(); return; }
  const heute = toISO(new Date());
  const eintraege = [];
  for (const id of runde.erledigt) {
    const p = DB.plants.find(x => x.id === id);
    if (!p) continue;
    const logId = uid();
    eintraege.push({ feld: 'letzt', plantId: id, vorher: p.letzt, logId });
    p.letzt = heute;
    DB.logs.push({ id: logId, plantId: id, typ: 'wasser', ts: Date.now() });
  }
  const anzahl = eintraege.length;
  letzteAktion = { eintraege };
  runde = null;
  save();
  renderAll();
  closeSheets();
  toast('💧 ' + anzahl + (anzahl === 1 ? ' Pflanze' : ' Pflanzen') + ' gegossen',
        'Rückgängig', rueckgaengig);
}

function rundeSchritt(was) {
  if (!runde) return;
  if (was === 'abbruch' || was === 'fertig') { rundeSpeichern(); return; }
  if (was === 'gegossen') {
    runde.erledigt.add(runde.pflanzen[runde.index].id);
    if (navigator.vibrate) navigator.vibrate(10);
  }
  runde.index++;
  rundeZeichnen();
}

/* ---------- Problem-Hilfe ----------
   Symptom auswählen, mögliche Ursachen und Maßnahmen lesen. Wird die Hilfe aus
   einer Pflanze heraus geöffnet, prüft `pruefungen` deren tatsächliche Werte
   und stellt passende Hinweise nach oben. */
const PROBLEME = [
  {
    id: 'gelbe-blaetter', emoji: '🟡', titel: 'Gelbe Blätter',
    ursachen: [
      { was: 'Zu viel Wasser', tun: 'Häufigste Ursache. Erde antrocknen lassen, Untersetzer leeren, Intervall verlängern. Riecht die Erde faulig, umtopfen und faule Wurzeln abschneiden.' },
      { was: 'Zu wenig Wasser', tun: 'Ist die Erde staubtrocken und der Ballen von der Topfwand abgelöst: durchdringend wässern oder eine halbe Stunde tauchen.' },
      { was: 'Nährstoffmangel', tun: 'Gleichmäßig hellgelbe Blätter bei grünen Adern deuten auf Eisenmangel. In der Wachstumszeit alle zwei bis vier Wochen düngen.' },
      { was: 'Natürliche Alterung', tun: 'Einzelne untere Blätter gelb und dann braun: normal, einfach entfernen.' }
    ]
  },
  {
    id: 'braune-spitzen', emoji: '🟤', titel: 'Braune Blattspitzen',
    ursachen: [
      { was: 'Trockene Luft', tun: 'Typisch im Winter über der Heizung. Luftfeuchte erhöhen, Pflanze umstellen, Blätter besprühen (nicht bei samtigen Blättern).' },
      { was: 'Kalk im Wasser', tun: 'Abgestandenes, weiches Wasser nehmen oder Regenwasser sammeln. Betrifft besonders Grünlilie, Drachenbaum und Calathea.' },
      { was: 'Zu viel Dünger', tun: 'Salzränder auf der Erde? Ein bis zwei Monate nicht düngen, den Ballen mit klarem Wasser durchspülen.' }
    ]
  },
  {
    id: 'haengende-blaetter', emoji: '🥀', titel: 'Blätter hängen',
    ursachen: [
      { was: 'Durst', tun: 'Erde trocken? Dann gründlich gießen, die meisten Pflanzen erholen sich in wenigen Stunden.' },
      { was: 'Wurzelfäule', tun: 'Hängende Blätter bei nasser Erde sind ein Alarmzeichen: Die Wurzeln nehmen kein Wasser mehr auf. Austopfen, faule braune Wurzeln entfernen, in frische Erde setzen und erst mal sparsam gießen.' },
      { was: 'Zugluft oder Kälte', tun: 'Standort neben offenem Fenster oder Tür prüfen, besonders im Winter.' }
    ]
  },
  {
    id: 'trauermuecken', emoji: '🦟', titel: 'Kleine schwarze Mücken',
    ursachen: [
      { was: 'Trauermücken in der Erde', tun: 'Ihre Larven leben in dauerfeuchter Erde. Oberschicht abtrocknen lassen, von unten gießen, Gelbtafeln gegen die Fliegenden aufstellen. Bei starkem Befall Nematoden gießen oder die Erde tauschen.' },
      { was: 'Zu feuchte Haltung', tun: 'Gießintervall verlängern – die Mücken verschwinden mit der Feuchtigkeit.' }
    ]
  },
  {
    id: 'schimmel', emoji: '⚪', titel: 'Weißer Belag auf der Erde',
    ursachen: [
      { was: 'Schimmel', tun: 'Meist harmlos. Belag abtragen, Erde lockern, weniger gießen und für Luftbewegung sorgen.' },
      { was: 'Kalkablagerungen', tun: 'Krustig und hart statt flauschig: Kalk aus dem Gießwasser. Oberschicht erneuern, weicheres Wasser nehmen.' }
    ]
  },
  {
    id: 'klebrig', emoji: '🐛', titel: 'Klebrige Blätter, kleine Tiere',
    ursachen: [
      { was: 'Blattläuse', tun: 'Grüne oder schwarze Tierchen an Trieben. Abduschen, danach mit Schmierseifenlösung einsprühen, nach einer Woche wiederholen.' },
      { was: 'Schildläuse', tun: 'Braune Höcker auf Blattunterseiten und Stielen. Einzeln abkratzen, dann mit Öl-Seifen-Mittel behandeln.' },
      { was: 'Wollläuse', tun: 'Weiße Wattebäusche in Blattachseln. Mit einem in Spiritus getauchten Wattestäbchen betupfen.' }
    ]
  },
  {
    id: 'spinnmilben', emoji: '🕸', titel: 'Feine Gespinste, gesprenkelte Blätter',
    ursachen: [
      { was: 'Spinnmilben', tun: 'Kommen bei trockener Heizungsluft. Pflanze kräftig abbrausen, Luftfeuchte erhöhen, notfalls mit Rapsöl-Präparat behandeln. Befallene Pflanzen von anderen trennen.' }
    ]
  },
  {
    id: 'kein-wachstum', emoji: '🌱', titel: 'Wächst nicht, wird lang und dünn',
    ursachen: [
      { was: 'Zu wenig Licht', tun: 'Lange dünne Triebe mit weiten Abständen zwischen den Blättern: heller stellen. Im Winter reicht vielen Zimmerpflanzen das Licht am Fenster kaum.' },
      { was: 'Topf zu klein', tun: 'Wurzeln wachsen unten aus dem Topf oder drehen sich im Kreis: in einen zwei bis vier Zentimeter größeren Topf umsetzen.' },
      { was: 'Nährstoffe fehlen', tun: 'Steht sie länger als ein Jahr in derselben Erde ohne Dünger, ist alles aufgebraucht.' }
    ]
  },
  {
    id: 'blattfall', emoji: '🍂', titel: 'Plötzlicher Blattfall',
    ursachen: [
      { was: 'Standortwechsel', tun: 'Besonders Ficus reagiert empfindlich. Zurückstellen oder Geduld: Nach der Umgewöhnung treibt er neu aus.' },
      { was: 'Kalte Füße', tun: 'Topf auf kaltem Steinboden oder Fensterbrett. Untersetzer aus Kork oder Filz darunter legen.' },
      { was: 'Trockenstress', tun: 'Einmal komplett ausgetrocknet? Dann wirft die Pflanze Blätter ab, um zu überleben.' }
    ]
  },
  {
    id: 'keine-blueten', emoji: '🌸', titel: 'Blüht nicht',
    ursachen: [
      { was: 'Zu wenig Licht', tun: 'Blühpflanzen brauchen deutlich mehr Licht als Grünpflanzen.' },
      { was: 'Falscher Dünger', tun: 'Stickstoffbetonter Dünger fördert Blätter statt Blüten. Blühpflanzendünger mit mehr Phosphor nehmen.' },
      { was: 'Ruhephase fehlt', tun: 'Viele Arten – Weihnachtskaktus, Orchidee, Amaryllis – brauchen im Winter einige Wochen kühler und trockener, um Blüten anzusetzen.' }
    ]
  }
];

/** Auffälligkeiten aus den eingetragenen Werten der Pflanze selbst. */
function pflanzenPruefung(p) {
  if (!p) return [];
  const hinweise = [];
  const art = artFinden(p.name) || artFinden(p.art);
  const iv = Number(p.intervall) || 0;

  if (art && iv) {
    if (iv <= art.iv / 2) {
      hinweise.push(`Du gießt alle ${iv} Tage – für ${art.n} sind etwa ${art.iv} Tage üblich. ` +
        `Zu häufiges Gießen ist die häufigste Ursache für gelbe Blätter und Trauermücken.`);
    } else if (iv >= art.iv * 2) {
      hinweise.push(`Du gießt alle ${iv} Tage – für ${art.n} sind etwa ${art.iv} Tage üblich. ` +
        `Das könnte zu trocken sein.`);
    }
    if (art.licht && p.licht && art.licht !== p.licht) {
      hinweise.push(`Notiert ist „${esc(p.licht)}“, üblich für ${art.n} wäre „${esc(art.licht)}“.`);
    }
  }

  if (!Number(p.duengerInt)) {
    hinweise.push('Für diese Pflanze ist kein Düngen eingetragen. In der Wachstumszeit ' +
      'braucht fast jede Zimmerpflanze alle zwei bis vier Wochen Nährstoffe.');
  }

  const t = tageBis(p);
  if (t < -7) hinweise.push(`Die Pflanze ist seit ${Math.abs(t)} Tagen überfällig.`);
  return hinweise;
}

/** Öffnet die Hilfe, optional im Bezug auf eine bestimmte Pflanze. */
function hilfeOeffnen(pid) {
  const p = pid ? DB.plants.find(x => x.id === pid) : null;
  const pruefung = pflanzenPruefung(p);

  $('#hilfe-titel').textContent = p ? 'Hilfe zu ' + p.name : 'Was ist los mit der Pflanze?';
  $('#hilfe-inhalt').innerHTML =
    (pruefung.length
      ? `<div class="section-title">Aufgefallen</div>` +
        pruefung.map(h => `<div class="card" style="border-left:3px solid var(--orange)">${h}</div>`).join('')
      : '') +
    `<div class="section-title">Was beobachtest du?</div>` +
    PROBLEME.map(pr => `
      <button class="problem" data-problem="${pr.id}">
        <span class="problem-emoji">${pr.emoji}</span>
        <span class="problem-titel">${esc(pr.titel)}</span>
        <span class="problem-pfeil">›</span>
      </button>`).join('');
  openSheet('#sheet-hilfe');
}

function problemZeigen(id) {
  const pr = PROBLEME.find(x => x.id === id);
  if (!pr) return;
  $('#hilfe-titel').textContent = pr.emoji + ' ' + pr.titel;
  $('#hilfe-inhalt').innerHTML =
    `<div class="section-title">Mögliche Ursachen</div>` +
    pr.ursachen.map(u => `
      <div class="card">
        <b style="display:block;margin-bottom:5px">${esc(u.was)}</b>
        <span style="color:var(--text-2);font-size:15px;line-height:1.45">${esc(u.tun)}</span>
      </div>`).join('') +
    `<button class="btn sec" data-problem-zurueck>Zurück zur Übersicht</button>`;
}

/* ---------- QR-Code fürs Etikett ----------
   Der Code enthält nur die Kennung der Pflanze in einer URL. Wer ihn scannt,
   landet in der App; ohne Anmeldung sieht er dort nichts. */
function qrZeigen(id) {
  const p = DB.plants.find(x => x.id === id);
  if (!p) return;
  $('#qr-inhalt').innerHTML = `
    <div class="grabber"></div>
    <h2>QR-Code für den Topf</h2>
    <div class="qr-karte">
      <img src="${API}/qr?p=${encodeURIComponent(p.id)}" alt="QR-Code für ${esc(p.name)}">
      <div class="qr-name">${esc(p.name)}</div>
      ${p.raum ? `<div class="qr-ort">${esc(p.raum)}</div>` : ''}
    </div>
    <p style="color:var(--text-2);font-size:14px;text-align:center;margin:0 0 6px">
      Ausdrucken, an den Topf kleben: Scannen öffnet diese Pflanze direkt.</p>
    <button class="btn sec" onclick="window.print()">Drucken</button>
    <button class="btn sec" data-close>Schließen</button>`;
  openSheet('#sheet-qr');
}

/** Beim Start prüfen, ob die App über einen QR-Code geöffnet wurde. */
function hashPruefen() {
  const treffer = /^#p=([A-Za-z0-9_-]+)$/.exec(location.hash || '');
  if (!treffer) return;
  const id = treffer[1];
  history.replaceState(null, '', location.pathname);
  const p = DB.plants.find(x => x.id === id);
  if (p) setTimeout(() => openDetail(id), 250);
  else toast('Diese Pflanze gibt es hier nicht');
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
  raumWahlFuellen(p ? (p.raum || '') : '');
  $('#f-intervall').value = p ? p.intervall : 7;
  $('#f-letzt').value = p ? (p.letzt || toISO(new Date())) : toISO(new Date());
  $('#f-menge').value = p ? (p.menge || '') : '';
  $('#f-winter').value = p ? String(p.winterFaktor || 0) : '0';
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
  $('#art-liste').innerHTML = ARTEN.map(a => `<option value="${esc(a.art || a.n)}">`).join('');
  $('#name-liste').innerHTML = ARTEN.map(a => `<option value="${esc(a.n)}">`).join('');
  $('#art-vorschlag').hidden = true;
  if (p) artVorschlagPruefen();
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
    raum: gewaehlterRaum(),
    emoji: editEmoji,
    foto: editFoto,
    intervall: Math.max(1, Number($('#f-intervall').value) || 7),
    letzt: $('#f-letzt').value || toISO(new Date()),
    menge: $('#f-menge').value.trim(),
    winterFaktor: Number($('#f-winter').value) || 0,
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
      <div class="field"><label>Gießintervall</label><span class="hint">alle ${p.intervall} Tage${
        winterAktiv() && effIntervall(p) !== Number(p.intervall) ? ' · Winter: ' + effIntervall(p) : ''}</span></div>
      ${p.winterFaktor ? `<div class="field"><label>Winterruhe</label><span class="hint">×${
        String(p.winterFaktor).replace('.', ',')}</span></div>` : ''}
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

    ${fotoGalerieHTML(p)}

    ${logs.length ? `<div class="section-title">Verlauf</div><div class="group">` + logs.map(l => `
      <div class="log-item"><span>${logText(l.typ)}</span>
      <span>${new Date(l.ts).toLocaleDateString('de-DE')}</span></div>`).join('') + `</div>` : ''}

    <button class="btn sec" data-hilfe="${p.id}">🩺 Problem mit dieser Pflanze?</button>
    <button class="btn sec" data-qr="${p.id}">🏷 QR-Code für den Topf</button>
    <button class="btn sec" data-edit="${p.id}">Bearbeiten</button>
    ${p.archiviert
      ? `<button class="btn sec" data-entarchiv="${p.id}">Zurück in die Liste</button>`
      : `<button class="btn sec" data-archiv="${p.id}">📦 Archivieren</button>`}
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
  $('#sortierung').onchange = e => { sortierung = e.target.value; renderPflanzen(); };
  $('#suchfeld').oninput = e => {
    suchText = e.target.value.trim().toLowerCase();
    $('#suche-weg').hidden = !suchText;
    renderPflanzen();
  };
  $('#suche-weg').onclick = () => {
    $('#suchfeld').value = '';
    suchText = '';
    $('#suche-weg').hidden = true;
    renderPflanzen();
    $('#suchfeld').focus();
  };
  $('#zeile-historie').onclick = zeigeHistorie;
  $('#zeile-hilfe').onclick = () => hilfeOeffnen(null);
  $('#zeile-statistik').onclick = () => { zeigeStatistik(); openSheet('#sheet-statistik'); };
  $('#f-raum-wahl').onchange = e => {
    const neu = e.target.value === '__neu';
    $('#feld-raum-neu').hidden = !neu;
    if (neu) setTimeout(() => $('#f-raum').focus(), 60);
  };
  $('#f-name').oninput = artVorschlagPruefen;
  $('#f-art').oninput = artVorschlagPruefen;
  $('#foto-neu-datei').onchange = e => {
    const pid = e.target.dataset.pid;
    if (e.target.files[0] && pid) fotoHinzufuegen(pid, e.target.files[0]);
    e.target.value = '';
  };
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
    const t = e.target.closest('[data-water],[data-dueng],[data-aufgabe],[data-alle-giessen],[data-open],[data-emoji],[data-raum],[data-edit],[data-del],[data-close],[data-farbe],[data-hg],[data-pemoji],[data-filter],[data-filter-weg],[data-foto],[data-foto-neu],[data-foto-weg],[data-runde],[data-runde-start],[data-hilfe],[data-problem],[data-problem-zurueck],[data-archiv],[data-entarchiv],[data-qr]');
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
    if (t.dataset.rundeStart !== undefined) { e.stopPropagation(); rundeStarten(); return; }
    if (t.dataset.runde) { e.stopPropagation(); rundeSchritt(t.dataset.runde); return; }
    if (t.dataset.hilfe) { e.stopPropagation(); closeSheets(); setTimeout(() => hilfeOeffnen(t.dataset.hilfe), 180); return; }
    if (t.dataset.problem) { e.stopPropagation(); problemZeigen(t.dataset.problem); return; }
    if (t.dataset.problemZurueck !== undefined) { e.stopPropagation(); hilfeOeffnen(null); return; }
    if (t.dataset.fotoWeg) { e.stopPropagation(); fotoLoeschen(t.dataset.fpid, t.dataset.fotoWeg); return; }
    if (t.dataset.foto) { e.stopPropagation(); fotoAnsehen(t.dataset.fpid, t.dataset.foto); return; }
    if (t.dataset.fotoNeu) {
      e.stopPropagation();
      const datei = $('#foto-neu-datei');
      datei.dataset.pid = t.dataset.fotoNeu;
      datei.click();
      return;
    }
    if (t.dataset.edit) { closeSheets(); setTimeout(() => openEdit(t.dataset.edit), 180); return; }
    if (t.dataset.del) { loeschePflanze(t.dataset.del); return; }
    if (t.dataset.qr) { e.stopPropagation(); qrZeigen(t.dataset.qr); return; }
    if (t.dataset.archiv) { archivieren(t.dataset.archiv, false); return; }
    if (t.dataset.entarchiv) { archivieren(t.dataset.entarchiv, true); return; }
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
hashPruefen();
starte();

/* Systemwechsel nur nachziehen, solange 'System' eingestellt ist */
window.matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => { if ((DB.settings.theme || 'auto') === 'auto') applyTheme(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW:', e));
  });
}
