/* ============================================================
   Grünzeug – Pflanzen gießen
   PWA mit localStorage (Prefix pg_) und Server-Sync

   © 2026 Torsten Michaely – Alle Rechte vorbehalten
   ============================================================ */
'use strict';

const VERSION = '3.11.0';

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

/* Die Bilder kommen aus IndexedDB und damit erst kurz nach dem Start.
   Einmalige Umstellung: Wer noch Bilder im localStorage hatte, bekommt sie
   beim ersten Speichern automatisch hinübergeschoben – `save` schreibt sie
   nach IndexedDB und legt den Datensatz ohne sie ab. */
function bilderStarten() {
  bilderNachladen().then(() => {
    // Sicherstellen, dass der schlanke Datensatz auch wirklich geschrieben ist
    if (localStorage.getItem(KEY) && (localStorage.getItem(KEY) || '').length > 1048576) {
      save(false);
    }
  });
}
/* Nur einmal melden statt bei jedem Klick – sonst hängt die Meldung dauerhaft
   auf dem Schirm, während man versucht, Platz zu schaffen. */
let speicherFehler = false;

function save(sync) {
  try {
    // Ohne Bilder: die liegen in IndexedDB, sonst ist der localStorage
    // nach ein paar Fotos voll und gar nichts lässt sich mehr speichern
    localStorage.setItem(KEY, JSON.stringify(datensatzOhneBilder()));
    speicherFehler = false;
  } catch (e) {
    if (!speicherFehler) {
      speicherFehler = true;
      toast(SYNC.user
        ? 'Auf diesem Gerät ist kein Platz mehr – deine Daten liegen aber auf dem Server'
        : 'Speicher voll (' + speicherText() + ') – unter Mehr → Daten steht, was Platz braucht',
        'Nachsehen', () => { tab('more'); renderMore(); });
    }
  }
  bilderSichern();
  if (sync !== false && SYNC.user) { SYNC.dirty = true; speichereSync(); planeSync(); }
}

/* ---------- Bildspeicher ----------
   Ein Handyfoto wiegt als Base64 100 bis 200 KB. Bei sechs Bildern je Pflanze
   plus Hauptbild ist der localStorage nach wenigen Pflanzen voll – Browser
   geben dort nur rund 5 MB pro Seite her. Dann schlägt jedes Speichern fehl,
   auch für Dinge, die nichts mit Fotos zu tun haben.

   Die Bilder liegen deshalb in IndexedDB, wo deutlich mehr Platz ist. Im
   localStorage steht nur noch der Rest: Pflanzen, Verlauf, Einstellungen.

   Wichtig: Für den Sync bleibt alles zusammen. Der Server bekommt weiterhin
   den vollständigen Datensatz mit Bildern, damit sie auf allen Geräten
   ankommen – nur der lokale Zwischenspeicher wird entlastet. */
const BILD_DB = 'gruenzeug-bilder';
const BILD_STORE = 'bilder';
let bildDb = null;
let bilderGeladen = false;

function bildDbOeffnen() {
  if (bildDb) return Promise.resolve(bildDb);
  return new Promise((fertig, fehler) => {
    let anfrage;
    try { anfrage = indexedDB.open(BILD_DB, 1); }
    catch (e) { fehler(e); return; }
    anfrage.onupgradeneeded = () => {
      const db = anfrage.result;
      if (!db.objectStoreNames.contains(BILD_STORE)) db.createObjectStore(BILD_STORE);
    };
    anfrage.onsuccess = () => { bildDb = anfrage.result; fertig(bildDb); };
    anfrage.onerror = () => fehler(anfrage.error);
  });
}

function bildSchreiben(schluessel, wert) {
  return bildDbOeffnen().then(db => new Promise((fertig, fehler) => {
    const t = db.transaction(BILD_STORE, 'readwrite');
    t.objectStore(BILD_STORE).put(wert, schluessel);
    t.oncomplete = fertig;
    t.onerror = () => fehler(t.error);
  }));
}

function bilderLesen() {
  return bildDbOeffnen().then(db => new Promise((fertig, fehler) => {
    const t = db.transaction(BILD_STORE, 'readonly');
    const store = t.objectStore(BILD_STORE);
    const schluessel = store.getAllKeys();
    const werte = store.getAll();
    t.oncomplete = () => {
      const karte = {};
      schluessel.result.forEach((k, i) => { karte[k] = werte.result[i]; });
      fertig(karte);
    };
    t.onerror = () => fehler(t.error);
  }));
}

function bildLoeschen(schluessel) {
  return bildDbOeffnen().then(db => new Promise(fertig => {
    const t = db.transaction(BILD_STORE, 'readwrite');
    t.objectStore(BILD_STORE).delete(schluessel);
    t.oncomplete = fertig;
    t.onerror = fertig;
  })).catch(() => {});
}

/** Bilder, zu denen es keine Pflanze mehr gibt.

    Bewusst nicht automatisch: Liefert der Server einmal einen älteren Stand,
    sähen die lokalen Bilder für einen Moment verwaist aus – und wären weg.
    Aufgeräumt wird deshalb nur auf Knopfdruck. */
function verwaisteBilder() {
  if (!('indexedDB' in window)) return Promise.resolve([]);
  const gebraucht = new Set(Object.keys(bilderSammeln()));
  // Auch Bilder von Pflanzen, deren Daten gerade nicht geladen sind, zählen
  for (const p of DB.plants) {
    gebraucht.add('p:' + p.id);
    for (const f of (Array.isArray(p.fotos) ? p.fotos : [])) gebraucht.add('g:' + f.id);
  }
  gebraucht.add('s:avatar');
  gebraucht.add('s:hintergrund');
  return bilderLesen()
    .then(karte => Object.keys(karte).filter(k => !gebraucht.has(k)))
    .catch(() => []);
}

function verwaisteLoeschen() {
  return verwaisteBilder().then(liste => {
    if (!liste.length) { toast('Nichts aufzuräumen'); return; }
    return Promise.all(liste.map(bildLoeschen)).then(() => {
      renderMore();
      toast(liste.length === 1 ? 'Ein altes Bild entfernt'
                               : liste.length + ' alte Bilder entfernt');
    });
  });
}

/** Alle Bilder aus dem Datensatz, als Schlüssel-Wert-Paare. */
function bilderSammeln() {
  const raus = {};
  for (const p of DB.plants) {
    if (p.foto) raus['p:' + p.id] = p.foto;
    for (const f of (Array.isArray(p.fotos) ? p.fotos : [])) {
      if (f.bild) raus['g:' + f.id] = f.bild;
    }
  }
  if (DB.settings.avatarFoto) raus['s:avatar'] = DB.settings.avatarFoto;
  if (DB.settings.hintergrundFoto) raus['s:hintergrund'] = DB.settings.hintergrundFoto;
  return raus;
}

/** Kopie des Datensatzes ohne Bilddaten – das kommt in den localStorage. */
function datensatzOhneBilder() {
  return {
    v: DB.v,
    plants: DB.plants.map(p => {
      const kopie = Object.assign({}, p);
      if (kopie.foto) kopie.foto = '';
      if (Array.isArray(kopie.fotos)) {
        kopie.fotos = kopie.fotos.map(f => ({ id: f.id, ts: f.ts, bild: '' }));
      }
      return kopie;
    }),
    logs: DB.logs,
    settings: Object.assign({}, DB.settings, { avatarFoto: null, hintergrundFoto: null })
  };
}

/** Schreibt die Bilder weg. Läuft nebenher, das Speichern wartet nicht darauf. */
function bilderSichern() {
  if (!('indexedDB' in window)) return;
  const bilder = bilderSammeln();
  Promise.all(Object.entries(bilder).map(([k, v]) => bildSchreiben(k, v)))
    .catch(e => console.warn('Bilder konnten nicht gesichert werden:', e));
}

/** Setzt die Bilder nach dem Start wieder in den Datensatz ein. */
function bilderNachladen() {
  if (!('indexedDB' in window)) { bilderGeladen = true; return Promise.resolve(); }
  return bilderLesen().then(karte => {
    let gefunden = 0;
    for (const p of DB.plants) {
      if (!p.foto && karte['p:' + p.id]) { p.foto = karte['p:' + p.id]; gefunden++; }
      for (const f of (Array.isArray(p.fotos) ? p.fotos : [])) {
        if (!f.bild && karte['g:' + f.id]) { f.bild = karte['g:' + f.id]; gefunden++; }
      }
    }
    if (!DB.settings.avatarFoto && karte['s:avatar']) DB.settings.avatarFoto = karte['s:avatar'];
    if (!DB.settings.hintergrundFoto && karte['s:hintergrund']) {
      DB.settings.hintergrundFoto = karte['s:hintergrund'];
    }
    bilderGeladen = true;
    if (gefunden || karte['s:avatar'] || karte['s:hintergrund']) {
      applyPersonalisierung();
      renderAll();
    }
  }).catch(e => {
    // bilderGeladen bleibt bewusst false: Wer nicht weiß, welche Bilder es
    // gibt, darf keine löschen.
    console.warn('Bilder nicht lesbar:', e);
  });
}

/** Wie viel Platz die Bilder belegen. */
function bilderGroesse() {
  if (!('indexedDB' in window)) return Promise.resolve({ anzahl: 0, bytes: 0 });
  return bilderLesen().then(karte => {
    const werte = Object.values(karte);
    return { anzahl: werte.length,
             bytes: werte.reduce((n, v) => n + String(v || '').length, 0) };
  }).catch(() => ({ anzahl: 0, bytes: 0 }));
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
  // Ein Glas Wasser kippt im Winter genauso schnell wie im Sommer
  if (istAbleger(p)) return Math.max(1, Number(p.intervall) || 5);
  // Eigener Winterwert der Pflanze schlägt die allgemeine Einstellung
  const eigen = Number(p.winterFaktor) || 0;
  const raum = raumFaktor(p);

  /* Ohne Temperaturangabe bleibt es beim pauschalen Winter-Modus.
     Mit Angabe ersetzt sie ihn – das ist der ganze Sinn der Sache: Ein
     geheiztes Wohnzimmer mit 22 Grad im Januar braucht keine Verlängerung.
     Der artspezifische Winterwert bleibt trotzdem gültig: Ein Kaktus will
     trocken stehen, auch wenn sein Zimmer warm ist. */
  const f = raum === null
    ? (winterAktiv() ? (eigen || 1.5) : 1)
    : (winterAktiv() ? Math.max(raum, eigen || 1) : raum);
  // Das Wetter wirkt nur verkürzend (Hitze); verlängern macht der Winter-Modus.
  // Der Zustand wirkt nur verlängernd: Wer bei kranken Wurzeln im gewohnten
  // Takt weitergießt, macht es schlimmer.
  return Math.max(1, Math.round((Number(p.intervall) || 7)
    * f * wetterFaktor(p) * zustandFaktor(p)));
}
/** Tage bis zum nächsten Gießen nach dem reinen Rhythmus. */
function tageBisRhythmus(p) {
  if (!p.letzt) return 0;
  const naechste = new Date(fromISO(p.letzt).getTime() + effIntervall(p) * 86400000);
  naechste.setHours(0, 0, 0, 0);
  return tageDiff(heute0(), naechste);
}

/** Tage bis zum nächsten Gießen. Negativ = überfällig.

    Ein Aufschub schiebt nur die Fälligkeit nach hinten, nicht den Rhythmus:
    `letzt` bleibt unangetastet, damit die Statistik den echten Abstand sieht. */
function tageBis(p) {
  const normal = tageBisRhythmus(p);
  const aufschub = aufschubTageBis(p);
  return aufschub !== null ? Math.max(normal, aufschub) : normal;
}

/** Steht die Pflanze nur wegen eines Aufschubs nicht an? */
function istAufgeschoben(p) {
  const aufschub = aufschubTageBis(p);
  return aufschub !== null && aufschub > tageBisRhythmus(p);
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
  if (istAufgeschoben(p)) {
    const auf = aufschubTageBis(p);
    return auf === 1 ? 'Verschoben auf morgen' : 'Verschoben, in ' + auf + ' Tagen';
  }
  const t = tageBis(p);
  if (t < 0) return Math.abs(t) === 1 ? '1 Tag überfällig' : Math.abs(t) + ' Tage überfällig';
  if (t === 0) return wasserWorte(p).heute;
  if (t === 1) return 'Morgen';
  return 'in ' + t + ' Tagen';
}
/** Meldung mit optionalen Aktionen.
    Entweder toast(text, 'Knopf', fn) oder toast(text, [{text, fn}, …]). */
function toast(msg, a1, a2) {
  const el = $('#toast');
  el.textContent = msg;
  const aktionen = Array.isArray(a1) ? a1
    : (a1 && a2) ? [{ text: a1, fn: a2 }] : [];

  for (const a of aktionen) {
    const knopf = document.createElement('button');
    knopf.className = 'toast-aktion';
    knopf.textContent = a.text;
    knopf.onclick = () => { el.classList.remove('show'); a.fn(); };
    el.appendChild(knopf);
  }
  el.classList.add('show');
  clearTimeout(toast._t);
  // Mit Aktion länger stehen lassen, sonst ist sie nicht zu treffen
  toast._t = setTimeout(() => el.classList.remove('show'), aktionen.length ? 6000 : 2200);
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
  // Bilder gehören zur Pflanze und gehen mit ihr
  bildLoeschen('p:' + id);
  for (const f of fotosVon(p)) bildLoeschen('g:' + f.id);
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
  gruen:   { name: 'Blattgrün', dunkel: '#5FBF7F', hell: '#2F7D4F', auf: '#FFFFFF' },
  salbei:  { name: 'Salbei',    dunkel: '#8FBFA0', hell: '#5E8C6A', auf: '#FFFFFF' },
  oliv:    { name: 'Oliv',      dunkel: '#A8B96A', hell: '#6E7F32', auf: '#FFFFFF' },
  terra:   { name: 'Terrakotta',dunkel: '#D4795E', hell: '#B0563A', auf: '#FFFFFF' },
  ocker:   { name: 'Ocker',     dunkel: '#D9A047', hell: '#B07C21', auf: '#FFFFFF' },
  rost:    { name: 'Rost',      dunkel: '#C96A4B', hell: '#A44A2C', auf: '#FFFFFF' },
  petrol:  { name: 'Petrol',    dunkel: '#4FA3A8', hell: '#2C7076', auf: '#FFFFFF' },
  pflaume: { name: 'Pflaume',   dunkel: '#B08BC4', hell: '#77518C', auf: '#FFFFFF' }
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
/* Die Farbnamen haben sich mit v2.0.0 geändert. Wer noch einen alten Wert
   gespeichert hat, bekommt die nächstliegende neue Farbe. */
const AKZENT_ALT = { blau: 'petrol', tuerkis: 'petrol', violett: 'pflaume',
                     pink: 'pflaume', rot: 'rost', orange: 'ocker', gelb: 'ocker' };

function applyPersonalisierung() {
  const st = DB.settings;
  if (AKZENT_ALT[st.akzent]) { st.akzent = AKZENT_ALT[st.akzent]; save(false); }
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

/* ---------- Bilder ----------
   Fotos landen als Base64 im localStorage und werden mitsynchronisiert.
   Daraus folgt der Spagat: groß genug, damit auf Handydisplays nichts
   ausfranst, klein genug, dass der Speicher reicht.

   Ein Handy hat zwei bis drei Gerätepixel je CSS-Pixel. Ein Bild, das über
   die volle Breite läuft, braucht deshalb ein Vielfaches der 390 Punkte,
   die das Layout dafür vorsieht – sonst wird es hochgerechnet und wirkt
   grob. Bei mehr als 2,5 hört der sichtbare Gewinn auf, dort deckeln wir. */
const PIXELDICHTE = Math.min(window.devicePixelRatio || 1, 2.5);

/** Kantenlänge für ein Bild, das über breiteCss Punkte dargestellt wird. */
function zielKante(breiteCss, obergrenze) {
  return Math.min(Math.round(breiteCss * PIXELDICHTE), obergrenze);
}

/** Zeichnet die Quelle auf eine Leinwand der gewünschten Größe. */
function aufLeinwand(quelle, breite, hoehe) {
  const c = document.createElement('canvas');
  c.width = breite;
  c.height = hoehe;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(quelle, 0, 0, breite, hoehe);
  return c;
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
        const zielB = Math.max(1, Math.round(bild.width * f));
        const zielH = Math.max(1, Math.round(bild.height * f));

        // In Halbierungsschritten verkleinern. Wer ein 4000er Foto in einem
        // Rutsch auf 1000 zieht, verwirft drei von vier Pixeln ungefragt –
        // feine Blattstrukturen werden dabei zu Krisseln.
        let quelle = bild, b = bild.width, h = bild.height;
        while (b > zielB * 2) {
          b = Math.round(b / 2);
          h = Math.round(h / 2);
          quelle = aufLeinwand(quelle, b, h);
        }
        fertig(aufLeinwand(quelle, zielB, zielH).toDataURL('image/jpeg', guete));
      };
      bild.src = e.target.result;
    };
    leser.readAsDataURL(datei);
  });
}

/** Belegter Platz im localStorage in Byte (grob, zwei Byte je Zeichen). */
function speicherBytes() {
  try { return (localStorage.getItem(KEY) || '').length; }
  catch (e) { return 0; }
}

function byteText(n) {
  const mb = n / 1048576;
  return mb < 1 ? Math.round(n / 1024) + ' KB' : mb.toFixed(1) + ' MB';
}

function speicherText() { return byteText(speicherBytes()); }

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
      DB.settings.avatarFoto = await bildVerkleinern(e.target.files[0], zielKante(130, 340), 0.82);
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
      DB.settings.hintergrundFoto = await bildVerkleinern(
        e.target.files[0], zielKante(Math.max(screen.width, 800), 1600), 0.7);
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
  { v: '3.11.0', datum: '01.09.2026', punkte: [
    'Wochenrückblick sonntags um 18 Uhr: was gegossen und erledigt wurde – und was liegengeblieben ist.',
    'Abschaltbar unter Mehr → Erinnerungen.',
    'Gab es nichts zu berichten, kommt auch nichts.'
  ]},
  { v: '3.10.0', datum: '01.09.2026', punkte: [
    'Etikettenbogen: alle QR-Codes auf einer Seite, drei nebeneinander, zum Ausschneiden.',
    'Auswahl je Pflanze oder ganzer Standort, wahlweise große Etiketten.',
    'Auf dem Etikett stehen Name, Standort, Wassermenge und Intervall – das reicht oft schon, ohne zu scannen.'
  ]},
  { v: '3.9.0', datum: '01.09.2026', punkte: [
    'Der Plan hat jetzt zwei Ansichten: die nächsten 14 Tage wie bisher, und das Gartenjahr.',
    'Zwölf Monate mit dem, was jeweils ansteht – Rückschnitt im Februar, Umtopfen ab März, raus im Mai, Winterquartier im Oktober, Spinnmilbenzeit ab November.',
    'Zu jedem Monat listet die App auf, welche deiner Pflanzen dann dran sind.',
    'Der laufende Monat steht oben und ist aufgeklappt.'
  ]},
  { v: '3.8.1', datum: '30.08.2026', punkte: [
    'Behoben: Die App aktualisierte sich beim Öffnen nicht. Lag eine neue Fassung schon bereit, gab es nur ein Banner – wer das übersah, blieb dauerhaft auf der alten.',
    'Beim Öffnen wird eine wartende Fassung jetzt ohne Nachfrage übernommen. Nur mitten in der Sitzung wird noch gefragt.',
    'Auch der Server cachte die Startseite, wenn sie ohne „/index.html“ aufgerufen wurde.'
  ]},
  { v: '3.8.0', datum: '30.08.2026', punkte: [
    'Lichtmessung am Standort, auf drei Wegen: Schattenprobe, Schätzung aus der Fensterlage, und Kameramessung wo das Gerät die Belichtungswerte herausgibt.',
    'Das Ergebnis wird mit dem Bedarf der Art verglichen: passt, knapp oder zu dunkel.',
    'Auf dem iPhone gibt Safari die Belichtungswerte nicht heraus – dort bleiben Schattenprobe und Fensterrechner, die ohnehin verlässlicher sind.'
  ]},
  { v: '3.7.0', datum: '30.08.2026', punkte: [
    'Pflanzen lassen sich als „im Sommer draußen“ oder „ganzjährig draußen“ kennzeichnen, mit vier Kältestufen von sehr empfindlich bis frosthart.',
    'Sinkt die Nachttemperatur laut Vorhersage unter die Grenze, warnt die App – auf der Startseite und per Push, nachmittags statt morgens.',
    'Eine verpasste Frostnacht kostet die Pflanze. Die Wetterdaten lagen ohnehin auf dem Server.',
    'Im Frühjahr und Herbst kommt der Hinweis, wann sie raus kann und wann sie rein sollte.'
  ]},
  { v: '3.6.0', datum: '30.08.2026', punkte: [
    'Die Server-Sicherungen lassen sich jetzt aus der App ansehen und von Hand anstoßen – vorher ging das nur per SSH.',
    'Unter Mehr → Daten steht, welche Sicherungen es gibt, von wann und wie groß.'
  ]},
  { v: '3.5.0', datum: '30.08.2026', punkte: [
    '„Alle Daten löschen“ zeigt jetzt, was genau verschwindet, und der Knopf wird erst nach einer bewussten Bestätigung scharf.',
    'Der alte Hinweis „lässt sich nicht rückgängig machen“ stimmte nicht mehr – über frühere Stände geht es sehr wohl. Jetzt steht der Weg zurück dabei.',
    'Direkt daneben ein Knopf zum Sichern, bevor gelöscht wird.',
    'Die Fotos werden mitgelöscht; sie blieben vorher als Datenmüll liegen.'
  ]},
  { v: '3.4.2', datum: '30.08.2026', punkte: [
    'Der Export wartet jetzt auf die Bilder – sonst konnte kurz nach dem Start ein Backup ohne Fotos herauskommen, ohne dass man es merkt.',
    'Nach dem Export steht in der Meldung, wie groß die Datei ist und wie viele Bilder drin sind.'
  ]},
  { v: '3.4.1', datum: '30.08.2026', punkte: [
    'Behoben: „Speichern fehlgeschlagen“, obwohl alles gespeichert schien. Der Browserspeicher war durch die Fotos voll.',
    'Fotos liegen jetzt in IndexedDB statt im localStorage – dort ist deutlich mehr Platz, und der Datensatz bleibt klein.',
    'Unter Mehr → Daten steht, wie viel Platz Daten und Bilder belegen.'
  ]},
  { v: '3.4.0', datum: '30.08.2026', punkte: [
    'Temperaturbereiche je Standort, getrennt nach Sommer und Winter – das Schlafzimmer hat im Januar eben keine 20 Grad.',
    'Wo Werte hinterlegt sind, ersetzen sie den pauschalen Winter-Modus: von ×0,75 bei über 27 Grad bis ×2,4 unter 8 Grad.',
    'Unter 15 Grad wird nicht mehr gedüngt – da wächst nichts, was die Nährstoffe verbrauchen könnte.',
    'Vorlagen für 14 typische Räume, vom Bad bis zum Wintergarten.',
    'Neuer Filter „Braucht Hilfe“ in der Pflanzenliste, plus ein Hinweis auf der Startseite.'
  ]},
  { v: '3.3.0', datum: '30.08.2026', punkte: [
    'Zustand je Pflanze – und die App richtet sich danach: Bei „geht ihr schlecht“ wird das Gießintervall um 40 % verlängert und das Düngen pausiert.',
    'Die Karte sagt jedes Mal dazu, was sich dadurch ändert und warum.',
    'Peperomien fehlten ganz in der Artenliste. Ohne Treffer blieb es beim Standardwert – für dickfleischige Blätter viel zu häufig.',
    'Vier Peperomia-Arten ergänzt, alle mit 12 bis 14 Tagen statt wöchentlich.'
  ]},
  { v: '3.2.0', datum: '30.08.2026', punkte: [
    'Lebensphase je Pflanze: Steckling, Jungpflanze oder ausgewachsen.',
    'Stecklinge kennen vier Bewurzelungsmethoden – Wasserglas, Anzuchterde, Sphagnum-Moos, Perlite – mit der jeweils üblichen Dauer und einem Fortschritt.',
    'Kein Dünger bis zur Bewurzelung, danach halbe Dosis: Die App blendet die Felder entsprechend aus und rechnet mit.',
    'Zweite Anleitung: Stecklinge schneiden und bewurzeln, elf Schritte.'
  ]},
  { v: '3.1.0', datum: '30.08.2026', punkte: [
    'Geführte Anleitung zum Umtopfen: zehn Schritte, immer nur einer auf dem Schirm.',
    'Vorweg Zeitpunkt, Anzeichen und Material – und zu jedem Schritt der Fehler, den man dabei macht.',
    'Am Ende lässt sich „umgetopft“ direkt eintragen.',
    'Erreichbar aus der Pflanze heraus und unter Mehr → Anleitungen.'
  ]},
  { v: '3.0.0', datum: '30.08.2026', punkte: [
    'Eigene Pflegeaufgaben je Pflanze – Zurückschneiden, Schädlingskontrolle, Abduschen, was auch immer. Mit eigenem Symbol, Intervall in Tagen oder Monaten und Push-Erinnerung.',
    'Zehn Vorlagen für den schnellen Start.',
    'Notizen mit Datum im Verlauf, und zu jedem Eintrag lässt sich ein Kommentar schreiben.',
    'Die Detailansicht ist aufgeräumt: Pflege, Fotos, Verlauf und die selteneren Knöpfe klappen auf und zu.'
  ]},
  { v: '2.8.0', datum: '30.08.2026', punkte: [
    'Fällige Pflanzen lassen sich um eine frei wählbare Anzahl Tage verschieben – zwischen „morgen nochmal schauen“ und dem vollen Intervall fehlte bisher alles.',
    'Der Rhythmus bleibt dabei unangetastet: Wird danach gegossen, zählt der tatsächliche Abstand.',
    'Auch in der Gieß-Runde: „Noch nicht – später erinnern“ statt nur Überspringen.',
    'Die zuletzt gewählte Zahl wird beim nächsten Mal vorgeschlagen.'
  ]},
  { v: '2.7.0', datum: '30.08.2026', punkte: [
    'Jede Pflanze bekommt Merkmale ihres Platzes: Heizung, Klimaanlage, Mittagssonne, Zugluft, kalter Boden, feuchter Raum, wenig Licht.',
    'Wetter vom eigenen Server: läuft die Heizung, ist es zu heiß, droht Frost, ist es zu trüb.',
    'Bei Hitze werden alle Pflanzen 20 % früher fällig, am Sonnenfenster 30 %.',
    'In der Problem-Hilfe stehen die Ursachen oben, die zur Lage passen – im Januar über der Heizung ist „trockene Luft“ meist schon die Antwort.'
  ]},
  { v: '2.6.0', datum: '30.08.2026', punkte: [
    'Steht die Ursache fest, lässt sie sich jetzt auswählen: „Das ist es“ öffnet den passenden Behandlungsplan.',
    'Der Plan hat Schritte mit Abstand in Tagen und läuft als eigene Aufgabe mit – in der Tagesansicht, in der Pflanze und per Push.',
    'Gerade bei Schädlingen entscheidet die Wiederholung: eine einzelne Behandlung erwischt nie alle Eier.',
    '26 Pläne zu den zehn Symptomen, vom Tauchbad bis zur dreifachen Spinnmilben-Behandlung.'
  ]},
  { v: '2.5.1', datum: '30.08.2026', punkte: [
    'Die Vorschläge für Name und Art stehen jetzt alphabetisch, vorher in der Reihenfolge, in der sie eingepflegt wurden.'
  ]},
  { v: '2.5.0', datum: '30.08.2026', punkte: [
    'Die App meldet jetzt selbst, wenn eine neue Fassung bereitliegt.',
    'Semi-Hydrokultur als eigene Haltung – Blähton, Pon, Seramis.',
    'Dort wird bei jeder Wassergabe gedüngt, ein eigenes Düngeintervall entfällt.',
    'Neue Aufgabe „Substrat spülen“ gegen Salzablagerungen, voreingestellt alle sechs Wochen.',
    'Fotos werden deutlich höher aufgelöst gespeichert – auf Handydisplays wirkten sie vorher grob.'
  ]},
  { v: '2.4.0', datum: '30.08.2026', punkte: [
    'Zwölf Kakteen ergänzt, getrennt nach Wüsten- und Regenwaldarten – die brauchen sehr unterschiedlich viel Wasser.',
    'Die Artenliste kennt jetzt die passende Winterruhe und trägt sie beim Übernehmen mit ein.'
  ]},
  { v: '2.3.1', datum: '30.08.2026', punkte: [
    '„war gestern" gibt es jetzt auch nach „Alle gießen“ und nach einer Gieß-Runde.'
  ]},
  { v: '2.3.0', datum: '30.08.2026', punkte: [
    'Erledigtes nachtragen: „war gestern" in der Meldung, oder ein beliebiges Datum in der Aufgabenkarte.',
    'Der Verlaufseintrag bekommt den richtigen Zeitpunkt, damit die Pünktlichkeit stimmt.'
  ]},
  { v: '2.2.0', datum: '30.08.2026', punkte: [
    'Ableger im Wasser: eigene Haltung mit Erinnerung ans Wasserwechseln statt ans Gießen.',
    'Zeigt, wie lange der Steckling schon im Glas steht.',
    'Ist er bewurzelt, macht ein Knopf daraus eine eingetopfte Pflanze mit passendem Gießintervall.'
  ]},
  { v: '2.1.1', datum: '30.08.2026', punkte: [
    'Behoben: Pflanzen mit Verlaufseinträgen ließen sich seit v2.0.0 nicht mehr öffnen.'
  ]},
  { v: '2.1.0', datum: '30.08.2026', punkte: [
    'Mehrere Pflanzen in einem Topf: Der Topf bleibt eine Einheit, die Arten darin stehen als Mitbewohner.',
    'Die App prüft, ob die Arten zusammenpassen, und schlägt das Intervall der durstigsten vor.',
    'Topf-Durchmesser eingebbar – daraus wird die Wassermenge geschätzt.'
  ]},
  { v: '2.0.1', datum: '30.08.2026', punkte: [
    'Heller Modus deutlich grüner – vorher war der Farbton fast weiß und der Unterschied kaum zu sehen.',
    'Pflanzenliste zieht mit: Status farbig, Abhak-Kreis direkt auf der Kachel.'
  ]},
  { v: '2.0.0', datum: '30.08.2026', punkte: [
    'Neue Farbwelt: warme Grün- und Erdtöne statt Systemgrau.',
    'Detailansicht neu: großes Bild, Fortschrittsringe je Aufgabe, Aufgabenkarte zum Abhaken.',
    'Akzentfarben passen zur neuen Palette: Blattgrün, Salbei, Oliv, Terrakotta, Ocker, Rost, Petrol, Pflaume.'
  ]},
  { v: '1.18.0', datum: '30.08.2026', punkte: [
    'Frühere Stände: Der Server hebt die letzten zwanzig Datenstände auf, wiederherstellbar unter Mehr.',
    'Gesichert wird stündlich und immer dann, wenn Pflanzen verschwinden.',
    'Zusätzlich sichert der Server die Datenbank täglich, sieben Tage lang.'
  ]},
  { v: '1.17.1', datum: '30.08.2026', punkte: [
    'Urheberrechtshinweis in der App, auf der Anmeldeseite und im Quelltext.'
  ]},
  { v: '1.17.0', datum: '29.08.2026', punkte: [
    'Erinnerungen jetzt auch für Düngen, Umtopfen und Schneiden, nicht nur fürs Gießen.',
    'Behoben: Der Versand hat archivierte Pflanzen mitgezählt und die Winterruhe je Pflanze ignoriert.'
  ]},
  { v: '1.16.3', datum: '29.08.2026', punkte: [
    'Archiv leichter zu finden: Chip direkt hinter "Alle", zusätzlich eine Zeile unter Mehr.'
  ]},
  { v: '1.16.2', datum: '29.08.2026', punkte: [
    'Behoben: QR-Code und Foto-Großansicht öffneten sich unsichtbar hinter der Detailansicht.'
  ]},
  { v: '1.16.1', datum: '29.08.2026', punkte: [
    'Behoben: Ein gescannter QR-Code fand die Pflanze nicht, wenn das Gerät die Daten noch nicht geladen hatte.'
  ]},
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
  save(false);          // schreibt auch die Bilder vom Server nach IndexedDB
  // Hatte der Server keine Bilder – etwa weil das andere Gerät sie nie
  // hochgeladen hat –, kommen die lokalen wieder rein. Ergänzt nur, wo fehlt.
  bilderNachladen();
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
    hashOeffnen(true);
    pushZustandPruefen();
  } catch (e) {
    // Kein Netz oder kein Server: wer die App schon nutzt, arbeitet weiter
    SYNC.status = SYNC.user ? 'offline' : 'lokal';
    if (SYNC.user || SYNC.lokalOk || DB.plants.length) versteckeLogin();
    else zeigeLogin();
    hashOeffnen(true);
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

  $('#frost-warnung').innerHTML = frostKarteHTML();

  const sorgenkinder = liste.filter(p => zustandVon(p) !== 'gut' || behandlungVon(p));
  const sbox = $('#sorgen-hinweis');
  sbox.hidden = !sorgenkinder.length;
  if (sorgenkinder.length) {
    sbox.innerHTML = `<span class="wetter-emoji">🩺</span><span>${
      sorgenkinder.length === 1
        ? esc(sorgenkinder[0].name) + ' braucht gerade Aufmerksamkeit.'
        : sorgenkinder.length + ' Pflanzen brauchen gerade Aufmerksamkeit.'}</span>
      <button class="aktion" data-sorgen>Ansehen</button>`;
  }

  const wz = wetterZeile();
  const wbox = $('#wetter-hinweis');
  wbox.hidden = !wz;
  if (wz) wbox.innerHTML = `<span class="wetter-emoji">${wz.emoji}</span><span>${wz.text}</span>`;

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

  if (!faellig.length && !bald.length && !faelligeAufgaben().length
      && !faelligeBehandlungen().length) {
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
  const behandlungen = faelligeBehandlungen();
  if (behandlungen.length) {
    html += `<div class="section-title">Behandlung</div>`;
    html += behandlungen.map(({ pflanze, offen }) => `
      <div class="plant" data-open="${pflanze.id}">
        ${avatarHTML(pflanze)}
        <div class="info">
          <div class="nm">${esc(pflanze.name)}</div>
          <div class="meta">${esc(behandlungVon(pflanze).ursache.was)} · ${
            offen.length === 1 ? 'ein Schritt' : offen.length + ' Schritte'} offen</div>
        </div>
        <button class="water-btn due" data-beh-schritt="${offen[0].i}" data-pid="${pflanze.id}"
          title="${esc(offen[0].text)}">${behandlungVon(pflanze).problem.emoji}</button>
      </div>`).join('');
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
      <div class="meta">${zustandVon(p) !== 'gut'
        ? ZUSTAENDE.find(x => x.k === zustandVon(p)).emoji + ' ' : ''}${
        statusText(p)}${p.raum ? ' · ' + esc(p.raum) : ''}${p.menge ? ' · ' + esc(p.menge) : ''}</div>
      <div class="bar"><i class="${st === 'over' ? 'over' : st === 'soon' ? 'soon' : ''}" style="width:${pct}%"></i></div>
    </div>
    <button class="water-btn ${st === 'over' ? 'over' : st === 'due' ? 'due' : ''}" data-water="${p.id}" title="Gegossen">💧</button>
  </div>`;
}

/** Durchsucht Name, Art, Standort und Notiz. */
function passtZurSuche(p) {
  if (!suchText) return true;
  const heuhaufen = [p.name, p.art, p.raum, p.notiz, p.licht, p.menge]
    .concat(mitbewohner(p).flatMap(m => [m.name, m.art]))
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
  const sorgenAn = raumFilter === '__sorgen';
  // Alles, was Aufmerksamkeit braucht: schlechter Zustand oder laufende Behandlung
  const sorgen = aktive().filter(p => zustandVon(p) !== 'gut' || behandlungVon(p));
  if (sorgenAn && !sorgen.length) raumFilter = 'alle';
  const grundmenge = archivAn ? DB.plants.filter(p => p.archiviert) : aktive();
  const raeume = Array.from(new Set(aktive().map(p => p.raum).filter(Boolean))).sort();

  $('#pflanzen-sub').textContent = archivAn
    ? archivZahl + (archivZahl === 1 ? ' archivierte Pflanze' : ' archivierte Pflanzen')
    : aktive().length + (aktive().length === 1 ? ' Pflanze' : ' Pflanzen');

  // Chips: Alle, die Standorte, und das Archiv wenn es etwas enthält
  $('#raum-chips').hidden = !!suchText;
  const chips = [`<button class="chip ${raumFilter === 'alle' ? 'on' : ''}" data-raum="alle">Alle</button>`];
  // Direkt hinter "Alle", nicht hinter allen Standorten: dort findet man es sonst nicht
  if (sorgen.length) {
    chips.push(`<button class="chip warn ${raumFilter === '__sorgen' ? 'on' : ''}" data-raum="__sorgen">
      🩺 Braucht Hilfe (${sorgen.length})</button>`);
  }
  if (archivZahl) {
    chips.push(`<button class="chip ${archivAn ? 'on' : ''}" data-raum="__archiv">📦 Archiv (${archivZahl})</button>`);
  }
  chips.push(...raeume.map(r => `<button class="chip ${raumFilter === r ? 'on' : ''}" data-raum="${esc(r)}">${esc(r)}</button>`));
  $('#raum-chips').innerHTML = (raeume.length || archivZahl) ? chips.join('') : '';

  let liste = grundmenge
    .filter(p => archivAn || raumFilter === 'alle'
      || (raumFilter === '__sorgen' ? sorgen.includes(p) : p.raum === raumFilter))
    .filter(passtZurSuche);

  if (suchText) {
    $('#pflanzen-sub').textContent = liste.length + ' Treffer';
  }

  const grid = $('#pflanzen-grid');
  if (!liste.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">${suchText ? '🔍' : archivAn ? '📦' : '🪴'}</div>
      <p>${suchText ? 'Nichts gefunden.' : archivAn ? 'Das Archiv ist leer.'
        : raumFilter === '__sorgen' ? 'Allen geht es gut.' : 'Keine Pflanzen in dieser Ansicht.'}</p>
      ${suchText ? '<p>Andere Schreibweise versuchen?</p>' : ''}</div>`;
    return;
  }

  // In der Archivansicht erklären, was archivierte Pflanzen bedeuten
  const kopfzeile = archivAn
    ? `<div class="archiv-hinweis" style="grid-column:1/-1">Archivierte Pflanzen zählen nirgends mit.
       Antippen und „Zurück in die Liste“ holt sie wieder.</div>`
    : raumFilter === '__sorgen'
      ? `<div class="archiv-hinweis" style="grid-column:1/-1">Pflanzen, bei denen du einen
         schlechteren Zustand eingetragen hast oder bei denen eine Behandlung läuft.</div>`
      : '';

  const kachel = p => {
    const st = p.archiviert ? '' : statusOf(p);
    const faellig = !p.archiviert && tageBis(p) <= 0;
    return `
    <div class="tile ${p.archiviert ? 'archiviert' : ''}" data-open="${p.id}">
      ${avatarHTML(p)}
      <div class="nm">${esc(p.name)}</div>
      <div class="meta ${st}">${p.archiviert ? 'archiviert' : statusText(p)}</div>
      ${faellig ? `<button class="tile-kreis ${st}" data-water="${p.id}"
        title="Gegossen"></button>` : ''}
    </div>`;
  };

  // Nach Standort wird gruppiert, sonst einfach sortiert
  if (sortierung === 'raum' && !archivAn) {
    const gruppen = {};
    for (const p of liste) (gruppen[p.raum || 'Ohne Standort'] ||= []).push(p);
    grid.innerHTML = kopfzeile + Object.keys(gruppen).sort((a, b) => a.localeCompare(b, 'de')).map(raum =>
      `<div class="gruppe-titel">${esc(raum)}</div>` +
      gruppen[raum].sort((a, b) => a.name.localeCompare(b.name, 'de')).map(kachel).join('')
    ).join('');
    return;
  }

  liste = liste.slice().sort(sortierung === 'name' || archivAn
    ? (a, b) => a.name.localeCompare(b.name, 'de')
    : (a, b) => tageBis(a) - tageBis(b));
  grid.innerHTML = kopfzeile + liste.map(kachel).join('');
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
  $$('#plan-chips .chip').forEach(c =>
    c.classList.toggle('on', (c.dataset.plan === 'jahr') === planJahr));
  $('#plan-sub').textContent = planJahr ? 'Was wann ansteht' : 'Die nächsten 14 Tage';
  if (planJahr) { renderJahr(box); return; }

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
  const anzahlRaeume = Object.keys(raumProfile()).length;
  $('#raeume-stand').textContent = (anzahlRaeume
    ? anzahlRaeume + (anzahlRaeume === 1 ? ' Raum' : ' Räume') + ' eingestellt'
    : 'nicht eingestellt') + ' ›';
  $('#anleitungen-liste').innerHTML = anleitungenListe();
  $('#ort-name').textContent = (DB.settings.ort ? DB.settings.ort.name : 'nicht gesetzt') + ' ›';
  $('#set-rueckblick').checked = DB.settings.rueckblick !== false;
  $('#set-wetter').value = DB.settings.wetterAn === false ? '0' : '1';
  $('#wetter-lage').textContent = wetterLageText();
  $('#konto-name').textContent = SYNC.user || 'nicht angemeldet';
  $('#sync-status').textContent = syncText();
  $('#btn-logout').style.display = SYNC.user ? 'block' : 'none';
  $('#btn-anmelden').style.display = SYNC.user ? 'none' : 'block';
  $('#about-version').textContent = VERSION;
  $('#dat-anzahl').textContent = DB.plants.length;
  $('#zeile-sicherungen').hidden = !SYNC.user;
  speicherAnzeigen();
  $('#dat-logs').textContent = DB.logs.length;
  const imArchiv = DB.plants.filter(p => p.archiviert).length;
  $('#zeile-archiv').hidden = !imArchiv;
  $('#dat-archiv').textContent = imArchiv + (imArchiv === 1 ? ' Pflanze ›' : ' Pflanzen ›');
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
/* Erledigt wird normalerweise heute. Wer das Abhaken vergessen hat, kann
   nachtragen: über "war gestern" in der Meldung oder über das Datum in der
   Aufgabenkarte. Sonst verschiebt sich der Rhythmus und die Pünktlichkeit
   in der Statistik stimmt nicht mehr. */
let erledigtAm = null;   // ISO-Datum oder null für heute

/** Zeitstempel für den Verlauf: bei zurückliegenden Tagen mittags. */
function zeitstempel(iso) {
  if (!iso) return Date.now();
  const d = fromISO(iso);
  d.setHours(12, 0, 0, 0);
  return Math.min(d.getTime(), Date.now());
}

function giessen(id, datum) {
  const p = DB.plants.find(x => x.id === id);
  if (!p) return;
  const wann = datum || erledigtAm || toISO(new Date());
  const logId = uid();
  letzteAktion = { eintraege: [{ feld: 'letzt', plantId: id, vorher: p.letzt, logId }] };
  p.letzt = wann;
  delete p.aufschubBis;          // erledigt ist erledigt
  DB.logs.push({ id: logId, plantId: id, typ: 'wasser', ts: zeitstempel(wann) });
  save(); renderAll();
  if (navigator.vibrate) navigator.vibrate(12);

  const w = wasserWorte(p);
  const heute = toISO(new Date());
  const meldung = w.emoji + ' ' + p.name + ': ' + w.partizip +
    (wann !== heute ? ' am ' + fromISO(wann).toLocaleDateString('de-DE',
      { day: 'numeric', month: 'short' }) : '');
  toast(meldung, abhakAktionen(wann));
}

/** Trägt alles, was zuletzt abgehakt wurde, auf gestern um.

    Arbeitet auf `letzteAktion` und deckt damit jede Art von Abhaken ab –
    einzeln, „Alle gießen", eine ganze Gieß-Runde oder „Alles erledigen“. */
function letzteAufGestern() {
  if (!letzteAktion || !letzteAktion.eintraege.length) return;
  const gestern = toISO(new Date(Date.now() - 86400000));
  const ts = zeitstempel(gestern);

  for (const e of letzteAktion.eintraege) {
    const p = DB.plants.find(x => x.id === e.plantId);
    if (p) p[e.feld] = gestern;
    const eintrag = DB.logs.find(l => l.id === e.logId);
    if (eintrag) eintrag.ts = ts;
  }
  save();
  renderAll();
  if ($('#sheet-detail').classList.contains('open') && letzteAktion.eintraege[0]) {
    openDetail(letzteAktion.eintraege[0].plantId);
  }
  const anzahl = letzteAktion.eintraege.length;
  toast(anzahl === 1 ? 'Auf gestern umgetragen'
                     : anzahl + ' Einträge auf gestern umgetragen',
        'Rückgängig', rueckgaengig);
}

/** Aktionen für die Meldung nach dem Abhaken. */
function abhakAktionen(wann) {
  const aktionen = [{ text: 'Rückgängig', fn: rueckgaengig }];
  if (wann === toISO(new Date())) {
    aktionen.push({ text: 'war gestern', fn: letzteAufGestern });
  }
  return aktionen;
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
    if (!p) continue;
    if (e.eigenId) {
      // Eigene Aufgaben liegen in einer Liste, nicht in einem Feld
      const ea = eigeneVon(p).find(x => x.id === e.eigenId);
      if (ea) ea.letzt = e.vorher;
    } else {
      p[e.feld] = e.vorher;
    }
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
    feldInt: 'schneidenMon', feldLetzt: 'schneidenLetzt', einheit: 'monate' },
  // Nur bei Semi-Hydro: Düngesalze sammeln sich im Substrat und müssen raus
  { schluessel: 'spuelen', name: 'Substrat spülen', partizip: 'gespült', emoji: '🚿',
    feldInt: 'spuelenTage', feldLetzt: 'spuelenLetzt', einheit: 'tage' }
];

/** Tage bis zur nächsten Fälligkeit einer Aufgabe, null wenn abgeschaltet. */

/** Alle heute fälligen Aufgaben über alle Pflanzen. */
function faelligeAufgaben() {
  const treffer = [];
  for (const p of aktive()) {
    for (const { a, tage } of offeneAufgaben(p)) {
      treffer.push({ pflanze: p, aufgabe: a, tage });
    }
  }
  return treffer;
}

/** Aufgabe als erledigt eintragen. */
function aufgabeErledigt(id, schluessel, datum) {
  const p = DB.plants.find(x => x.id === id);
  const a = p && aufgabenVon(p).find(x => x.schluessel === schluessel);
  if (!p || !a) return;
  const wann = datum || erledigtAm || toISO(new Date());
  const logId = uid();
  letzteAktion = { eintraege: [aufgabeEintrag(p, a, logId)] };
  aufgabeSetzen(p, a, wann);
  DB.logs.push({ id: logId, plantId: id, typ: schluessel, ts: zeitstempel(wann) });
  save();
  renderAll();
  if ($('#sheet-detail').classList.contains('open')) openDetail(id);

  const heute = toISO(new Date());
  const meldung = a.emoji + ' ' + p.name + ' ' + a.partizip +
    (wann !== heute ? ' am ' + fromISO(wann).toLocaleDateString('de-DE',
      { day: 'numeric', month: 'short' }) : '');
  toast(meldung, abhakAktionen(wann));
}

/* ---------- Alles auf einmal ---------- */

/** Markiert alle gerade fälligen Pflanzen als gegossen. */
function alleGiessen() {
  const faellig = aktive().filter(p => tageBis(p) <= 0);
  if (!faellig.length) { toast('Gerade ist nichts fällig'); return; }

  const wann = erledigtAm || toISO(new Date());
  const eintraege = [];
  for (const p of faellig) {
    const logId = uid();
    eintraege.push({ feld: 'letzt', plantId: p.id, vorher: p.letzt, logId });
    p.letzt = wann;
    DB.logs.push({ id: logId, plantId: p.id, typ: 'wasser', ts: zeitstempel(wann) });
  }
  letzteAktion = { eintraege };
  save();
  renderAll();
  if (navigator.vibrate) navigator.vibrate(18);
  toast('💧 ' + faellig.length + ' Pflanzen gegossen', abhakAktionen(wann));
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
   um     = Umtopfen in Monaten (0 = aus)
   w      = Winterruhe: Faktor aufs Gießintervall von November bis Februar
            (fehlt = allgemeine Einstellung, 1 = keine, 3 = fast trocken) */
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
  { n: 'Peperomia', art: 'Peperomia', alias: 'Zwergpfeffer, Pfeffergesicht', iv: 12, licht: 'Hell, ohne direkte Sonne', menge: '100 ml', d: 45, um: 36, w: 2, hinweis: 'Die dickfleischigen Blätter speichern Wasser – erst gießen, wenn die Erde durchgetrocknet ist. Staunässe bringt sie schneller um als Trockenheit.' },
  { n: 'Zwergpfeffer', art: 'Peperomia caperata', alias: 'Peperomia caperata, Runzeliger Zwergpfeffer, Emerald Ripple', iv: 12, licht: 'Halbschatten', menge: '80 ml', d: 45, um: 36, w: 2, hinweis: 'Alle 10 bis 14 Tage reicht. Die gewellten Blätter sind ein Wasserspeicher, die Wurzeln sind fein und faulen leicht. Nicht über die Blätter gießen, sie stehen zu dicht.' },
  { n: 'Wassermelonen-Peperomie', art: 'Peperomia argyreia', alias: 'Peperomia argyreia, Melonenbegonie', iv: 12, licht: 'Halbschatten', menge: '80 ml', d: 45, um: 36, w: 2, hinweis: 'Wie alle Peperomien: lieber zu trocken als zu nass. Die gestreiften Blätter bleichen in direkter Sonne aus.' },
  { n: 'Dickblatt-Peperomie', art: 'Peperomia obtusifolia', alias: 'Peperomia obtusifolia, Fleischige Peperomie', iv: 14, licht: 'Hell, ohne direkte Sonne', menge: '100 ml', d: 45, um: 36, w: 2.5, hinweis: 'Die festesten Blätter der Gattung, entsprechend selten gießen – alle zwei Wochen genügt meist.' },
  { n: 'Pilea', art: 'Pilea peperomioides', alias: 'Ufopflanze, Glückstaler', iv: 7, licht: 'Hell, ohne direkte Sonne', menge: '150 ml', d: 30, um: 18, hinweis: 'Regelmäßig drehen, wächst sonst schief.' },

  // --- Feigen ---
  { n: 'Ficus Benjamini', art: 'Ficus benjamina', alias: 'Benjamini, Birkenfeige, Benjamin', iv: 7, licht: 'Hell, ohne direkte Sonne', menge: '300 ml', d: 30, um: 24, hinweis: 'Mag keinen Standortwechsel und wirft dann Blätter ab.' },
  { n: 'Gummibaum', art: 'Ficus elastica', alias: 'Ficus elastica, Gummibaum Robusta', iv: 8, licht: 'Hell, ohne direkte Sonne', menge: '300 ml', d: 30, um: 24, hinweis: 'Blätter gelegentlich abstauben, das verbessert die Lichtausbeute deutlich.' },
  { n: 'Gummibaum Tineke', art: 'Ficus elastica Tineke', alias: 'Tineke, Ruby, Belize, panaschierter Gummibaum', iv: 9, licht: 'Hell, ohne direkte Sonne', menge: '250 ml', d: 45, um: 24, hinweis: 'Die hellen Blattränder brauchen mehr Licht, vertragen aber keine direkte Mittagssonne.' },
  { n: 'Geigenfeige', art: 'Ficus lyrata', alias: 'Lyrata', iv: 8, licht: 'Hell, ohne direkte Sonne', menge: '300 ml', d: 30, um: 24, hinweis: 'Reagiert empfindlich auf Zugluft.' },
  { n: 'Kletterfeige', art: 'Ficus pumila', alias: '', iv: 5, licht: 'Halbschatten', menge: '150 ml', d: 30, um: 18, hinweis: 'Erde gleichmäßig feucht halten.' },

  // --- Genügsame ---
  { n: 'Bogenhanf', art: 'Sansevieria', alias: 'Schwiegermutterzunge, Sansevieria', iv: 21, licht: 'Halbschatten', menge: '150 ml', d: 60, um: 36, w: 2, hinweis: 'Staunässe ist der häufigste Fehler.' },
  { n: 'Glücksfeder', art: 'Zamioculcas zamiifolia', alias: 'Zamioculcas, ZZ-Pflanze, Glücksfeder', iv: 21, licht: 'Halbschatten', menge: '200 ml', d: 60, um: 36, w: 2, hinweis: 'Sehr genügsam, lieber zu wenig gießen.' },
  { n: 'Drachenbaum', art: 'Dracaena', alias: 'Dracaena', iv: 10, licht: 'Hell, ohne direkte Sonne', menge: '250 ml', d: 45, um: 30, hinweis: 'Reagiert empfindlich auf Fluorid im Leitungswasser.' },
  { n: 'Yucca', art: 'Yucca elephantipes', alias: 'Yuccapalme, Palmlilie', iv: 14, licht: 'Vollsonne', menge: '250 ml', d: 60, um: 36, hinweis: 'Der Stamm darf nicht weich werden.' },
  { n: 'Elefantenfuß', art: 'Beaucarnea recurvata', alias: 'Flaschenbaum', iv: 21, licht: 'Vollsonne', menge: '200 ml', d: 60, um: 36, w: 2.5, hinweis: 'Speichert Wasser im verdickten Stamm.' },
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
  { n: 'Aloe Vera', art: 'Aloe barbadensis', alias: 'Aloe', iv: 18, licht: 'Vollsonne', menge: '100 ml', d: 60, um: 24, w: 3, hinweis: 'Im Winter fast gar nicht gießen.' },
  { n: 'Kaktus', art: '', alias: 'Kugelkaktus, Kakteen', iv: 21, licht: 'Vollsonne', menge: '80 ml', d: 60, um: 36, w: 3, hinweis: 'Von Oktober bis März fast trocken halten – die Winterruhe ist Bedingung für Blüten.' },
  { n: 'Goldkugelkaktus', art: 'Echinocactus grusonii', alias: 'Schwiegermutterstuhl, Echinocactus', iv: 21, licht: 'Vollsonne', menge: '100 ml', d: 60, um: 36, w: 3, hinweis: 'Im Winter kühl bei 8 bis 12 Grad und trocken, sonst vergeilt er.' },
  { n: 'Warzenkaktus', art: 'Mammillaria', alias: 'Mammillaria', iv: 18, licht: 'Vollsonne', menge: '60 ml', d: 60, um: 36, w: 3, hinweis: 'Blüht im Frühjahr zuverlässig, wenn er im Winter trocken und kühl stand.' },
  { n: 'Feigenkaktus', art: 'Opuntia', alias: 'Opuntie, Ohrenkaktus', iv: 21, licht: 'Vollsonne', menge: '100 ml', d: 60, um: 36, w: 3, hinweis: 'Feine Widerhaken-Stacheln: nur mit Handschuhen anfassen.' },
  { n: 'Säulenkaktus', art: 'Cereus', alias: 'Cereus, Apfelkaktus', iv: 18, licht: 'Vollsonne', menge: '150 ml', d: 60, um: 36, w: 3, hinweis: 'Wird groß und schwer – schwerer Topf verhindert Umkippen.' },
  { n: 'Gymnocalycium', art: 'Gymnocalycium', alias: 'Rubinball, Pfropfkaktus', iv: 16, licht: 'Hell, ohne direkte Sonne', menge: '50 ml', d: 45, um: 30, w: 2.5, hinweis: 'Die roten und gelben Kugeln sind gepfropft und vertragen keine pralle Sonne.' },
  { n: 'Rebutia', art: 'Rebutia', alias: 'Zwergkaktus', iv: 14, licht: 'Vollsonne', menge: '50 ml', d: 45, um: 30, w: 3, hinweis: 'Kleinbleibend und blühwillig, braucht dafür eine kühle Winterruhe.' },
  { n: 'Bischofsmütze', art: 'Astrophytum', alias: 'Astrophytum', iv: 21, licht: 'Vollsonne', menge: '60 ml', d: 60, um: 36, w: 3, hinweis: 'Sehr empfindlich gegen Staunässe, mineralische Erde verwenden.' },
  { n: 'Alterskaktus', art: 'Espostoa lanata', alias: 'Espostoa, Greisenhaupt', iv: 21, licht: 'Vollsonne', menge: '100 ml', d: 60, um: 36, w: 3, hinweis: 'Die weiße Behaarung nicht nass machen, sie vergilbt sonst.' },
  { n: 'Rhipsalis', art: 'Rhipsalis', alias: 'Rutenkaktus, Korallenkaktus, Binsenkaktus', iv: 7, licht: 'Halbschatten', menge: '150 ml', d: 30, um: 24, w: 1.5, hinweis: 'Regenwaldkaktus: braucht deutlich mehr Wasser als ein Wüstenkaktus und keine pralle Sonne.' },
  { n: 'Blattkaktus', art: 'Epiphyllum', alias: 'Epiphyllum, Königin der Nacht', iv: 8, licht: 'Hell, ohne direkte Sonne', menge: '200 ml', d: 21, um: 24, w: 2, hinweis: 'Regenwaldkaktus: gleichmäßig feucht halten, im Winter etwas kühler stellen.' },
  { n: 'Wolfsmilchkaktus', art: 'Euphorbia trigona', alias: 'Dreikantige Wolfsmilch', iv: 14, licht: 'Hell, ohne direkte Sonne', menge: '100 ml', d: 45, um: 36, w: 2.5, hinweis: 'Kein echter Kaktus. Der Milchsaft reizt Haut und Augen.' },
  { n: 'Weihnachtskaktus', art: 'Schlumbergera', alias: 'Schlumbergera, Osterkaktus, Hatiora', iv: 10, licht: 'Hell, ohne direkte Sonne', menge: '100 ml', d: 30, um: 24, w: 1.5, hinweis: 'Regenwaldkaktus, kein Wüstenbewohner: gleichmäßig feucht halten. Während der Knospenbildung nicht drehen.' },
  { n: 'Geldbaum', art: 'Crassula ovata', alias: 'Pfennigbaum, Jadebaum, Crassula', iv: 18, licht: 'Vollsonne', menge: '150 ml', d: 60, um: 36, w: 2.5, hinweis: 'Dicke Blätter speichern Wasser.' },
  { n: 'Echeveria', art: 'Echeveria', alias: 'Sukkulente', iv: 18, licht: 'Vollsonne', menge: '80 ml', d: 60, um: 24, w: 3, hinweis: 'Nicht über die Rosette gießen.' },
  { n: 'Haworthia', art: 'Haworthia', alias: '', iv: 18, licht: 'Hell, ohne direkte Sonne', menge: '80 ml', d: 60, um: 36, w: 2.5, hinweis: 'Braucht deutlich weniger Sonne als andere Sukkulenten.' },
  { n: 'Christusdorn', art: 'Euphorbia milii', alias: '', iv: 14, licht: 'Vollsonne', menge: '100 ml', d: 45, um: 36, w: 2, hinweis: 'Milchsaft ist giftig.' },

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
    `${treffer.menge ? ', ' + esc(treffer.menge) : ''}` +
    `${treffer.w >= 2.5 ? ', im Winter deutlich weniger' : ''}</span>` +
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
  if (a.w) fuelle('#f-winter', String(a.w));
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
   sechs Stück je Pflanze. */
const FOTOS_MAX = 6;
const FOTO_KANTE = 900;      // Vollansicht läuft über die ganze Breite

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
  return `<div class="galerie">${bilder}${platz}</div>`;
}

async function fotoHinzufuegen(pid, datei) {
  const p = DB.plants.find(x => x.id === pid);
  if (!p) return;
  const liste = fotosVon(p);
  if (liste.length >= FOTOS_MAX) { toast('Mehr als ' + FOTOS_MAX + ' Fotos gehen nicht'); return; }
  // Seit die Bilder in IndexedDB liegen, ist Platz selten das Problem. Der
  // Datensatz selbst sollte trotzdem nicht über 4 MB wachsen.
  if (speicherBytes() > 4 * 1048576) {
    toast('Speicher fast voll (' + speicherText() + ') – unter Mehr → Daten nachsehen');
    return;
  }
  try {
    const bild = await bildVerkleinern(datei, zielKante(560, FOTO_KANTE), 0.7);
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
  bildLoeschen('g:' + fid);
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
    .map(([typ, n]) => `<div class="field"><label>${logText(typ, '')}</label><span class="hint">${n}</span></div>`)
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
    <button class="btn sec" data-runde="spaeter">Noch nicht – später erinnern</button>
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
  const wann = erledigtAm || toISO(new Date());
  const eintraege = [];
  for (const id of runde.erledigt) {
    const p = DB.plants.find(x => x.id === id);
    if (!p) continue;
    const logId = uid();
    eintraege.push({ feld: 'letzt', plantId: id, vorher: p.letzt, logId });
    p.letzt = wann;
    delete p.aufschubBis;
    DB.logs.push({ id: logId, plantId: id, typ: 'wasser', ts: zeitstempel(wann) });
  }
  const anzahl = eintraege.length;
  letzteAktion = { eintraege };
  runde = null;
  save();
  renderAll();
  closeSheets();
  toast('💧 ' + anzahl + (anzahl === 1 ? ' Pflanze' : ' Pflanzen') + ' gegossen',
        abhakAktionen(wann));
}

function rundeSchritt(was) {
  if (!runde) return;
  if (was === 'abbruch' || was === 'fertig') { rundeSpeichern(); return; }
  if (was === 'spaeter') {
    // Die Runde bleibt offen im Hintergrund stehen; nach dem Verschieben
    // geht es an derselben Stelle weiter.
    rundeAufschub = runde.pflanzen[runde.index].id;
    aufschubFragen(rundeAufschub);
    return;
  }
  if (was === 'gegossen') {
    runde.erledigt.add(runde.pflanzen[runde.index].id);
    if (navigator.vibrate) navigator.vibrate(10);
  }
  runde.index++;
  rundeZeichnen();
}

/* Merkt sich, dass der Aufschub aus einer laufenden Runde heraus kam. */
let rundeAufschub = null;

/* ---------- Problem-Hilfe ----------
   Symptom auswählen, mögliche Ursachen und Maßnahmen lesen. Wird die Hilfe aus
   einer Pflanze heraus geöffnet, prüft `pruefungen` deren tatsächliche Werte
   und stellt passende Hinweise nach oben.

   Steht die Ursache fest, gibt es zu den meisten einen Behandlungsplan: eine
   Folge von Schritten mit Abstand in Tagen. Das ist bei Schädlingen der
   entscheidende Punkt – eine einmalige Behandlung erwischt nie alle Eier, und
   genau daran scheitern die meisten Versuche. `tag` zählt ab dem Start.

   Ursachen ohne `plan` brauchen keinen: Ein altes Blatt entfernt man einmal
   und ist fertig. */
const PROBLEME = [
  {
    id: 'gelbe-blaetter', emoji: '🟡', titel: 'Gelbe Blätter',
    ursachen: [
      { was: 'Zu viel Wasser', wenn: ['feucht', 'dunkel', 'trueb', 'kalt'], tun: 'Häufigste Ursache. Erde antrocknen lassen, Untersetzer leeren, Intervall verlängern. Riecht die Erde faulig, umtopfen und faule Wurzeln abschneiden.',
        plan: [
          { tag: 0, text: 'Untersetzer leeren. Erde zwei Zentimeter tief mit dem Finger prüfen – nass, feucht oder trocken?' },
          { tag: 0, text: 'Nicht gießen. Blätter, die schon weich und gelb sind, werden nicht mehr grün: abschneiden.' },
          { tag: 3, text: 'Erde erneut prüfen. Riecht sie faulig oder ist sie immer noch nass, austopfen und die Wurzeln ansehen.' },
          { tag: 7, text: 'Erst gießen, wenn die oberen zwei Zentimeter trocken sind.' },
          { tag: 14, text: 'Bilanz: Keine neuen gelben Blätter? Dann das Gießintervall dauerhaft um etwa ein Drittel verlängern.' }
        ] },
      { was: 'Zu wenig Wasser', wenn: ['hitze', 'sonne', 'heizung'], tun: 'Ist die Erde staubtrocken und der Ballen von der Topfwand abgelöst: durchdringend wässern oder eine halbe Stunde tauchen.',
        plan: [
          { tag: 0, text: 'Topf 20 bis 30 Minuten in lauwarmes Wasser stellen, bis keine Blasen mehr aufsteigen.' },
          { tag: 0, text: 'Gut abtropfen lassen, danach den Untersetzer leeren.' },
          { tag: 2, text: 'Erholt sie sich? Vertrocknete Blätter jetzt abschneiden.' },
          { tag: 7, text: 'Normal weitergießen – und das Gießintervall verkürzen, damit es nicht wieder so weit kommt.' }
        ] },
      { was: 'Nährstoffmangel', tun: 'Gleichmäßig hellgelbe Blätter bei grünen Adern deuten auf Eisenmangel. In der Wachstumszeit alle zwei bis vier Wochen düngen.',
        plan: [
          { tag: 0, text: 'Flüssigdünger in halber Dosis auf feuchte Erde geben – nie auf trockene, das verbrennt die Wurzeln.' },
          { tag: 14, text: 'Zweite Gabe, jetzt in voller Dosis.' },
          { tag: 28, text: 'Dritte Gabe. Die neu austreibenden Blätter sollten kräftiger grün sein als die alten.' },
          { tag: 42, text: 'Bilanz: Keine Besserung? Dann liegt es nicht am Dünger – Wurzeln und Lichtverhältnisse prüfen.' }
        ] },
      { was: 'Natürliche Alterung', tun: 'Einzelne untere Blätter gelb und dann braun: normal, einfach entfernen.' }
    ]
  },
  {
    id: 'braune-spitzen', emoji: '🟤', titel: 'Braune Blattspitzen',
    ursachen: [
      { was: 'Trockene Luft', wenn: ['heizung', 'klima', 'heizperiode', 'trockene-luft'], tun: 'Typisch im Winter über der Heizung. Luftfeuchte erhöhen, Pflanze umstellen, Blätter besprühen (nicht bei samtigen Blättern).',
        plan: [
          { tag: 0, text: 'Braune Spitzen mit einer sauberen Schere abschneiden, einen schmalen braunen Rand stehen lassen.' },
          { tag: 0, text: 'Von der Heizung wegstellen oder eine Schale mit Wasser und Blähton danebenstellen.' },
          { tag: 7, text: 'Neue braune Spitzen? Dann Luftfeuchte weiter erhöhen – mehrere Pflanzen zusammenstellen hilft am meisten.' },
          { tag: 21, text: 'Bilanz: Bleiben die frisch ausgetriebenen Blätter sauber, passt der Standort jetzt.' }
        ] },
      { was: 'Kalk im Wasser', tun: 'Abgestandenes, weiches Wasser nehmen oder Regenwasser sammeln. Betrifft besonders Grünlilie, Drachenbaum und Calathea.',
        plan: [
          { tag: 0, text: 'Ab jetzt abgestandenes, weiches Wasser oder Regenwasser verwenden.' },
          { tag: 0, text: 'Den Ballen einmal mit reichlich weichem Wasser durchspülen, Untersetzer danach leeren.' },
          { tag: 30, text: 'Oberste Erdschicht mit dem Kalkrand abtragen und durch frische Erde ersetzen.' },
          { tag: 60, text: 'Bilanz: Die seither gewachsenen Blätter sollten keine braunen Spitzen haben.' }
        ] },
      { was: 'Zu viel Dünger', tun: 'Salzränder auf der Erde? Ein bis zwei Monate nicht düngen, den Ballen mit klarem Wasser durchspülen.',
        plan: [
          { tag: 0, text: 'Salzkruste von der Erdoberfläche abtragen.' },
          { tag: 0, text: 'Erde durchspülen: die dreifache Topfmenge lauwarmes Wasser langsam durchlaufen lassen, Untersetzer mehrfach leeren.' },
          { tag: 30, text: 'Weiter nicht düngen, nur gießen.' },
          { tag: 60, text: 'Wieder anfangen zu düngen – dauerhaft in halber Dosis.' }
        ] }
    ]
  },
  {
    id: 'haengende-blaetter', emoji: '🥀', titel: 'Blätter hängen',
    ursachen: [
      { was: 'Durst', wenn: ['hitze', 'sonne'], tun: 'Erde trocken? Dann gründlich gießen, die meisten Pflanzen erholen sich in wenigen Stunden.',
        plan: [
          { tag: 0, text: 'Durchdringend gießen, bis unten Wasser austritt. Nach 20 Minuten den Untersetzer leeren.' },
          { tag: 1, text: 'Steht sie wieder aufrecht? Dann war es nur Durst.' },
          { tag: 7, text: 'Gießintervall dauerhaft verkürzen.' }
        ] },
      { was: 'Wurzelfäule', wenn: ['feucht', 'kalt', 'dunkel'], tun: 'Hängende Blätter bei nasser Erde sind ein Alarmzeichen: Die Wurzeln nehmen kein Wasser mehr auf. Austopfen, faule braune Wurzeln entfernen, in frische Erde setzen und erst mal sparsam gießen.',
        plan: [
          { tag: 0, text: 'Austopfen und die Wurzeln unter lauwarmem Wasser abspülen.' },
          { tag: 0, text: 'Alle braunen, matschigen oder faulig riechenden Wurzeln bis ins Gesunde abschneiden. Gesunde Wurzeln sind hell und fest.' },
          { tag: 0, text: 'In frische, lockere Erde setzen. Topf nur so groß wie nötig – und mit Abzugsloch.' },
          { tag: 0, text: 'Sparsam angießen. Etwa ein Drittel der Blätter abschneiden, damit die verbliebenen Wurzeln nachkommen.' },
          { tag: 3, text: 'Schattiger stellen: Ohne Wurzeln kann die Pflanze kaum Wasser nachliefern.' },
          { tag: 7, text: 'Erste kleine Wassergabe – nur wenn die Erde oben trocken ist.' },
          { tag: 21, text: 'Neuer Austrieb? Dann ist es überstanden. Erst jetzt wieder düngen.' }
        ] },
      { was: 'Zugluft oder Kälte', wenn: ['zugluft', 'kalt', 'frost'], tun: 'Standort neben offenem Fenster oder Tür prüfen, besonders im Winter.',
        plan: [
          { tag: 0, text: 'Standort prüfen: Fenster, Türen, Klimaanlage, Lüftungsauslass. Pflanze umstellen.' },
          { tag: 0, text: 'Topf von kalten Fliesen oder dem Fensterbrett auf eine Unterlage stellen.' },
          { tag: 3, text: 'Erholt sie sich? Geschädigte Blätter entfernen.' },
          { tag: 14, text: 'Bilanz ziehen. Kein Fortschritt? Dann lag es nicht am Standort.' }
        ] }
    ]
  },
  {
    id: 'trauermuecken', emoji: '🦟', titel: 'Kleine schwarze Mücken',
    ursachen: [
      { was: 'Trauermücken in der Erde', tun: 'Ihre Larven leben in dauerfeuchter Erde. Oberschicht abtrocknen lassen, von unten gießen, Gelbtafeln gegen die Fliegenden aufstellen. Bei starkem Befall Nematoden gießen oder die Erde tauschen.',
        plan: [
          { tag: 0, text: 'Gelbtafeln aufstellen. Sie fangen die fliegenden Tiere und zeigen, wie stark der Befall ist.' },
          { tag: 0, text: 'Ab jetzt von unten über den Untersetzer gießen, damit die Oberfläche abtrocknet.' },
          { tag: 0, text: 'Erde mit einer Schicht Sand oder feinem Blähton abdecken – das hindert die Weibchen an der Eiablage.' },
          { tag: 3, text: 'SF-Nematoden ins Gießwasser geben. Sie fressen die Larven und sind für Menschen und Haustiere harmlos.' },
          { tag: 14, text: 'Zweite Nematoden-Gabe. Der Entwicklungszyklus dauert rund drei Wochen – ohne den zweiten Durchgang beginnt alles von vorn.' },
          { tag: 28, text: 'Gelbtafeln kontrollieren. Kaum noch Tiere? Dann ist es überstanden.' }
        ] },
      { was: 'Zu feuchte Haltung', wenn: ['feucht', 'dunkel', 'trueb'], tun: 'Gießintervall verlängern – die Mücken verschwinden mit der Feuchtigkeit.',
        plan: [
          { tag: 0, text: 'Gießintervall verlängern, Untersetzer nach jedem Gießen leeren.' },
          { tag: 0, text: 'Die obersten zwei Zentimeter zwischen den Gaben trocken werden lassen.' },
          { tag: 21, text: 'Kontrolle: Ohne dauerfeuchte Oberfläche verschwinden die Mücken von selbst.' }
        ] }
    ]
  },
  {
    id: 'schimmel', emoji: '⚪', titel: 'Weißer Belag auf der Erde',
    ursachen: [
      { was: 'Schimmel', wenn: ['feucht', 'dunkel', 'kalt'], tun: 'Meist harmlos. Belag abtragen, Erde lockern, weniger gießen und für Luftbewegung sorgen.',
        plan: [
          { tag: 0, text: 'Belag mit einem Löffel abtragen und wegwerfen – nicht untermischen.' },
          { tag: 0, text: 'Erde vorsichtig lockern, damit Luft hineinkommt.' },
          { tag: 0, text: 'Weniger gießen, Untersetzer leeren, den Raum öfter lüften.' },
          { tag: 7, text: 'Kommt der Belag wieder, die obersten drei Zentimeter Erde austauschen.' },
          { tag: 21, text: 'Bilanz: Bleibt es sauber, lag es an der Feuchtigkeit.' }
        ] },
      { was: 'Kalkablagerungen', tun: 'Krustig und hart statt flauschig: Kalk aus dem Gießwasser. Oberschicht erneuern, weicheres Wasser nehmen.',
        plan: [
          { tag: 0, text: 'Kruste abtragen und die oberste Erdschicht erneuern.' },
          { tag: 0, text: 'Auf abgestandenes weiches Wasser oder Regenwasser umstellen.' },
          { tag: 60, text: 'Kontrolle: Mit weichem Wasser bildet sich keine neue Kruste.' }
        ] }
    ]
  },
  {
    id: 'klebrig', emoji: '🐛', titel: 'Klebrige Blätter, kleine Tiere',
    ursachen: [
      { was: 'Blattläuse', tun: 'Grüne oder schwarze Tierchen an Trieben. Abduschen, danach mit Schmierseifenlösung einsprühen, nach einer Woche wiederholen.',
        plan: [
          { tag: 0, text: 'Pflanze von den anderen trennen – Blattläuse wandern.' },
          { tag: 0, text: 'Ins Bad stellen und lauwarm abbrausen, Blattunterseiten nicht vergessen.' },
          { tag: 0, text: 'Mit Schmierseifenlösung einsprühen (1 EL auf 1 Liter Wasser), tropfnass bis in die Blattachseln.' },
          { tag: 3, text: 'Kontrolle. Noch Tiere zu sehen? Dann erneut einsprühen.' },
          { tag: 7, text: 'Zweite Behandlung – sie erwischt die inzwischen geschlüpften.' },
          { tag: 14, text: 'Dritte Kontrolle. Klebrige Rückstände mit einem feuchten Tuch abwischen, sonst siedelt sich Rußtau an.' },
          { tag: 21, text: 'Sauber? Dann darf sie zurück zu den anderen Pflanzen.' }
        ] },
      { was: 'Schildläuse', tun: 'Braune Höcker auf Blattunterseiten und Stielen. Einzeln abkratzen, dann mit Öl-Seifen-Mittel behandeln.',
        plan: [
          { tag: 0, text: 'Pflanze von den anderen trennen.' },
          { tag: 0, text: 'Alle Höcker einzeln mit Fingernagel oder weicher Bürste abkratzen – auch an Stielen und in Blattachseln.' },
          { tag: 0, text: 'Mit einem Öl-Seifen-Mittel einsprühen. Der Ölfilm erstickt die Tiere, gegen ihren Schild hilft kaum etwas anderes.' },
          { tag: 7, text: 'Zweite Behandlung.' },
          { tag: 14, text: 'Dritte Behandlung. Unter drei Durchgängen wird man Schildläuse selten los.' },
          { tag: 28, text: 'Gründliche Kontrolle: Blattunterseiten, Triebspitzen, Blattachseln.' },
          { tag: 42, text: 'Nochmal kontrollieren. Erst dann zurück zu den anderen Pflanzen.' }
        ] },
      { was: 'Wollläuse', tun: 'Weiße Wattebäusche in Blattachseln. Mit einem in Spiritus getauchten Wattestäbchen betupfen.',
        plan: [
          { tag: 0, text: 'Pflanze von den anderen trennen.' },
          { tag: 0, text: 'Jedes Wattenest einzeln mit einem in Spiritus getauchten Wattestäbchen betupfen.' },
          { tag: 0, text: 'Blattachseln und Triebspitzen systematisch absuchen – dort sitzen sie am liebsten.' },
          { tag: 7, text: 'Wiederholen. Aus übersehenen Eiern schlüpft ständig Nachschub.' },
          { tag: 14, text: 'Dritter Durchgang.' },
          { tag: 28, text: 'Kontrolle. Auch den Wurzelbereich ansehen: Es gibt Wurzelläuse, die genauso aussehen.' }
        ] }
    ]
  },
  {
    id: 'spinnmilben', emoji: '🕸', titel: 'Feine Gespinste, gesprenkelte Blätter',
    ursachen: [
      { was: 'Spinnmilben', wenn: ['heizung', 'klima', 'heizperiode', 'trockene-luft'], tun: 'Kommen bei trockener Heizungsluft. Pflanze kräftig abbrausen, Luftfeuchte erhöhen, notfalls mit Rapsöl-Präparat behandeln. Befallene Pflanzen von anderen trennen.',
        plan: [
          { tag: 0, text: 'Pflanze von den anderen trennen. Spinnmilben wandern über sich berührende Blätter.' },
          { tag: 0, text: 'Kräftig abbrausen, besonders die Blattunterseiten.' },
          { tag: 0, text: 'Mit Rapsöl-Präparat einsprühen, tropfnass bis in die Blattachseln.' },
          { tag: 0, text: 'Luftfeuchte erhöhen – bei trockener Heizungsluft vermehren sie sich am schnellsten.' },
          { tag: 5, text: 'Zweite Behandlung.' },
          { tag: 10, text: 'Dritte Behandlung. Der Zyklus dauert je nach Wärme fünf bis zwölf Tage, deshalb die kurzen Abstände.' },
          { tag: 21, text: 'Kontrolle: Pflanze mit Wasser besprühen, dann werden feine Gespinste sichtbar.' }
        ] }
    ]
  },
  {
    id: 'kein-wachstum', emoji: '🌱', titel: 'Wächst nicht, wird lang und dünn',
    ursachen: [
      { was: 'Zu wenig Licht', wenn: ['dunkel', 'trueb'], tun: 'Lange dünne Triebe mit weiten Abständen zwischen den Blättern: heller stellen. Im Winter reicht vielen Zimmerpflanzen das Licht am Fenster kaum.',
        plan: [
          { tag: 0, text: 'Näher ans Fenster. Nach Süden mit etwas Abstand, nach Norden so nah wie möglich.' },
          { tag: 0, text: 'Lange vergeilte Triebe zurückschneiden, damit sie buschig neu austreibt.' },
          { tag: 14, text: 'Pflanze eine Vierteldrehung geben, damit sie gleichmäßig wächst.' },
          { tag: 42, text: 'Bilanz: Neue Blätter sollten enger beieinander sitzen als die alten.' }
        ] },
      { was: 'Topf zu klein', tun: 'Wurzeln wachsen unten aus dem Topf oder drehen sich im Kreis: in einen zwei bis vier Zentimeter größeren Topf umsetzen.',
        plan: [
          { tag: 0, text: 'Austopfen und die Wurzeln ansehen: dichter Filz oder Kreisel am Topfboden?' },
          { tag: 0, text: 'In einen zwei bis vier Zentimeter größeren Topf mit frischer Erde setzen. Größere Sprünge führen zu Staunässe.' },
          { tag: 0, text: 'Angießen, danach zwei bis drei Wochen nicht düngen – frische Erde hat genug Nährstoffe.' },
          { tag: 21, text: 'Wieder normal düngen.' },
          { tag: 60, text: 'Bilanz: Neuer Austrieb ist das Zeichen, dass es der Topf war.' }
        ] },
      { was: 'Nährstoffe fehlen', tun: 'Steht sie länger als ein Jahr in derselben Erde ohne Dünger, ist alles aufgebraucht.',
        plan: [
          { tag: 0, text: 'Flüssigdünger in halber Dosis auf feuchte Erde geben.' },
          { tag: 14, text: 'Zweite Gabe in voller Dosis.' },
          { tag: 28, text: 'Dritte Gabe.' },
          { tag: 56, text: 'Bilanz: Kein neuer Austrieb? Dann war es nicht der Dünger, sondern eher Licht oder Wurzeln.' }
        ] }
    ]
  },
  {
    id: 'blattfall', emoji: '🍂', titel: 'Plötzlicher Blattfall',
    ursachen: [
      { was: 'Standortwechsel', wenn: ['zugluft'], tun: 'Besonders Ficus reagiert empfindlich. Zurückstellen oder Geduld: Nach der Umgewöhnung treibt er neu aus.',
        plan: [
          { tag: 0, text: 'Stehen lassen, wo sie steht. Jeder weitere Wechsel kostet zusätzlich Blätter.' },
          { tag: 0, text: 'Gleichmäßig, aber weniger gießen – ohne Blätter verbraucht sie deutlich weniger.' },
          { tag: 0, text: 'Nicht düngen. Eine geschwächte Pflanze kann damit nichts anfangen.' },
          { tag: 21, text: 'An den Trieben nach neuen Knospen suchen.' },
          { tag: 42, text: 'Treibt sie aus? Dann wieder normal gießen und düngen.' }
        ] },
      { was: 'Kalte Füße', wenn: ['kalt', 'frost', 'zugluft'], tun: 'Topf auf kaltem Steinboden oder Fensterbrett. Untersetzer aus Kork oder Filz darunter legen.',
        plan: [
          { tag: 0, text: 'Topf auf eine Unterlage aus Kork, Filz oder Styropor stellen.' },
          { tag: 0, text: 'Weniger gießen: In kalter Erde nehmen die Wurzeln kaum Wasser auf.' },
          { tag: 14, text: 'Kontrolle, ob der Blattfall aufhört.' }
        ] },
      { was: 'Trockenstress', wenn: ['hitze', 'sonne'], tun: 'Einmal komplett ausgetrocknet? Dann wirft die Pflanze Blätter ab, um zu überleben.',
        plan: [
          { tag: 0, text: 'Ballen tauchen, bis keine Blasen mehr aufsteigen, danach gut abtropfen lassen.' },
          { tag: 0, text: 'Kahle Triebe noch nicht abschneiden. Erst mit dem Fingernagel an der Rinde prüfen, was darunter noch grün ist.' },
          { tag: 7, text: 'Erneut gießen, jetzt in kürzerem Abstand als vorher.' },
          { tag: 28, text: 'Bilanz: Was bis hierher nicht ausgetrieben hat, ist tot und kann weg.' }
        ] }
    ]
  },
  {
    id: 'keine-blueten', emoji: '🌸', titel: 'Blüht nicht',
    ursachen: [
      { was: 'Zu wenig Licht', wenn: ['dunkel', 'trueb'], tun: 'Blühpflanzen brauchen deutlich mehr Licht als Grünpflanzen.',
        plan: [
          { tag: 0, text: 'An den hellsten Platz stellen, den die Wohnung hergibt.' },
          { tag: 0, text: 'Verblühtes und Samenstände entfernen – die kosten Kraft, die für neue Knospen fehlt.' },
          { tag: 30, text: 'Auf Knospenansätze kontrollieren.' },
          { tag: 60, text: 'Bilanz ziehen.' }
        ] },
      { was: 'Falscher Dünger', tun: 'Stickstoffbetonter Dünger fördert Blätter statt Blüten. Blühpflanzendünger mit mehr Phosphor nehmen.',
        plan: [
          { tag: 0, text: 'Auf Blühpflanzendünger umstellen: mehr Phosphor, weniger Stickstoff.' },
          { tag: 14, text: 'Zweite Gabe.' },
          { tag: 28, text: 'Dritte Gabe.' },
          { tag: 56, text: 'Bilanz: Knospen zeigen sich meist nach sechs bis acht Wochen.' }
        ] },
      { was: 'Ruhephase fehlt', tun: 'Viele Arten – Weihnachtskaktus, Orchidee, Amaryllis – brauchen im Winter einige Wochen kühler und trockener, um Blüten anzusetzen.',
        plan: [
          { tag: 0, text: 'Kühler stellen. 10 bis 15 Grad sind das Ziel – Schlafzimmer, Flur oder Treppenhaus.' },
          { tag: 0, text: 'Deutlich weniger gießen: nur so viel, dass sie nicht vertrocknet.' },
          { tag: 0, text: 'Düngen einstellen.' },
          { tag: 42, text: 'Halbzeit. Weiter kühl und trocken halten, auch wenn nichts passiert.' },
          { tag: 70, text: 'Ruhephase beenden: wärmer stellen, wieder normal gießen und düngen. Jetzt sollten Knospen kommen.' }
        ] }
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

  const pruefung = topfPruefung(p);
  if (pruefung && pruefung.hinweise.length) hinweise.push(...pruefung.hinweise);

  hinweise.push(...umgebungsHinweise(p));

  const rh = raumHinweis(p);
  if (rh) hinweise.push(rh);
  if (raumZuKaltZumDuengen(p)) {
    hinweise.push('Bei dieser Temperatur wächst nichts, deshalb ist das Düngen ' +
      'ausgesetzt. Nährstoffe, die niemand verbraucht, versalzen nur die Erde.');
  }

  if (zustandVon(p) === 'schlecht') {
    hinweise.push('Du hast eingetragen, dass es der Pflanze schlecht geht. Das ' +
      'Gießintervall ist deshalb verlängert und das Düngen pausiert.');
  }

  const t = tageBis(p);
  if (t < -7) hinweise.push(`Die Pflanze ist seit ${Math.abs(t)} Tagen überfällig.`);
  return hinweise;
}

/* Aus welcher Pflanze heraus die Hilfe geöffnet wurde. Entscheidet später,
   ob eine Behandlung direkt gestartet werden kann oder erst gefragt wird,
   für welche Pflanze sie gilt. */
let hilfePflanze = null;

/** Öffnet die Hilfe, optional im Bezug auf eine bestimmte Pflanze. */
function hilfeOeffnen(pid) {
  const p = pid ? DB.plants.find(x => x.id === pid) : null;
  hilfePflanze = p ? p.id : null;
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
  const p = hilfePflanze ? DB.plants.find(x => x.id === hilfePflanze) : null;
  const lage = p ? lageJetzt(p) : new Set();

  // Ursachen, die zur Umgebung oder zum Wetter passen, kommen nach oben.
  // Bei „Braune Blattspitzen“ im Januar über der Heizung ist die Antwort
  // meistens schon gefunden, bevor man den Rest gelesen hat.
  const passt = u => (u.wenn || []).some(k => lage.has(k));
  const reihe = pr.ursachen.map((u, i) => ({ u, i, passt: passt(u) }))
    .sort((a, b) => (b.passt - a.passt) || (a.i - b.i));

  $('#hilfe-titel').textContent = pr.emoji + ' ' + pr.titel;
  $('#hilfe-inhalt').innerHTML =
    `<div class="section-title">Mögliche Ursachen</div>` +
    reihe.map(({ u, i, passt: ja }) => `
      <div class="card${ja ? ' passt' : ''}">
        ${ja ? `<div class="passt-marke">Passt zu ${esc(p.name)}: ${
          esc(lageWorte(u, lage))}</div>` : ''}
        <b style="display:block;margin-bottom:5px">${esc(u.was)}</b>
        <span style="color:var(--text-2);font-size:15px;line-height:1.45">${esc(u.tun)}</span>
        ${u.plan ? `<button class="aktion-knopf" data-plan="${pr.id}" data-idx="${i}">
          Das ist es → Behandlungsplan (${u.plan.length} Schritte)</button>` : ''}
      </div>`).join('') +
    `<button class="btn sec" data-problem-zurueck>Zurück zur Übersicht</button>`;
}

/** Klartext zu den Merkmalen, wegen derer eine Ursache oben steht. */
const LAGE_WORTE = {
  heizung: 'steht an der Heizung', klima: 'Klimaanlage im Raum',
  sonne: 'direkte Mittagssonne', zugluft: 'Zugluft', kalt: 'kalt',
  feucht: 'feuchter Raum', dunkel: 'wenig Tageslicht',
  heizperiode: 'Heizperiode', hitze: 'Hitze', frost: 'Frost angekündigt',
  trueb: 'trübe Tage', 'trockene-luft': 'trockene Luft'
};

function lageWorte(u, lage) {
  return (u.wenn || []).filter(k => lage.has(k))
    .map(k => LAGE_WORTE[k] || k).join(', ');
}

/* ---------- Raumtemperaturen ----------
   Der Winter-Modus verlängert das Gießintervall pauschal für die ganze
   Wohnung. Das trifft die Wirklichkeit nicht: Das Wohnzimmer hat im Januar
   22 Grad und im August 28, das Schlafzimmer im Januar 14. Für eine Pflanze
   ist das ein anderer Planet – bei 14 Grad wächst sie praktisch nicht, braucht
   halb so viel Wasser und verträgt keinen Dünger.

   Deshalb bekommt jeder Standort zwei Temperaturbereiche, einen für den Sommer
   und einen für den Winter. Wo ein Bereich hinterlegt ist, ersetzt er den
   pauschalen Winter-Modus. */
const RAUM_VORLAGEN = {
  'Wohnzimmer': { sommer: [21, 27], winter: [19, 23] },
  'Schlafzimmer': { sommer: [19, 25], winter: [15, 19] },
  'Küche': { sommer: [21, 27], winter: [19, 23] },
  'Bad': { sommer: [21, 26], winter: [20, 24] },
  'Flur': { sommer: [19, 25], winter: [16, 20] },
  'Büro': { sommer: [21, 26], winter: [19, 23] },
  'Arbeitszimmer': { sommer: [21, 26], winter: [19, 23] },
  'Kinderzimmer': { sommer: [20, 26], winter: [19, 22] },
  'Wintergarten': { sommer: [24, 35], winter: [8, 16] },
  'Keller': { sommer: [16, 21], winter: [10, 15] },
  'Balkon': { sommer: [15, 30], winter: [-5, 8] },
  'Terrasse': { sommer: [15, 30], winter: [-5, 8] },
  'Garten': { sommer: [15, 30], winter: [-5, 8] },
  'Fensterbank': { sommer: [22, 30], winter: [14, 20] }
};

/* Was welche Temperatur für eine Zimmerpflanze bedeutet. Die Grenzen sind
   bewusst grob – zwischen 18 und 24 Grad ist alles in Ordnung, darunter und
   darüber wird es zunehmend eng. */
const TEMPERATUR_STUFEN = [
  { bis: 8, faktor: 2.4, name: 'sehr kalt',
    text: 'Unter 8 Grad wird es für tropische Zimmerpflanzen gefährlich. Die meisten ' +
      'nehmen bleibende Schäden, lange bevor Frost kommt.' },
  { bis: 12, faktor: 2.0, name: 'kalt',
    text: 'Unter 12 Grad stellt fast jede Zimmerpflanze das Wachstum ein. Sehr sparsam ' +
      'gießen, nicht düngen – und in kalter Erde faulen Wurzeln besonders schnell.' },
  { bis: 15, faktor: 1.7, name: 'kühl',
    text: 'Bei 12 bis 15 Grad ruht die Pflanze. Das ist für viele Arten sogar gut – sie ' +
      'brauchen die kühle Ruhephase, um im Frühjahr zu blühen. Nur deutlich weniger gießen.' },
  { bis: 18, faktor: 1.4, name: 'frisch',
    text: 'Bei 15 bis 18 Grad wächst es langsam. Etwas seltener gießen als im warmen Raum.' },
  { bis: 24, faktor: 1.0, name: 'normal', text: '' },
  { bis: 27, faktor: 0.9, name: 'warm',
    text: 'Über 24 Grad verdunstet spürbar mehr. Die Erde häufiger prüfen.' },
  { bis: 99, faktor: 0.75, name: 'heiß',
    text: 'Über 27 Grad trocknet der Topf schnell aus. Bei tropischen Arten steigt ' +
      'außerdem der Bedarf an Luftfeuchte.' }
];

function raumProfile() {
  return (DB.settings && DB.settings.raeume) || {};
}

/** Ist gerade Winter? Die Heizperiode aus dem Wetter geht vor dem Kalender. */
function istWinterzeit() {
  if (wetterAktiv() && WETTER.heizperiode !== undefined) return !!WETTER.heizperiode;
  return winterAktiv();
}

/** Der aktuell gültige Bereich für einen Standort, oder null. */
function raumBereich(raum) {
  const profil = raumProfile()[raum];
  if (!profil) return null;
  const bereich = istWinterzeit() ? profil.winter : profil.sommer;
  if (!Array.isArray(bereich) || bereich.length !== 2) return null;
  const [min, max] = bereich.map(Number);
  if (!isFinite(min) || !isFinite(max)) return null;
  return [Math.min(min, max), Math.max(min, max)];
}

function raumMittel(raum) {
  const b = raumBereich(raum);
  return b ? (b[0] + b[1]) / 2 : null;
}

function stufeZu(grad) {
  return TEMPERATUR_STUFEN.find(s => grad <= s.bis) || TEMPERATUR_STUFEN[TEMPERATUR_STUFEN.length - 1];
}

/** Faktor aufs Gießintervall aus der Raumtemperatur, oder null ohne Profil. */
function raumFaktor(p) {
  const mittel = raumMittel(p && p.raum);
  return mittel === null ? null : stufeZu(mittel).faktor;
}

/** Wird bei dieser Temperatur überhaupt gedüngt? Unter 15 Grad wächst nichts. */
function raumZuKaltZumDuengen(p) {
  const mittel = raumMittel(p && p.raum);
  return mittel !== null && mittel < 15;
}

/** Hinweis für die Detailansicht und die Hilfe. */
function raumHinweis(p) {
  const raum = p && p.raum;
  const bereich = raumBereich(raum);
  if (!bereich) return null;
  const stufe = stufeZu((bereich[0] + bereich[1]) / 2);
  if (!stufe.text) return null;
  return `${raum} ${istWinterzeit() ? 'im Winter' : 'im Sommer'}: ` +
    `${bereich[0]} bis ${bereich[1]} Grad – ${stufe.text}`;
}

function raumChipHTML(p) {
  const bereich = raumBereich(p && p.raum);
  if (!bereich) return '';
  const stufe = stufeZu((bereich[0] + bereich[1]) / 2);
  return `<span class="topf-art">🌡 ${bereich[0]}–${bereich[1]} °C · ${esc(stufe.name)}</span>`;
}

/* ---------- Verwaltung ---------- */
function raeumeOeffnen() {
  const genutzt = Array.from(new Set(DB.plants.map(p => p.raum).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'de'));
  const profile = raumProfile();

  $('#raeume-inhalt').innerHTML = `
    <div class="grabber"></div>
    <h2>Räume und Temperatur</h2>
    <p class="sheet-hinweis">Der Winter-Modus verlängert das Gießen pauschal für die
      ganze Wohnung. Das trifft es selten: Das Wohnzimmer hat im Januar 22 Grad, das
      Schlafzimmer 14. Für eine Pflanze ist das ein anderer Planet.</p>
    <p class="sheet-hinweis">Wo du hier Werte einträgst, rechnet die App damit statt
      mit dem pauschalen Winter-Modus. Unter 15 Grad wird außerdem nicht mehr gedüngt –
      da wächst nichts, was Nährstoffe verbrauchen könnte.</p>

    ${genutzt.length ? genutzt.map(raum => {
      const pr = profile[raum] || RAUM_VORLAGEN[raum] || { sommer: ['', ''], winter: ['', ''] };
      const gesetzt = !!profile[raum];
      const jetzt = raumBereich(raum);
      return `
        <div class="section-title mit-aktion"><span>${esc(raum)}</span>
          ${jetzt ? `<span style="text-transform:none;letter-spacing:0;font-weight:400">
            jetzt ${jetzt[0]}–${jetzt[1]} °C · ${esc(stufeZu((jetzt[0] + jetzt[1]) / 2).name)}</span>` : ''}</div>
        <div class="group">
          <div class="field"><label>Sommer</label>
            <span class="temp-paar">
              <input type="number" min="-10" max="45" data-raum="${esc(raum)}" data-zeit="sommer" data-i="0"
                     value="${gesetzt ? pr.sommer[0] : ''}" placeholder="${RAUM_VORLAGEN[raum] ? RAUM_VORLAGEN[raum].sommer[0] : 20}">
              <span>bis</span>
              <input type="number" min="-10" max="45" data-raum="${esc(raum)}" data-zeit="sommer" data-i="1"
                     value="${gesetzt ? pr.sommer[1] : ''}" placeholder="${RAUM_VORLAGEN[raum] ? RAUM_VORLAGEN[raum].sommer[1] : 26}">
              <span>°C</span>
            </span></div>
          <div class="field"><label>Winter</label>
            <span class="temp-paar">
              <input type="number" min="-10" max="45" data-raum="${esc(raum)}" data-zeit="winter" data-i="0"
                     value="${gesetzt ? pr.winter[0] : ''}" placeholder="${RAUM_VORLAGEN[raum] ? RAUM_VORLAGEN[raum].winter[0] : 18}">
              <span>bis</span>
              <input type="number" min="-10" max="45" data-raum="${esc(raum)}" data-zeit="winter" data-i="1"
                     value="${gesetzt ? pr.winter[1] : ''}" placeholder="${RAUM_VORLAGEN[raum] ? RAUM_VORLAGEN[raum].winter[1] : 21}">
              <span>°C</span>
            </span></div>
          ${RAUM_VORLAGEN[raum] && !gesetzt
            ? `<div class="field"><label>Übliche Werte</label>
                 <span class="hint"><button type="button" class="aktion" data-raum-vorlage="${esc(raum)}">
                   ${RAUM_VORLAGEN[raum].sommer.join('–')} / ${RAUM_VORLAGEN[raum].winter.join('–')} übernehmen
                 </button></span></div>` : ''}
        </div>`;
    }).join('')
    : `<div class="karte karte-ruhig" style="color:var(--text-2)">
         Noch keine Standorte vergeben. Trag bei deinen Pflanzen einen Standort ein,
         dann erscheint er hier.</div>`}

    <button class="btn" id="btn-raeume-speichern">Speichern</button>
    <button class="btn sec" data-close>Schließen</button>`;

  $('#btn-raeume-speichern').onclick = raeumeSpeichern;
  openSheet('#sheet-raeume');
}

function raumVorlageNehmen(raum) {
  const v = RAUM_VORLAGEN[raum];
  if (!v) return;
  for (const zeit of ['sommer', 'winter']) {
    for (const i of [0, 1]) {
      const feld = document.querySelector(
        `[data-raum="${CSS.escape(raum)}"][data-zeit="${zeit}"][data-i="${i}"]`);
      if (feld) feld.value = v[zeit][i];
    }
  }
}

function raeumeSpeichern() {
  const neu = {};
  for (const feld of $$('#raeume-inhalt input[data-raum]')) {
    const { raum, zeit, i } = feld.dataset;
    const wert = feld.value === '' ? null : Number(feld.value);
    if (wert === null || !isFinite(wert)) continue;
    neu[raum] ||= { sommer: [null, null], winter: [null, null] };
    neu[raum][zeit][Number(i)] = wert;
  }

  // Nur vollständige Bereiche übernehmen – ein halb ausgefülltes Paar wäre
  // schlimmer als gar keins, weil die App dann mit Unsinn rechnet
  const sauber = {};
  for (const [raum, pr] of Object.entries(neu)) {
    const s = pr.sommer.every(x => x !== null) ? pr.sommer : null;
    const w = pr.winter.every(x => x !== null) ? pr.winter : null;
    if (!s && !w) continue;
    sauber[raum] = { sommer: s || w, winter: w || s };
  }

  DB.settings.raeume = sauber;
  save();
  renderAll();
  closeSheets();
  const anzahl = Object.keys(sauber).length;
  toast(anzahl ? anzahl + (anzahl === 1 ? ' Raum gespeichert' : ' Räume gespeichert')
               : 'Keine Temperaturen hinterlegt');
}

/* ---------- Zustand der Pflanze ----------
   Ein Gießplan rechnet stur nach Kalender. Das geht gut, solange es der
   Pflanze gut geht – und genau dann, wenn es das nicht tut, ist es falsch.

   Einer geschwächten Pflanze schadet die gewohnte Wassermenge: Wenn Wurzeln
   faulen oder Blätter fehlen, verbraucht sie weniger und der Ballen bleibt
   länger nass. Dünger ist dann ebenfalls falsch – er verbrennt beschädigte
   Wurzeln, statt beim Erholen zu helfen. Das ist keine Feinheit, sondern der
   häufigste Grund, warum eine kränkelnde Pflanze am Ende eingeht.

   Der Zustand greift deshalb wirklich ein und sagt auch, dass er es tut. */
const ZUSTAENDE = [
  { k: 'gut', emoji: '🙂', name: 'Geht ihr gut', kurz: 'gut' },
  { k: 'mittel', emoji: '😐', name: 'Schwächelt', kurz: 'schwächelt' },
  { k: 'schlecht', emoji: '😟', name: 'Geht ihr schlecht', kurz: 'schlecht' }
];

function zustandVon(p) {
  const z = p && p.zustand;
  return ZUSTAENDE.some(x => x.k === z) ? z : 'gut';
}

/** Faktor aufs Gießintervall.

    Nach oben, nicht nach unten: Eine kränkelnde Pflanze verbraucht weniger.
    Wer bei Wurzelfäule im gewohnten Takt weitergießt, macht es schlimmer. */
function zustandFaktor(p) {
  const z = zustandVon(p);
  if (z === 'schlecht') return 1.4;
  if (z === 'mittel') return 1.2;
  return 1;
}

/** Wird gerade gedüngt? Bei geschwächten Pflanzen nicht. */
function duengenPausiert(p) {
  return zustandVon(p) === 'schlecht' || istSteckling(p) || raumZuKaltZumDuengen(p);
}

function zustandSetzen(id, k) {
  const p = DB.plants.find(x => x.id === id);
  if (!p || !ZUSTAENDE.some(x => x.k === k)) return;
  const vorher = zustandVon(p);
  if (vorher === k) return;

  p.zustand = k;
  p.zustandSeit = toISO(new Date());
  DB.logs.push({ id: uid(), plantId: id, typ: 'zustand',
                 text: ZUSTAENDE.find(x => x.k === k).name, ts: Date.now() });
  save();
  renderAll();
  if ($('#sheet-detail').classList.contains('open')) openDetail(id);
  if (navigator.vibrate) navigator.vibrate(10);

  if (k === 'gut') {
    toast('🙂 ' + p.name + ': geht ihr wieder gut');
  } else {
    const eff = effIntervall(p);
    toast(`${k === 'schlecht' ? '😟' : '😐'} ${p.name}: Gießen jetzt alle ${eff} Tage` +
          (k === 'schlecht' ? ', Düngen pausiert' : ''),
          'Was ist los?', () => { closeSheets(); setTimeout(() => hilfeOeffnen(id), 180); });
  }
}

/** Die Karte in der Detailansicht: Auswahl plus das, was daraus folgt. */
function zustandKarteHTML(p) {
  const z = zustandVon(p);
  const seit = p.zustandSeit ? tageDiff(fromISO(p.zustandSeit), heute0()) : null;
  const folgen = [];

  if (z !== 'gut') {
    const roh = Math.max(1, Math.round((Number(p.intervall) || 7)
      * (winterAktiv() && !istAbleger(p) ? (Number(p.winterFaktor) || 1.5) : 1)
      * wetterFaktor(p)));
    const eff = effIntervall(p);
    if (eff !== roh) {
      folgen.push(`Gießen alle ${eff} statt ${roh} Tage – eine geschwächte Pflanze ` +
        `verbraucht weniger, und nasse Erde macht Wurzelprobleme schlimmer.`);
    }
  }
  if (z === 'schlecht') {
    folgen.push('Düngen ist pausiert. Salz verbrennt beschädigte Wurzeln, statt beim ' +
      'Erholen zu helfen – erst wieder düngen, wenn neue Blätter kommen.');
    folgen.push('Umtopfen und Schneiden melden sich weiter, aber überlege zweimal: ' +
      'Beides kostet zusätzlich Kraft, außer es geht um Wurzelfäule.');
  }

  return `
    <div class="karte zustand-karte ${z}">
      <div class="karte-kopf">Wie geht es ${esc(p.name)}?</div>
      <div class="zustand-wahl">
        ${ZUSTAENDE.map(x => `
          <button class="zustand-knopf ${x.k === z ? 'on' : ''}" data-zustand="${x.k}" data-pid="${p.id}">
            <span class="zustand-emoji">${x.emoji}</span>
            <span>${esc(x.name)}</span>
          </button>`).join('')}
      </div>
      ${z !== 'gut' && seit !== null ? `<div class="beh-seit">${
        seit === 0 ? 'Seit heute' : seit === 1 ? 'Seit gestern' : 'Seit ' + seit + ' Tagen'}</div>` : ''}
      ${folgen.map(f => `<div class="zustand-folge">${esc(f)}</div>`).join('')}
      ${z !== 'gut' && !behandlungVon(p)
        ? `<button class="btn" data-hilfe="${p.id}">Ursache suchen</button>` : ''}
    </div>`;
}

/* ---------- Lebensphasen ----------
   Ein Steckling ist keine kleine Zimmerpflanze, sondern ein Stück Pflanze ohne
   Wurzeln. Er kann kein Wasser aufnehmen, verdunstet aber weiter – deshalb
   braucht er hohe Luftfeuchte statt viel Gießwasser, keinen Dünger (der
   verbrennt die frischen Wurzelansätze) und keine direkte Sonne.

   Eine frisch bewurzelte Jungpflanze ist der nächste Fall: Sie wächst, aber
   ihr Wurzelwerk ist noch klein. Halbe Düngerdosis, kleinere Wassermengen
   häufiger, langsam ans Licht gewöhnen.

   Die Phase steht neben der Haltung, nicht darin: Ein Steckling kann im
   Wasserglas, in Anzuchterde, in Sphagnum oder in Perlite stecken. */
const PHASEN = {
  steckling: { name: 'Steckling', emoji: '🌱' },
  jung: { name: 'Jungpflanze', emoji: '🌿' },
  erwachsen: { name: '', emoji: '' }
};

/* Bewurzelungsmethoden. `wochen` ist die Spanne, nach der man üblicherweise
   Wurzeln sieht – gemeint als Orientierung, nicht als Versprechen. */
const METHODEN = [
  { k: 'wasser', name: 'Wasserglas', emoji: '🫙', wochen: [2, 6],
    hinweis: 'Am einfachsten zu kontrollieren. Wasser alle 3 bis 5 Tage wechseln, ' +
      'sonst kippt es. Wasserwurzeln sind weicher als Erdwurzeln – beim späteren ' +
      'Eintopfen gehen ein paar davon ein, das ist normal.' },
  { k: 'erde', name: 'Anzuchterde', emoji: '🪴', wochen: [3, 8],
    hinweis: 'Gleichmäßig feucht halten, nie nass. Eine durchsichtige Tüte oder ein ' +
      'Zimmergewächshaus darüber hält die Luftfeuchte oben – ohne Wurzeln verdunstet ' +
      'das Blatt mehr, als der Steckling nachliefern kann. Täglich kurz lüften.' },
  { k: 'moos', name: 'Sphagnum-Moos', emoji: '🌾', wochen: [2, 5],
    hinweis: 'Der Kompromiss: luftig wie Erde, kontrollierbar wie Wasser. Moos nur ' +
      'ausgedrückt feucht einsetzen, nicht tropfnass. Die Wurzeln sind hinterher ' +
      'kräftiger als Wasserwurzeln.' },
  { k: 'perlite', name: 'Perlite', emoji: '⚪', wochen: [2, 5],
    hinweis: 'Sehr luftig, fault praktisch nie. Der Behälter braucht unten zwei ' +
      'Zentimeter Wasser, das Perlite zieht es hoch.' }
];

function phaseVon(p) {
  const ph = p && p.phase;
  return PHASEN[ph] ? ph : 'erwachsen';
}

function istSteckling(p) { return phaseVon(p) === 'steckling'; }
function istJung(p) { return phaseVon(p) === 'jung'; }

function methodeVon(p) {
  return METHODEN.find(m => m.k === p.methode)
    || METHODEN.find(m => m.k === (istAbleger(p) ? 'wasser' : 'erde'));
}

/** Tage seit dem Beginn der aktuellen Phase. */
function phaseTage(p) {
  const seit = p.phaseSeit || p.imWasserSeit;
  if (!seit) return null;
  const tage = tageDiff(fromISO(seit), heute0());
  return tage >= 0 ? tage : null;
}

/** Menschlicher Text zur Dauer, „seit 3 Wochen“. */
function seitText(tage) {
  if (tage === null) return '';
  if (tage === 0) return 'seit heute';
  if (tage === 1) return 'seit gestern';
  if (tage < 14) return `seit ${tage} Tagen`;
  const wochen = Math.round(tage / 7);
  if (wochen < 9) return `seit ${wochen} Wochen`;
  return `seit ${Math.round(tage / 30)} Monaten`;
}

/** Karte für die Detailansicht: Fortschritt der Bewurzelung bzw. Anwachsphase. */
function phaseKarteHTML(p) {
  const phase = phaseVon(p);
  if (phase === 'erwachsen') return '';
  const tage = phaseTage(p);

  if (phase === 'steckling') {
    const m = methodeVon(p);
    const [von, bis] = m.wochen;
    const anteil = tage === null ? 0
      : Math.min(1, tage / (bis * 7));
    const stand = tage === null ? 'Kein Startdatum eingetragen'
      : tage < von * 7
        ? `Wurzeln kommen meist nach ${von} bis ${bis} Wochen.`
        : tage <= bis * 7
          ? 'Jetzt ist die übliche Zeit – regelmäßig nachsehen.'
          : `Länger als ${bis} Wochen ohne Wurzeln. Sitzt der Schnitt unter einem ` +
            `Blattknoten? Ist es warm genug (20 bis 25 Grad)?`;

    return `
      <div class="karte phase">
        <div class="karte-kopf">${m.emoji} Steckling in ${esc(m.name)}${
          tage !== null ? ' · ' + seitText(tage) : ''}</div>
        <div class="beh-fortschritt">
          <div class="beh-balken"><i style="width:${Math.round(anteil * 100)}%"></i></div>
          <span>${von}–${bis} Wo.</span>
        </div>
        <div class="beh-warten">${esc(stand)}</div>
        <button class="btn" data-bewurzelt="${p.id}">🌿 Hat Wurzeln – ist jetzt Jungpflanze</button>
        <button class="btn sec" data-anleitung="stecklinge" data-pid="${p.id}">Anleitung ansehen</button>
      </div>`;
  }

  // Jungpflanze
  const reif = tage !== null && tage >= 180;
  return `
    <div class="karte phase">
      <div class="karte-kopf">🌿 Jungpflanze${tage !== null ? ' · ' + seitText(tage) : ''}</div>
      <div class="beh-warten">Dünger in halber Dosis, lieber kleine Mengen öfter als
        einmal viel. Das Wurzelwerk ist noch klein und verträgt weder Trockenheit
        noch stehende Nässe.</div>
      ${reif ? `<button class="btn" data-erwachsen="${p.id}">Ist ausgewachsen</button>`
             : `<button class="btn sec" data-erwachsen="${p.id}">Ist ausgewachsen</button>`}
    </div>`;
}

/** Chips unter dem Namen. */
function phaseChipsHTML(p) {
  const phase = phaseVon(p);
  if (phase === 'erwachsen') return '';
  const tage = phaseTage(p);
  if (phase === 'steckling') {
    const m = methodeVon(p);
    return `<div class="topf-arten">
      <span class="topf-art">🌱 Steckling</span>
      <span class="topf-art">${m.emoji} ${esc(m.name)}</span>
      ${tage !== null ? `<span class="topf-art">${esc(seitText(tage))}</span>` : ''}
      <span class="topf-art">kein Dünger</span>
    </div>`;
  }
  return `<div class="topf-arten">
    <span class="topf-art">🌿 Jungpflanze</span>
    ${tage !== null ? `<span class="topf-art">${esc(seitText(tage))}</span>` : ''}
    <span class="topf-art">Dünger halbe Dosis</span>
  </div>`;
}

/** Aus dem Steckling wird eine Jungpflanze. */
function stecklingBewurzelt(id) {
  const p = DB.plants.find(x => x.id === id);
  if (!p) return;
  const m = methodeVon(p);
  if (!confirm(p.name + ' hat Wurzeln?\n\n' +
      (m.k === 'wasser'
        ? 'Zum Eintopfen sollten die Wurzeln 3 bis 5 cm lang sein. Danach erinnert '
          + 'die App ans Gießen statt ans Wasserwechseln.'
        : 'Die App stellt auf die Pflege einer Jungpflanze um.'))) return;

  const art = artFinden(p.name) || artFinden(p.art);
  p.phase = 'jung';
  p.phaseSeit = toISO(new Date());
  if (m.k === 'wasser') {
    // Ab in die Erde: Rhythmus und Werte der Art übernehmen
    p.haltung = 'erde';
    delete p.imWasser;
    delete p.imWasserSeit;
    p.intervall = art ? art.iv : 7;
    p.letzt = toISO(new Date());
    if (art && !p.menge) p.menge = art.menge;
    if (art && !p.licht) p.licht = art.licht;
  }
  // Jungpflanzen bekommen Dünger in halber Dosis, also im doppelten Abstand
  if (art && art.d && !Number(p.duengerInt)) {
    p.duengerInt = art.d * 2;
    p.duengerLetzt = toISO(new Date());
  }
  DB.logs.push({ id: uid(), plantId: id, typ: 'bewurzelt', ts: Date.now() });
  save();
  renderAll();
  openDetail(id);
  toast('🌿 ' + p.name + ' ist jetzt eine Jungpflanze');
}

/** Aus der Jungpflanze wird eine ausgewachsene. */
function jungAusgewachsen(id) {
  const p = DB.plants.find(x => x.id === id);
  if (!p) return;
  const art = artFinden(p.name) || artFinden(p.art);
  p.phase = 'erwachsen';
  delete p.phaseSeit;
  // Volle Düngerdosis heißt: zurück auf das übliche Intervall
  if (art && art.d && Number(p.duengerInt) === art.d * 2) p.duengerInt = art.d;
  DB.logs.push({ id: uid(), plantId: id, typ: 'ausgewachsen', ts: Date.now() });
  save();
  renderAll();
  openDetail(id);
  toast(p.name + ' ist ausgewachsen');
}

/* ---------- Formular ---------- */
function phaseAnzeigen() {
  const phase = $('#f-phase').value;
  const steckling = phase === 'steckling';
  $('#feld-methode').hidden = !steckling;
  $('#feld-phase-seit').hidden = phase === 'erwachsen';
  $('#label-phase-seit').textContent = steckling ? 'Gesteckt am' : 'Jungpflanze seit';

  const hinweis = $('#phase-hinweis');
  if (steckling) {
    const m = METHODEN.find(x => x.k === $('#f-methode').value) || METHODEN[0];
    hinweis.innerHTML = `<p><b>${m.emoji} ${esc(m.name)}:</b> ${esc(m.hinweis)}</p>` +
      `<p>Bis zur Bewurzelung <b>nicht düngen</b> – Salze verbrennen die frischen ` +
      `Wurzelansätze. Und kein direktes Sonnenlicht: Ohne Wurzeln kann der Steckling ` +
      `das verdunstete Wasser nicht ersetzen.</p>`;
    hinweis.hidden = false;
  } else if (phase === 'jung') {
    hinweis.innerHTML = '<p>Jungpflanzen bekommen <b>Dünger in halber Dosis</b> und ' +
      'lieber kleine Wassermengen häufiger. Das Wurzelwerk ist noch klein und ' +
      'verträgt weder Austrocknen noch stehende Nässe.</p>';
    hinweis.hidden = false;
  } else {
    hinweis.hidden = true;
  }

  // Ein Steckling wird nicht gedüngt, umgetopft oder geschnitten
  feldZeigen('#f-duenger-int', !steckling && $('#f-haltung').value === 'erde');
  feldZeigen('#f-duenger-letzt', !steckling && $('#f-haltung').value === 'erde');
  feldZeigen('#f-umtopfen-int', !steckling && $('#f-haltung').value === 'erde');
  feldZeigen('#f-umtopfen-letzt', !steckling && $('#f-haltung').value === 'erde');
}

/* ---------- Anleitungen ----------
   Die App sagt, wann etwas fällig ist. Beim Gießen reicht das. Beim Umtopfen
   nicht: Da hängt viel daran, dass man es richtig macht, und die häufigsten
   Fehler passieren aus Unwissen – zu großer Topf, zu tief gesetzt, danach
   sofort gedüngt.

   Eine Anleitung führt deshalb Schritt für Schritt durch, immer nur ein
   Handgriff auf dem Schirm. Am Ende lässt sich die zugehörige Aufgabe direkt
   abhaken, damit man nicht noch einmal suchen muss. */
const ANLEITUNGEN = [
  {
    id: 'umtopfen', emoji: '🪴', titel: 'Umtopfen',
    kurz: 'Wann es Zeit ist, welcher Topf passt, und wie die Wurzeln heil bleiben.',
    dauer: '20 Minuten', zeitpunkt: 'Februar bis Mai, kurz vor dem Austrieb',
    aufgabe: 'umtopfen',
    woran: [
      'Wurzeln wachsen unten aus dem Abzugsloch',
      'Beim Austopfen zeigt sich ein dichter Wurzelfilz an der Topfwand',
      'Gießwasser läuft sofort durch, ohne dass Erde es hält',
      'Die Pflanze kippt oder trocknet auffällig schnell aus',
      'Weiße Krusten auf der Erde, seit über zwei Jahren derselbe Topf'
    ],
    material: [
      'Neuer Topf, nur 2 bis 4 cm größer im Durchmesser – mit Abzugsloch',
      'Frische Erde, passend zur Art (Kakteenerde, Orchideensubstrat, Einheitserde)',
      'Blähton oder grober Kies für die Drainageschicht',
      'Saubere Schere für kaputte Wurzeln',
      'Unterlage und Untersetzer, bei Wolfsmilchgewächsen Handschuhe'
    ],
    schritte: [
      { titel: 'Einen Tag vorher gießen',
        text: 'Aus einem feuchten Ballen löst sich der Topf leichter, und die Wurzeln reißen weniger.',
        tipp: 'Bei staubtrockener Erde bricht der Ballen auseinander und nimmt Feinwurzeln mit.' },
      { titel: 'Topf auswählen',
        text: 'Nur zwei bis vier Zentimeter mehr Durchmesser als bisher. Ein Abzugsloch ist Pflicht.',
        tipp: 'Der häufigste Fehler: zu groß. Die Erde in der Mitte bleibt dann wochenlang nass – der schnellste Weg zur Wurzelfäule.' },
      { titel: 'Austopfen',
        text: 'Den Topf seitlich zusammendrücken oder auf der Kante rollen. Die Pflanze am Ballen fassen und herausziehen, nie am Stamm.',
        tipp: 'Sitzt sie fest, mit einem langen Messer innen am Topfrand entlangfahren.' },
      { titel: 'Wurzeln ansehen',
        text: 'Gesunde Wurzeln sind hell und fest. Braune, matschige oder faulig riechende gehören bis ins Gesunde abgeschnitten.',
        tipp: 'Wurzeln, die sich unten im Kreis drehen, vorsichtig auseinanderziehen – sonst wachsen sie im neuen Topf genauso weiter.' },
      { titel: 'Alte Erde lockern',
        text: 'Etwa ein Drittel der alten Erde abschütteln. Bei Wurzelfäule alles unter lauwarmem Wasser abspülen.',
        tipp: 'Verbrauchte Erde ist der Grund, warum Umtopfen überhaupt nötig ist – Nährstoffe sind weg, Salze sind drin.' },
      { titel: 'Drainage einfüllen',
        text: 'Zwei bis drei Zentimeter Blähton auf den Topfboden, darüber eine Schicht frische Erde.',
        tipp: 'In einem Topf ohne Abzugsloch bringt Drainage nichts – das Wasser steht dann nur weiter unten.' },
      { titel: 'Pflanze einsetzen',
        text: 'Auf die gleiche Höhe wie vorher setzen. Der Übergang von Stamm zu Wurzel bleibt frei.',
        tipp: 'Zu tief gesetzt fault der Stammansatz. Nur Tomaten mögen das, Zimmerpflanzen nicht.' },
      { titel: 'Erde auffüllen',
        text: 'Ringsum auffüllen und mit den Fingern andrücken, nicht feststampfen. Oben zwei Zentimeter Gießrand lassen.',
        tipp: 'Zu fest gedrückte Erde lässt keine Luft an die Wurzeln.' },
      { titel: 'Angießen',
        text: 'Durchdringend gießen, bis unten Wasser austritt. Nach 20 Minuten den Untersetzer leeren.',
        tipp: 'Das Angießen schließt Hohlräume – wichtiger als die Menge.' },
      { titel: 'Die ersten Wochen',
        text: 'Zwei bis drei Wochen nicht düngen, frische Erde hat genug. Ein paar Tage etwas schattiger stellen, dann zurück an den gewohnten Platz.',
        tipp: 'Ein paar abgeworfene Blätter danach sind normal. Neuer Austrieb kommt meist nach drei bis sechs Wochen.' }
    ],
    warnung: 'Nicht im Winter umtopfen, außer es ist ein Notfall wie Wurzelfäule. ' +
      'Zwischen November und Januar wächst kaum etwas nach, und die Pflanze steht dann ' +
      'monatelang in Erde, die sie nicht durchwurzeln kann.'
  },
  {
    id: 'stecklinge', emoji: '🌱', titel: 'Stecklinge schneiden und bewurzeln',
    kurz: 'Wo der Schnitt hin muss, welches Medium sich eignet, und wann eingetopft wird.',
    dauer: '15 Minuten, dann 2 bis 8 Wochen Geduld',
    zeitpunkt: 'April bis August, in der Wachstumszeit',
    abschluss: 'Jetzt heißt es warten. Leg den Steckling in der App als eigene Pflanze ' +
      'mit der Phase „Steckling“ an, dann erinnert sie ans Wasserwechseln und zeigt, ' +
      'wie lange er schon steht.',
    woran: [
      'Die Mutterpflanze ist gesund und treibt gerade aus',
      'Ein Trieb ist lang und kahl geworden – der Rückschnitt liefert das Material',
      'Es gibt einen Trieb mit mindestens zwei Blättern und einem Blattknoten',
      'Bei Monstera, Efeutute und Philodendron: eine Luftwurzel am Knoten',
      'Draußen sind es über 20 Grad, drinnen wird es nicht kälter als 20'
    ],
    material: [
      'Scharfes, sauberes Messer oder Skalpell – keine stumpfe Schere, sie quetscht',
      'Glas, Anzuchttopf, Sphagnum-Moos oder Perlite',
      'Durchsichtige Tüte oder Zimmergewächshaus (außer bei Wasser)',
      'Optional Bewurzelungspulver für hartnäckige Arten',
      'Bei Wolfsmilchgewächsen und Ficus: Handschuhe und Küchenpapier für den Milchsaft'
    ],
    schritte: [
      { titel: 'Den richtigen Trieb aussuchen',
        text: 'Ein kräftiger, nicht blühender Trieb mit zwei bis drei Blättern. Junge, biegsame Triebe bewurzeln schneller als verholzte.',
        tipp: 'Von einer kranken oder befallenen Pflanze wird auch der Steckling krank.' },
      { titel: 'Unter dem Blattknoten schneiden',
        text: 'Etwa einen halben Zentimeter unterhalb eines Blattknotens ansetzen – der Verdickung, aus der Blatt und Luftwurzel kommen. Genau dort sitzen die Zellen, die neue Wurzeln bilden.',
        tipp: 'Der häufigste Fehler: mitten im Stängel geschnitten. Ohne Knoten passiert nichts, der Steckling fault einfach.' },
      { titel: 'Untere Blätter entfernen',
        text: 'Alles abzupfen, was später im Wasser oder Substrat stehen würde. Oben zwei bis drei Blätter reichen.',
        tipp: 'Blätter unter Wasser faulen und kippen das ganze Glas. Zu viele Blätter oben verdunsten mehr, als der Steckling ohne Wurzeln nachliefern kann.' },
      { titel: 'Milchsaft abspülen',
        text: 'Bei Ficus, Wolfsmilch und Weihnachtsstern die Schnittstelle kurz unter lauwarmes Wasser halten, bis nichts mehr austritt.',
        tipp: 'Getrockneter Milchsaft verschließt die Schnittstelle – dann kommt kein Wasser mehr rein.' },
      { titel: 'Medium wählen',
        text: 'Wasserglas ist am leichtesten zu kontrollieren. Sphagnum-Moos und Perlite geben kräftigere Wurzeln, weil mehr Luft drankommt. Anzuchterde spart das spätere Umgewöhnen.',
        tipp: 'Wasserwurzeln sind weicher. Beim Eintopfen gehen ein paar davon ein – das ist normal, aber ein Rückschlag.' },
      { titel: 'Einsetzen',
        text: 'Im Glas: nur der untere Teil steht im Wasser, kein Blatt. In Substrat: den Knoten etwa zwei Zentimeter tief setzen und andrücken.',
        tipp: 'Substrat nur feucht, nie nass. Perlite braucht unten zwei Zentimeter Wasser, das es hochzieht.' },
      { titel: 'Luftfeuchte schaffen',
        text: 'Außer im Wasserglas eine durchsichtige Tüte oder ein Zimmergewächshaus darüber. Täglich kurz lüften, damit sich kein Schimmel bildet.',
        tipp: 'Ohne Wurzeln zieht der Steckling sein Wasser nur aus der Luft. Ohne Haube vertrocknet er, obwohl das Substrat feucht ist.' },
      { titel: 'Hell, aber ohne Sonne',
        text: 'Ein Nordfenster oder ein paar Meter neben dem Südfenster. Zwischen 20 und 25 Grad geht es am schnellsten.',
        tipp: 'Direkte Sonne kocht die Haube aus und verbrennt die Blätter innerhalb eines Nachmittags.' },
      { titel: 'Nicht düngen',
        text: 'Bis Wurzeln da sind, gibt es keinen Dünger. Danach die halbe Dosis.',
        tipp: 'Salz verbrennt die frischen Wurzelansätze. Das ist nach der falschen Schnittstelle der zweithäufigste Grund fürs Scheitern.' },
      { titel: 'Warten und kontrollieren',
        text: 'Je nach Art und Medium dauert es zwei bis acht Wochen. Im Wasser alle drei bis fünf Tage wechseln, sonst kippt es.',
        tipp: 'Nicht ständig herausziehen – jedes Mal reißen die feinen Wurzelspitzen ab.' },
      { titel: 'Eintopfen',
        text: 'Wenn die Wurzeln drei bis fünf Zentimeter lang sind, in einen kleinen Topf mit lockerer Erde. Danach in der App auf „Jungpflanze“ stellen.',
        tipp: 'Zu früh eingetopft trocknet er aus, zu spät gewöhnt er sich schlechter an die Erde um.' }
    ],
    warnung: 'Zwischen Oktober und Februar bewurzeln Stecklinge kaum – zu wenig Licht ' +
      'und zu wenig Wärme. Wer es trotzdem versucht, braucht Pflanzenlicht und eine ' +
      'Heizmatte, sonst faulen sie nur.'
  }
];

let anleitung = null;   // { id, schritt, pflanzeId }

function anleitungOeffnen(id, pflanzeId) {
  const a = ANLEITUNGEN.find(x => x.id === id);
  if (!a) return;
  anleitung = { id, schritt: -1, pflanzeId: pflanzeId || null };
  anleitungZeichnen();
  openSheet('#sheet-anleitung');
}

function anleitungZeichnen() {
  if (!anleitung) return;
  const a = ANLEITUNGEN.find(x => x.id === anleitung.id);
  const box = $('#anleitung-inhalt');
  const p = anleitung.pflanzeId ? DB.plants.find(x => x.id === anleitung.pflanzeId) : null;

  // Übersicht vor dem ersten Schritt: Zeitpunkt, Anzeichen, Material
  if (anleitung.schritt < 0) {
    box.innerHTML = `
      <div class="grabber"></div>
      <h2>${a.emoji} ${esc(a.titel)}</h2>
      <p class="sheet-hinweis">${esc(a.kurz)}${p ? ' Für ' + esc(p.name) + '.' : ''}</p>

      <div class="group">
        <div class="field"><label>Bester Zeitpunkt</label><span class="hint">${esc(a.zeitpunkt)}</span></div>
        <div class="field"><label>Dauer</label><span class="hint">${esc(a.dauer)}</span></div>
        <div class="field"><label>Schritte</label><span class="hint">${a.schritte.length}</span></div>
      </div>

      ${a.warnung ? `<div class="karte" style="border-left:3px solid var(--orange);
        color:var(--text-2);line-height:1.5">${esc(a.warnung)}</div>` : ''}

      <div class="section-title">Woran du es erkennst</div>
      <div class="karte"><ul class="liste">${
        a.woran.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>

      <div class="section-title">Was du brauchst</div>
      <div class="karte"><ul class="liste">${
        a.material.map(m => `<li>${esc(m)}</li>`).join('')}</ul></div>

      <button class="btn" data-anleitung-schritt="weiter">Los geht's</button>
      <button class="btn sec" data-close>Schließen</button>`;
    return;
  }

  // Abschluss
  if (anleitung.schritt >= a.schritte.length) {
    const offen = p && a.aufgabe && aufgabenVon(p)
      .some(x => x.schluessel === a.aufgabe && tageBisAufgabe(x) !== null);
    box.innerHTML = `
      <div class="grabber"></div>
      <div class="empty">
        <div class="big">✅</div>
        <p><b>Geschafft</b></p>
        <p>${esc(a.abschluss || (p ? p.name + ' steht im neuen Topf.' : 'Fertig.'))}</p>
      </div>
      ${offen
        ? `<button class="btn" data-anleitung-fertig="${p.id}">Als „umgetopft" eintragen</button>`
        : ''}
      <button class="btn sec" data-anleitung-schritt="zurueck">Nochmal ansehen</button>
      <button class="btn sec" data-close>Schließen</button>`;
    return;
  }

  const s = a.schritte[anleitung.schritt];
  const nummer = anleitung.schritt + 1;
  const anteil = Math.round((anleitung.schritt / a.schritte.length) * 100);

  box.innerHTML = `
    <div class="grabber"></div>
    <div class="runde-fortschritt">
      <div class="bar"><i style="width:${anteil}%"></i></div>
      <div class="runde-zaehler">Schritt ${nummer} von ${a.schritte.length}</div>
    </div>

    <div class="karte">
      <div class="karte-kopf" style="font-size:18px;margin-bottom:10px">${esc(s.titel)}</div>
      <p style="font-size:16px;line-height:1.5;margin:0">${esc(s.text)}</p>
      ${s.tipp ? `<p class="anleitung-tipp">${esc(s.tipp)}</p>` : ''}
    </div>

    <button class="btn" data-anleitung-schritt="weiter">${
      nummer === a.schritte.length ? 'Fertig' : 'Weiter'}</button>
    <button class="btn sec" data-anleitung-schritt="zurueck">Zurück</button>
    <button class="btn sec" data-close>Abbrechen</button>`;
}

function anleitungSchritt(richtung) {
  if (!anleitung) return;
  anleitung.schritt += richtung === 'weiter' ? 1 : -1;
  if (anleitung.schritt < -1) anleitung.schritt = -1;
  anleitungZeichnen();
}

function anleitungFertig(pid) {
  const a = anleitung && ANLEITUNGEN.find(x => x.id === anleitung.id);
  const aufgabe = (a && a.aufgabe) || 'umtopfen';
  closeSheets();
  aufgabeErledigt(pid, aufgabe);
}

/** Liste aller Anleitungen, für „Mehr“. */
function anleitungenListe() {
  return ANLEITUNGEN.map(a => `
    <button class="problem" data-anleitung="${a.id}">
      <span class="problem-emoji">${a.emoji}</span>
      <span class="problem-titel">${esc(a.titel)}<span style="display:block;color:var(--text-3);
        font-size:13px;font-weight:400">${esc(a.kurz)}</span></span>
      <span class="problem-pfeil">›</span>
    </button>`).join('');
}

/* ---------- Eigene Pflegeaufgaben ----------
   Düngen, Umtopfen, Schneiden und Spülen sind fest eingebaut, weil fast jede
   Pflanze sie braucht. Alles andere ist zu verschieden: Die Monstera braucht
   einen Stützstab, die Orchidee will abgeduscht werden, die Zitrone kontrolliert
   man im Winter wöchentlich auf Schildläuse.

   Eigene Aufgaben hängen deshalb an der Pflanze und verhalten sich sonst
   genauso wie die festen – Intervall in Tagen oder Monaten, Fälligkeit,
   Abhaken, Nachtragen, Push. */
const AUFGABEN_VORLAGEN = [
  { name: 'Zurückschneiden', emoji: '✂️', int: 3, einheit: 'monate' },
  { name: 'Auf Schädlinge kontrollieren', emoji: '🔍', int: 14, einheit: 'tage' },
  { name: 'Blätter abstauben', emoji: '🧽', int: 30, einheit: 'tage' },
  { name: 'Abduschen', emoji: '🚿', int: 60, einheit: 'tage' },
  { name: 'Verblühtes ausputzen', emoji: '🌸', int: 14, einheit: 'tage' },
  { name: 'Topf drehen', emoji: '🔄', int: 14, einheit: 'tage' },
  { name: 'Untersetzer leeren', emoji: '🫗', int: 7, einheit: 'tage' },
  { name: 'Erde lockern', emoji: '🥄', int: 2, einheit: 'monate' },
  { name: 'Stütze prüfen', emoji: '🪵', int: 3, einheit: 'monate' },
  { name: 'Luftwurzeln befeuchten', emoji: '💦', int: 7, einheit: 'tage' }
];

const AUFGABEN_EMOJIS = ['📌', '✂️', '🔍', '🧽', '🚿', '🌸', '🔄', '🫗', '🥄', '🪵',
                         '💦', '🧴', '🪟', '🌡', '📏', '🐌', '🧪', '🕯', '🪴', '🧹'];

function eigeneVon(p) {
  return Array.isArray(p && p.eigene) ? p.eigene : [];
}

/** Alle Pflegeaufgaben einer Pflanze – feste und eigene – in einer Form.

    Ohne das müsste jede Stelle, die Aufgaben anzeigt oder abhakt, zweimal
    dasselbe tun. Der Schlüssel `eigen:<id>` unterscheidet die beiden Welten. */
function aufgabenVon(p) {
  const raus = [];
  for (const a of AUFGABEN) {
    const iv = Number(p[a.feldInt]) || 0;
    if (!iv) continue;
    // Geschwächte Pflanzen und Stecklinge werden nicht gedüngt
    if (a.schluessel === 'duenger' && duengenPausiert(p)) continue;
    raus.push({
      schluessel: a.schluessel, name: a.name, partizip: a.partizip, emoji: a.emoji,
      einheit: a.einheit, intervall: iv, letzt: p[a.feldLetzt] || '',
      feld: a.feldLetzt, eigenId: null
    });
  }
  for (const e of eigeneVon(p)) {
    const iv = Number(e.int) || 0;
    if (!iv) continue;
    raus.push({
      schluessel: 'eigen:' + e.id, name: e.name || 'Eigene Aufgabe',
      partizip: 'erledigt', emoji: e.emoji || '📌',
      einheit: e.einheit === 'monate' ? 'monate' : 'tage',
      intervall: iv, letzt: e.letzt || '', feld: null, eigenId: e.id
    });
  }
  return raus;
}

/** Tage bis zur Fälligkeit. null, wenn die Aufgabe nie erledigt wurde. */
function tageBisAufgabe(a) {
  if (!a.intervall || !a.letzt) return null;
  const d = fromISO(a.letzt);
  const ziel = a.einheit === 'monate'
    ? new Date(d.getFullYear(), d.getMonth() + a.intervall, d.getDate())
    : new Date(d.getTime() + a.intervall * 86400000);
  ziel.setHours(0, 0, 0, 0);
  return tageDiff(heute0(), ziel);
}

function offeneAufgaben(p) {
  return aufgabenVon(p).map(a => ({ a, tage: tageBisAufgabe(a) }))
    .filter(x => x.tage !== null && x.tage <= 0);
}

/** Setzt „zuletzt erledigt“, egal ob feste oder eigene Aufgabe. */
function aufgabeSetzen(p, a, wert) {
  if (a.eigenId) {
    const e = eigeneVon(p).find(x => x.id === a.eigenId);
    if (e) e.letzt = wert;
  } else {
    p[a.feld] = wert;
  }
}

function aufgabeVorher(p, a) {
  if (!a.eigenId) return p[a.feld];
  const e = eigeneVon(p).find(x => x.id === a.eigenId);
  return e ? e.letzt : '';
}

/** Rückgängig-Eintrag, der beide Welten abdeckt. */
function aufgabeEintrag(p, a, logId) {
  return { feld: a.feld, eigenId: a.eigenId, plantId: p.id,
           vorher: aufgabeVorher(p, a), logId };
}

/** Name einer eigenen Aufgabe zu ihrem Schlüssel, für Verlauf und Statistik. */
function eigenName(schluessel) {
  const id = String(schluessel).slice(6);
  for (const p of DB.plants) {
    const e = eigeneVon(p).find(x => x.id === id);
    if (e) return e.name;
  }
  return 'Eigene Aufgabe';
}

/* ---------- Verwaltung im Formular ---------- */
let editEigene = [];

function zeichneEigene() {
  const box = $('#eigene-liste');
  box.innerHTML = editEigene.length
    ? editEigene.map((e, i) => `
        <div class="field">
          <label>${e.emoji || '📌'} ${esc(e.name)}</label>
          <span class="hint">alle ${e.int} ${e.einheit === 'monate' ? 'Monate' : 'Tage'}
            <button type="button" class="mini-weg" data-eigen-weg="${i}">✕</button></span>
        </div>`).join('')
    : `<div class="field"><span class="hint">noch keine</span></div>`;
}

let eigenEmoji = '📌';

function eigeneNeuOeffnen() {
  eigenEmoji = '📌';
  $('#eigen-inhalt').innerHTML = `
    <div class="grabber"></div>
    <h2>Eigene Aufgabe</h2>
    <p class="sheet-hinweis">Alles, was regelmäßig wiederkommt und nicht schon
      eingebaut ist – Zurückschneiden, Schädlingskontrolle, Abduschen.</p>

    <div class="section-title">Vorlagen</div>
    <div class="chip-wahl" style="margin-bottom:18px">
      ${AUFGABEN_VORLAGEN.map((v, i) => `
        <button type="button" class="chip" data-eigen-vorlage="${i}">${v.emoji} ${esc(v.name)}</button>`).join('')}
    </div>

    <div class="section-title">Oder selbst festlegen</div>
    <div class="group">
      <div class="field"><label>Name</label>
        <input id="eigen-name" placeholder="z.B. Blattglanz" maxlength="40" autocomplete="off"></div>
      <div class="field"><label>Alle …</label>
        <input type="number" id="eigen-int" min="1" max="120" value="14" inputmode="numeric"></div>
      <div class="field"><label>Einheit</label>
        <select id="eigen-einheit">
          <option value="tage">Tage</option>
          <option value="monate">Monate</option>
        </select></div>
      <div class="field"><label>Zuletzt erledigt</label>
        <input type="date" id="eigen-letzt" value="${toISO(new Date())}"></div>
    </div>

    <div class="section-title">Symbol</div>
    <div class="card"><div class="emoji-pick" id="eigen-emoji-pick"></div></div>

    <button class="btn" id="btn-eigen-speichern">Aufgabe hinzufügen</button>
    <button class="btn sec" data-close>Abbrechen</button>`;

  zeichneEigenEmoji();
  $('#btn-eigen-speichern').onclick = eigeneUebernehmen;
  openSheet('#sheet-eigen');
}

function zeichneEigenEmoji() {
  $('#eigen-emoji-pick').innerHTML = AUFGABEN_EMOJIS.map(e =>
    `<button type="button" data-eigen-emoji="${e}" class="${e === eigenEmoji ? 'on' : ''}">${e}</button>`).join('');
}

function eigeneVorlage(i) {
  const v = AUFGABEN_VORLAGEN[Number(i)];
  if (!v) return;
  $('#eigen-name').value = v.name;
  $('#eigen-int').value = v.int;
  $('#eigen-einheit').value = v.einheit;
  eigenEmoji = v.emoji;
  zeichneEigenEmoji();
}

function eigeneUebernehmen() {
  const name = ($('#eigen-name').value || '').trim();
  const int = Math.round(Number($('#eigen-int').value) || 0);
  if (!name) { toast('Die Aufgabe braucht einen Namen'); return; }
  if (int < 1) { toast('Das Intervall fehlt'); return; }
  if (editEigene.length >= 10) { toast('Mehr als zehn eigene Aufgaben werden unübersichtlich'); return; }

  editEigene.push({
    id: uid(), name, emoji: eigenEmoji, int,
    einheit: $('#eigen-einheit').value === 'monate' ? 'monate' : 'tage',
    letzt: $('#eigen-letzt').value || toISO(new Date())
  });
  zeichneEigene();
  closeSheets();
  toast(name + ' hinzugefügt');
}

/* ---------- Notizen im Verlauf ----------
   Das Feld „Notizen“ an der Pflanze ist ein Steckbrief: Dinge, die dauerhaft
   gelten. Was man dagegen unterwegs festhalten will, hat ein Datum – „neues
   Blatt“, „Erde gewechselt“, „linke Seite kahl geworden“. Das gehört in den
   Verlauf, nicht in ein Feld, das man ständig überschreibt.

   Deshalb kann jeder Verlaufseintrag einen Kommentar tragen, und ein Kommentar
   allein ist auch ein Eintrag. */
let notizZiel = null;   // { plantId, logId } – logId null = neuer Eintrag

function notizOeffnen(pid, logId) {
  const p = DB.plants.find(x => x.id === pid);
  if (!p) return;
  const log = logId ? DB.logs.find(l => l.id === logId) : null;
  notizZiel = { plantId: pid, logId: logId || null };

  $('#notiz-inhalt').innerHTML = `
    <div class="grabber"></div>
    <h2>${log ? 'Kommentar' : 'Notiz'}</h2>
    <p class="sheet-hinweis">${log
      ? esc(logText(log.typ, log.text)) + ' am ' +
        new Date(log.ts).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'Wird mit dem heutigen Datum in den Verlauf von ' + esc(p.name) + ' geschrieben.'}</p>

    <div class="field col" style="margin-bottom:14px">
      <textarea id="notiz-text" rows="4" maxlength="400"
        placeholder="${log ? 'Was ist dazu zu sagen?' : 'Was ist aufgefallen?'}">${
        esc(log ? (log.text || '') : '')}</textarea>
    </div>
    <button class="btn" id="btn-notiz-speichern">Speichern</button>
    ${log && log.typ === 'notiz'
      ? `<button class="btn danger" id="btn-notiz-weg">Eintrag löschen</button>` : ''}
    ${log && log.typ !== 'notiz' && log.text
      ? `<button class="btn sec" id="btn-notiz-leeren">Kommentar entfernen</button>` : ''}
    <button class="btn sec" data-close>Abbrechen</button>`;

  $('#btn-notiz-speichern').onclick = notizSpeichern;
  const weg = $('#btn-notiz-weg');
  if (weg) weg.onclick = () => notizLoeschen(logId);
  const leeren = $('#btn-notiz-leeren');
  if (leeren) leeren.onclick = () => { $('#notiz-text').value = ''; notizSpeichern(); };

  openSheet('#sheet-notiz');
  setTimeout(() => $('#notiz-text').focus(), 300);
}

function notizSpeichern() {
  if (!notizZiel) return;
  const text = ($('#notiz-text').value || '').trim().slice(0, 400);
  const { plantId, logId } = notizZiel;

  if (logId) {
    const log = DB.logs.find(l => l.id === logId);
    if (!log) return;
    if (log.typ === 'notiz' && !text) { notizLoeschen(logId); return; }
    if (text) log.text = text; else delete log.text;
  } else {
    if (!text) { closeSheets(); return; }
    DB.logs.push({ id: uid(), plantId, typ: 'notiz', text,
                   ts: zeitstempel(erledigtAm || null) });
  }
  save();
  renderAll();
  closeSheets();
  if ($('#sheet-detail').classList.contains('open')) openDetail(plantId);
  toast(logId ? 'Kommentar gespeichert' : 'Notiz gespeichert');
}

function notizLoeschen(logId) {
  const log = DB.logs.find(l => l.id === logId);
  if (!log) return;
  const pid = log.plantId;
  DB.logs = DB.logs.filter(l => l.id !== logId);
  save();
  renderAll();
  closeSheets();
  if ($('#sheet-detail').classList.contains('open')) openDetail(pid);
  toast('Eintrag gelöscht');
}

/* ---------- Verlauf ---------- */
let verlaufLang = false;   // „Alle zeigen“ ist pro geöffneter Pflanze gemeint

function verlaufHTML(p) {
  const alle = DB.logs.filter(l => l.plantId === p.id).sort((a, b) => b.ts - a.ts);
  if (!alle.length) {
    return abschnittHTML('verlauf', 'Verlauf', `
      <div class="karte karte-ruhig" style="color:var(--text-2);text-align:center">
        Noch nichts eingetragen.</div>
      <button class="btn sec" data-notiz="${p.id}">Notiz hinzufügen</button>`);
  }

  const zeigen = verlaufLang ? alle : alle.slice(0, 8);
  const zeilen = zeigen.map(l => `
    <button class="log-item" data-log="${l.id}" data-pid="${p.id}">
      <span class="log-text">${esc(logText(l.typ, l.text))}${
        l.text && l.typ !== 'notiz' ? `<span class="log-kommentar">${esc(l.text)}</span>` : ''}</span>
      <span class="log-datum">${new Date(l.ts).toLocaleDateString('de-DE',
        { day: 'numeric', month: 'short', year: '2-digit' })}</span>
    </button>`).join('');

  return abschnittHTML('verlauf', `Verlauf (${alle.length})`,
    `<div class="group">${zeilen}</div>` +
    (alle.length > 8 && !verlaufLang
      ? `<button class="btn sec" data-verlauf-alle>Alle ${alle.length} zeigen</button>` : '') +
    `<button class="btn sec" data-notiz="${p.id}">Notiz hinzufügen</button>`);
}

/* ---------- Aufklappbare Abschnitte ----------
   Die Detailansicht ist mit Behandlungen, Umgebung, Fotos und Verlauf lang
   geworden. Zugeklappt bleibt oben, was täglich zählt; alles andere ist einen
   Tipp entfernt. Welche Abschnitte offen sind, merkt sich die App. */
function abschnitteLaden() {
  try {
    const roh = localStorage.getItem('pg_abschnitte');
    if (roh) detailOffen = new Set(JSON.parse(roh));
  } catch (e) { /* Standard bleibt */ }
}

let detailOffen = new Set(['pflege']);

function abschnittUmschalten(name) {
  if (detailOffen.has(name)) detailOffen.delete(name);
  else detailOffen.add(name);
  try {
    localStorage.setItem('pg_abschnitte', JSON.stringify(Array.from(detailOffen)));
  } catch (e) { /* egal */ }
}

function abschnittHTML(name, titel, inhalt) {
  const offen = detailOffen.has(name);
  return `
    <button class="abschnitt ${offen ? 'offen' : ''}" data-abschnitt="${name}">
      <span>${titel}</span><span class="abschnitt-pfeil">›</span>
    </button>
    ${offen ? `<div class="abschnitt-inhalt">${inhalt}</div>` : ''}`;
}

/* ---------- Aufschieben ----------
   Die Pflanze ist fällig, aber die Erde ist noch feucht. Gießen wäre falsch,
   und "ignorieren" hilft auch nicht: Morgen steht sie wieder da, überfällig.

   Bis hierher gab es nur zwei Möglichkeiten – gießen (und damit das volle
   Intervall neu starten) oder überfällig stehen lassen. Zwischen "morgen
   nochmal schauen" und "in zehn Tagen wieder" fehlte alles.

   Ein Aufschub setzt deshalb nur die Fälligkeit weiter, ohne den Rhythmus
   anzufassen. `letzt` bleibt, wie es war: Wird danach gegossen, zählt der
   tatsächliche Abstand, nicht der aufgeschobene. */
const AUFSCHUB_VORSCHLAEGE = [1, 2, 3, 4, 5, 7, 10, 14];

function aufschubTageBis(p) {
  if (!p || !p.aufschubBis) return null;
  const tage = tageDiff(heute0(), fromISO(p.aufschubBis));
  return tage > 0 ? tage : null;
}

/** Fragt, um wie viele Tage verschoben werden soll. */
function aufschubFragen(pid) {
  const p = DB.plants.find(x => x.id === pid);
  if (!p) return;
  const zuletzt = Number(DB.settings.aufschubTage) || 2;
  const offen = aufschubTageBis(p);
  const w = wasserWorte(p);

  $('#aufschub-inhalt').innerHTML = `
    <div class="grabber"></div>
    <h2>Später erinnern</h2>
    <p class="sheet-hinweis">${esc(p.name)} bleibt im Rhythmus – nur die Erinnerung
      rutscht nach hinten. ${esc(w.titel)} kannst du danach ganz normal abhaken.</p>
    ${offen ? `<div class="karte karte-ruhig" style="color:var(--text-2)">
      Zurzeit verschoben auf ${fromISO(p.aufschubBis).toLocaleDateString('de-DE',
        { weekday: 'long', day: 'numeric', month: 'long' })}.</div>` : ''}

    <div class="chip-wahl" style="margin-bottom:16px">
      ${AUFSCHUB_VORSCHLAEGE.map(t => `
        <button type="button" class="chip ${t === zuletzt ? 'on' : ''}"
                data-aufschub="${t}" data-pid="${p.id}">${
          t === 1 ? 'Morgen' : t + ' Tage'}</button>`).join('')}
    </div>

    <div class="field col" style="margin-bottom:12px">
      <label>Oder eine eigene Zahl</label>
      <input type="number" id="aufschub-frei" min="1" max="180" inputmode="numeric"
             placeholder="Tage" value="${offen || ''}">
    </div>
    <button class="btn" id="btn-aufschub-frei" data-pid="${p.id}">Verschieben</button>
    ${offen ? `<button class="btn sec" data-aufschub="0" data-pid="${p.id}">
      Aufschub aufheben</button>` : ''}
    <button class="btn sec" data-close>Abbrechen</button>`;

  $('#btn-aufschub-frei').onclick = () => {
    const tage = Math.round(Number($('#aufschub-frei').value) || 0);
    if (tage < 1 || tage > 180) { toast('Zwischen 1 und 180 Tagen'); return; }
    aufschieben(p.id, tage);
  };
  openSheet('#sheet-aufschub');
}

/** Verschiebt die Fälligkeit. 0 hebt einen bestehenden Aufschub auf. */
function aufschieben(pid, tage) {
  const p = DB.plants.find(x => x.id === pid);
  if (!p) return;
  const anzahl = Math.round(Number(tage) || 0);

  letzteAktion = { eintraege: [{ feld: 'aufschubBis', plantId: pid, vorher: p.aufschubBis }] };

  if (anzahl < 1) {
    delete p.aufschubBis;
    save(); renderAll(); closeSheets();
    if ($('#sheet-detail').classList.contains('open')) openDetail(pid);
    toast('Aufschub aufgehoben', 'Rückgängig', rueckgaengig);
    rundeWeiter(pid);
    return;
  }

  const ziel = new Date();
  ziel.setDate(ziel.getDate() + anzahl);
  p.aufschubBis = toISO(ziel);
  DB.settings.aufschubTage = anzahl;      // beim nächsten Mal vorgeschlagen
  save();
  renderAll();
  closeSheets();
  if ($('#sheet-detail').classList.contains('open')) openDetail(pid);
  if (navigator.vibrate) navigator.vibrate(10);
  toast(`⏭ ${p.name}: wieder ${anzahl === 1 ? 'morgen' : 'in ' + anzahl + ' Tagen'}`,
        'Rückgängig', rueckgaengig);
  rundeWeiter(pid);
}

/** Kam der Aufschub aus einer Gieß-Runde, geht es dort weiter. */
function rundeWeiter(pid) {
  if (!runde || rundeAufschub !== pid) return;
  rundeAufschub = null;
  runde.index++;
  rundeZeichnen();
  openSheet('#sheet-runde');
}

/* ---------- Etikettenbogen ----------
   Den QR-Code gab es einzeln, für jede Pflanze eine eigene Ansicht und ein
   eigener Druckvorgang. Wer zwanzig Töpfe beschriften will, klickt sich damit
   einen Nachmittag lang durch.

   Der Bogen legt alle auf eine Seite: drei Spalten, zum Ausschneiden. Gedruckt
   wird über das Druckstylesheet – die App selbst bleibt dabei unsichtbar, nur
   der Bogen kommt aufs Papier. */
let etikettAuswahl = new Set();
let etikettGross = false;

function etikettenOeffnen() {
  const liste = aktive();
  if (!liste.length) { toast('Noch keine Pflanzen angelegt'); return; }
  // Beim Öffnen sind alle dabei – das ist der übliche Fall
  etikettAuswahl = new Set(liste.map(p => p.id));
  etikettenZeichnen();
  openSheet('#sheet-etiketten');
}

function etikettenZeichnen() {
  const liste = aktive();
  const raeume = Array.from(new Set(liste.map(p => p.raum).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'de'));
  const gewaehlt = liste.filter(p => etikettAuswahl.has(p.id));

  $('#etiketten-inhalt').innerHTML = `
    <div class="grabber"></div>
    <h2>Etiketten drucken</h2>
    <p class="sheet-hinweis">Alle QR-Codes auf einem Bogen, drei nebeneinander.
      Ausschneiden und an den Topf – wer scannt, landet direkt bei der Pflanze.
      Ohne Anmeldung sieht dort niemand etwas.</p>

    <div class="section-title mit-aktion"><span>Auswahl</span>
      <span class="aktion" data-etikett-alle>${
        gewaehlt.length === liste.length ? 'Keine' : 'Alle'}</span></div>
    ${raeume.length > 1 ? `<div class="chip-wahl" style="margin-bottom:12px">
      ${raeume.map(r => `<button type="button" class="chip" data-etikett-raum="${esc(r)}">${
        esc(r)}</button>`).join('')}
    </div>` : ''}

    <div class="group">
      ${liste.map(p => `
        <label class="field auswahl-zeile">
          <span>${p.emoji || '🪴'} ${esc(p.name)}${
            p.raum ? `<span style="color:var(--text-3)"> · ${esc(p.raum)}</span>` : ''}</span>
          <input type="checkbox" class="schalter" data-etikett="${p.id}"
                 ${etikettAuswahl.has(p.id) ? 'checked' : ''}>
        </label>`).join('')}
    </div>

    <div class="field" style="margin:14px 0">
      <label>Große Etiketten</label>
      <span class="hint"><input type="checkbox" class="schalter" id="etikett-gross"
        ${etikettGross ? 'checked' : ''}></span>
    </div>

    <button class="btn" data-etikett-druck>${gewaehlt.length === 1
      ? 'Ein Etikett drucken' : gewaehlt.length + ' Etiketten drucken'}</button>
    <button class="btn sec" data-close>Schließen</button>`;

  $('#etikett-gross').onchange = e => { etikettGross = e.target.checked; };
}

function etikettUmschalten(id) {
  if (etikettAuswahl.has(id)) etikettAuswahl.delete(id);
  else etikettAuswahl.add(id);
  etikettenZeichnen();
}

function etikettRaum(raum) {
  const drin = aktive().filter(p => p.raum === raum);
  const alleDrin = drin.every(p => etikettAuswahl.has(p.id));
  for (const p of drin) {
    if (alleDrin) etikettAuswahl.delete(p.id);
    else etikettAuswahl.add(p.id);
  }
  etikettenZeichnen();
}

function etikettAlle() {
  const liste = aktive();
  etikettAuswahl = etikettAuswahl.size === liste.length
    ? new Set() : new Set(liste.map(p => p.id));
  etikettenZeichnen();
}

/** Baut den Bogen und ruft den Druckdialog auf. */
function etikettenDrucken() {
  const gewaehlt = aktive().filter(p => etikettAuswahl.has(p.id));
  if (!gewaehlt.length) { toast('Nichts ausgewählt'); return; }

  const bogen = $('#druckbogen');
  bogen.className = 'druckbogen' + (etikettGross ? ' gross' : '');
  bogen.innerHTML = gewaehlt.map(p => `
    <div class="etikett">
      <img src="${API}/qr?p=${encodeURIComponent(p.id)}" alt="">
      <div class="etikett-name">${esc(p.name)}</div>
      ${p.raum ? `<div class="etikett-ort">${esc(p.raum)}</div>` : ''}
      ${p.menge && !istAbleger(p)
        ? `<div class="etikett-ort">${esc(p.menge)} · alle ${p.intervall} Tage</div>`
        : `<div class="etikett-ort">alle ${p.intervall} Tage</div>`}
    </div>`).join('');

  // Erst drucken, wenn die QR-Bilder wirklich da sind – sonst bleiben Lücken
  const bilder = Array.from(bogen.querySelectorAll('img'));
  const fertig = bilder.map(b => b.complete ? Promise.resolve()
    : new Promise(r => { b.onload = r; b.onerror = r; }));

  toast('Bogen wird vorbereitet …');
  Promise.all(fertig).then(() => {
    document.body.classList.add('druckt');
    // Ein Bildaufbau braucht noch einen Moment nach dem Laden
    setTimeout(() => {
      window.print();
      document.body.classList.remove('druckt');
    }, 300);
  });
}

/* ---------- Gartenjahr ----------
   Der Plan zeigt vierzehn Tage. Das reicht fürs Gießen und für nichts sonst:
   Umtopfen gehört ins Frühjahr, Rückschnitt vor den Austrieb, Stecklinge in
   den Sommer, Düngepause in den Herbst. Wer das verpasst, merkt es erst ein
   Jahr später.

   Die Monatstexte gelten für Mitteleuropa und für Zimmerpflanzen. Sie sind
   bewusst kurz und handlungsorientiert – ein Kalender, den man nicht liest,
   ist keiner. */
const GARTENJAHR = [
  { m: 1, name: 'Januar', kurz: 'Tiefste Ruhe', punkte: [
    'Sparsam gießen. Die meisten Verluste im Winter sind ertrunkene Wurzeln, keine vertrockneten.',
    'Nicht düngen – es wächst nichts, was die Nährstoffe verbrauchen könnte.',
    'Licht ist jetzt der Engpass. Ein Meter näher ans Fenster bringt mehr als jede Pflege.',
    'Heizungsluft: auf Spinnmilben achten, besonders bei Pflanzen über dem Heizkörper.'
  ]},
  { m: 2, name: 'Februar', kurz: 'Es geht wieder los', punkte: [
    'Gegen Monatsende Rückschnitt – vor dem Austrieb, damit die Kraft in die neuen Triebe geht.',
    'Vergeilte, lange Wintertriebe können weg.',
    'Noch nicht düngen, aber das Gießintervall langsam verkürzen.',
    'Jetzt Stecklinge planen: Ab März bewurzeln sie deutlich schneller.'
  ]},
  { m: 3, name: 'März', kurz: 'Umtopfzeit beginnt', punkte: [
    'Die beste Zeit zum Umtopfen: kurz vor dem Austrieb, dann wächst die Pflanze sofort in die neue Erde.',
    'Wieder anfangen zu düngen – erste Gabe in halber Dosis.',
    'Gießintervall zurück auf den Sommerwert.',
    'Winterruhe beenden: Kühl gestellte Pflanzen zurück an ihren Platz.'
  ]},
  { m: 4, name: 'April', kurz: 'Hauptzeit', punkte: [
    'Umtopfen und Stecklinge – beides läuft jetzt am besten.',
    'Volle Düngung.',
    'Vorsicht mit der ersten kräftigen Sonne: Nach dem Winter sind die Blätter empfindlich und verbrennen leicht.'
  ]},
  { m: 5, name: 'Mai', kurz: 'Nach draußen', punkte: [
    'Nach den Eisheiligen (Mitte Mai) dürfen Kübelpflanzen raus.',
    'Über ein bis zwei Wochen an die Sonne gewöhnen, erst im Schatten. Sonst gibt es Verbrennungen.',
    'Nachts noch die Vorhersage im Blick behalten.'
  ]},
  { m: 6, name: 'Juni', kurz: 'Volles Wachstum', punkte: [
    'Höchster Wasserbedarf des Jahres.',
    'Regelmäßig düngen, alle zwei bis vier Wochen.',
    'Beste Zeit für Stecklinge: Sie bewurzeln in zwei bis drei Wochen.'
  ]},
  { m: 7, name: 'Juli', kurz: 'Hitze', punkte: [
    'Töpfe trocknen schnell aus, besonders am Südfenster. Lieber morgens gießen.',
    'Nicht in die pralle Mittagssonne gießen – Wassertropfen auf Blättern wirken wie Brenngläser.',
    'Urlaub planen: Wer wässert, und wie lange halten die Pflanzen durch?'
  ]},
  { m: 8, name: 'August', kurz: 'Spätsommer', punkte: [
    'Weiter viel gießen, die Verdunstung bleibt hoch.',
    'Letzte Gelegenheit für Stecklinge, damit sie vor dem Winter noch anwachsen.',
    'Ab Monatsende die Düngung zurückfahren.'
  ]},
  { m: 9, name: 'September', kurz: 'Der Sommer kippt', punkte: [
    'Nächte werden kühl – Pflanzen im Freien im Blick behalten.',
    'Düngung reduzieren, das Wachstum lässt nach.',
    'Gießintervall langsam verlängern.'
  ]},
  { m: 10, name: 'Oktober', kurz: 'Winterquartier', punkte: [
    'Alles Empfindliche muss rein. Vorher gründlich auf Schädlinge kontrollieren – im warmen Zimmer vermehren sie sich sonst explosionsartig.',
    'Düngen einstellen.',
    'Nicht mehr umtopfen: Die Pflanze durchwurzelt die frische Erde bis zum Frühjahr nicht.'
  ]},
  { m: 11, name: 'November', kurz: 'Heizung an', punkte: [
    'Trockene Heizungsluft: Jetzt beginnt die Spinnmilbenzeit. Wöchentlich Blattunterseiten ansehen.',
    'Gießintervall deutlich verlängern.',
    'Luftfeuchte erhöhen, wo es geht – Schalen mit Wasser, Pflanzen zusammenstellen.'
  ]},
  { m: 12, name: 'Dezember', kurz: 'Ruhe', punkte: [
    'Wenig Wasser, kein Dünger.',
    'Weihnachtskaktus: Er setzt Knospen nur an, wenn er im Herbst kühl stand und zwölf Stunden Dunkelheit bekam.',
    'Amaryllis nach der Ruhezeit wieder ins Warme holen.'
  ]}
];

let planJahr = false;   // false = die nächsten 14 Tage

/** Wann eine Aufgabe das nächste Mal fällig wird, als Monatszahl 1–12. */
function faelligerMonat(a) {
  const tage = tageBisAufgabe(a);
  if (tage === null) return null;
  const d = new Date();
  d.setDate(d.getDate() + Math.max(0, tage));
  return d.getMonth() + 1;
}

/** Was in diesem Monat aus den eigenen Daten ansteht. */
function eigeneTermine(monat) {
  const raus = [];
  for (const p of aktive()) {
    for (const a of aufgabenVon(p)) {
      // Gießen bleibt außen vor – das steht in der Tagesansicht
      if (faelligerMonat(a) === monat) {
        raus.push({ pflanze: p.name, aufgabe: a.name, emoji: a.emoji });
      }
    }
    if (freilandVon(p) === 'sommer') {
      if (monat === 5 && !p.draussen) raus.push({ pflanze: p.name, aufgabe: 'kann raus', emoji: '🌤' });
      if (monat === 10 && p.draussen) raus.push({ pflanze: p.name, aufgabe: 'muss rein', emoji: '🏠' });
    }
  }
  return raus;
}

function renderJahr(box) {
  const jetzt = new Date().getMonth() + 1;
  // Beim laufenden Monat anfangen – rückwärts schauen bringt hier nichts
  const reihe = GARTENJAHR.slice(jetzt - 1).concat(GARTENJAHR.slice(0, jetzt - 1));

  box.innerHTML = reihe.map(m => {
    const dran = m.m === jetzt;
    const termine = eigeneTermine(m.m);
    const offen = dran || jahrOffen.has(m.m);
    return `
      <button class="abschnitt ${offen ? 'offen' : ''} ${dran ? 'jetzt' : ''}" data-monat="${m.m}">
        <span>${esc(m.name)}${dran ? ' · jetzt' : ''}
          <span class="monat-kurz">${esc(m.kurz)}</span></span>
        <span class="abschnitt-pfeil">›</span>
      </button>
      ${offen ? `<div class="abschnitt-inhalt">
        <div class="karte"><ul class="liste">${
          m.punkte.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
        ${termine.length ? `<div class="section-title">Bei deinen Pflanzen</div>
          <div class="group">${termine.map(t => `
            <div class="field"><label>${t.emoji} ${esc(t.pflanze)}</label>
              <span class="hint">${esc(t.aufgabe)}</span></div>`).join('')}</div>` : ''}
      </div>` : ''}`;
  }).join('');
}

let jahrOffen = new Set();

function monatUmschalten(m) {
  const zahl = Number(m);
  if (jahrOffen.has(zahl)) jahrOffen.delete(zahl);
  else jahrOffen.add(zahl);
  renderPlan();
}

/* ---------- Lichtmessung ----------
   Zu wenig Licht ist die häufigste Ursache dafür, dass eine Zimmerpflanze
   nicht wächst, lange dünne Triebe bildet und irgendwann eingeht. Und es ist
   die Ursache, die man am schlechtesten schätzt: Das Auge gleicht Helligkeit
   so stark aus, dass ein Platz, der „hell genug“ aussieht, oft ein Zehntel
   des Lichts hat, das die Pflanze bräuchte.

   Drei Wege, je nachdem was das Gerät hergibt:

   1. Kamera mit Belichtungsdaten. Aus Belichtungszeit und ISO lässt sich die
      Beleuchtungsstärke rechnen – das machen Belichtungsmesser seit jeher so.
      Nur: Diese Werte gibt die Kamera im Browser lange nicht überall heraus.
      Auf dem iPhone gibt Safari sie gar nicht heraus, deshalb kann eine
      Web-App dort nicht messen, was eine native App misst.

   2. Schattenprobe. Die Methode, die Gärtner benutzen, seit es Gärtner gibt,
      und die erstaunlich zuverlässig ist.

   3. Fensterrechner aus Himmelsrichtung, Abstand und Verschattung.

   Alle drei liefern einen Bereich, keine Zahl auf die Stelle genau. Das ist
   Absicht: Eine Scheingenauigkeit wäre schlechter als eine ehrliche Spanne. */

const LICHT_STUFEN = [
  { k: 'Vollsonne', von: 10000, bis: 60000,
    text: 'Direkte Sonne für mehrere Stunden am Tag.' },
  { k: 'Hell, ohne direkte Sonne', von: 2000, bis: 10000,
    text: 'Heller Platz mit viel Himmelslicht, aber ohne Sonne auf den Blättern.' },
  { k: 'Halbschatten', von: 800, bis: 2000,
    text: 'Deutlich vom Fenster entfernt oder nach Norden.' },
  { k: 'Schatten', von: 200, bis: 800,
    text: 'Wenig Tageslicht. Nur Arten, die das ausdrücklich vertragen.' }
];

/* Unterhalb davon wächst praktisch nichts mehr – die Pflanze zehrt dann von
   ihren Reserven und wird über Monate immer dünner. */
const LICHT_MINIMUM = 500;

function stufeZuLux(lux) {
  return LICHT_STUFEN.find(s => lux >= s.von) || LICHT_STUFEN[LICHT_STUFEN.length - 1];
}

function luxText(lux) {
  // Auf sinnvolle Stellen runden – eine Lux-Zahl auf die Einer genau wäre
  // Scheingenauigkeit, egal aus welchem der drei Verfahren sie kommt
  const gerundet = lux >= 10000 ? Math.round(lux / 1000) * 1000
    : lux >= 1000 ? Math.round(lux / 100) * 100
    : Math.round(lux / 10) * 10;
  return gerundet.toLocaleString('de-DE') + ' lx';
}

/* ---------- 1. Kamera ---------- */
let lichtStream = null;

/** Kann dieses Gerät die Belichtung auslesen? Erst nach dem Start klar. */
function kameraMoeglich() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/** Beleuchtungsstärke aus Belichtungszeit und ISO.

    Die Formel der Belichtungsmessung: EV = log2(Blende² / Zeit), umgerechnet
    auf ISO 100, daraus Lux = 2,5 · 2^EV. Die Blende gibt keine Browser-API
    heraus – f/2,0 ist bei Handykameras der übliche Wert und die Annahme hier.
    Ein Objektiv mit f/1,6 liefert dadurch etwa 60 % zu wenig, was für die
    Einordnung in vier Stufen verschmerzbar ist. */
function luxAusBelichtung(zeitEinheiten, iso) {
  // exposureTime kommt laut Spezifikation in Einheiten von 100 Mikrosekunden
  const zeit = Number(zeitEinheiten) / 10000;
  const empfindlichkeit = Number(iso) || 100;
  if (!isFinite(zeit) || zeit <= 0) return null;

  const blende = 2.0;
  const ev = Math.log2((blende * blende) / zeit) - Math.log2(empfindlichkeit / 100);
  return Math.round(2.5 * Math.pow(2, ev));
}

async function kameraStarten() {
  const box = $('#licht-kamera');
  box.innerHTML = `<div class="karte karte-ruhig" style="color:var(--text-2)">Kamera wird geöffnet …</div>`;
  try {
    lichtStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
  } catch (e) {
    box.innerHTML = `<div class="karte karte-ruhig" style="color:var(--text-2)">
      Kein Zugriff auf die Kamera (${esc(e.name)}). Nimm die Schattenprobe.</div>`;
    return;
  }

  const spur = lichtStream.getVideoTracks()[0];
  // Der Belichtungsautomatik einen Moment Zeit geben, sich einzupendeln
  await new Promise(r => setTimeout(r, 1200));
  const werte = spur.getSettings ? spur.getSettings() : {};
  lichtStream.getTracks().forEach(t => t.stop());
  lichtStream = null;

  const lux = ('exposureTime' in werte)
    ? luxAusBelichtung(werte.exposureTime, werte.iso) : null;

  if (lux === null) {
    box.innerHTML = `<div class="karte karte-ruhig" style="color:var(--text-2)">
      <b>Dieses Gerät gibt die Belichtungswerte nicht heraus.</b><br>
      Auf dem iPhone ist das immer so – Safari reicht sie nicht an Web-Apps
      weiter, anders als bei einer aus dem App Store installierten App.
      Nimm die Schattenprobe, sie ist ohnehin verlässlicher.</div>`;
    return;
  }
  lichtErgebnis(lux, 'Kameramessung');
}

/* ---------- 2. Schattenprobe ---------- */
const SCHATTEN = [
  { lux: 20000, name: 'Scharfer Schatten mit klaren Kanten',
    hilfe: 'Der Umriss der Hand ist scharf, fast wie ausgeschnitten.' },
  { lux: 5000, name: 'Deutlicher Schatten mit weichen Rändern',
    hilfe: 'Der Umriss ist klar zu erkennen, die Kanten laufen aus.' },
  { lux: 1200, name: 'Schwacher, verwaschener Schatten',
    hilfe: 'Man ahnt einen dunkleren Fleck, mehr nicht.' },
  { lux: 400, name: 'Gar kein Schatten',
    hilfe: 'Das Papier bleibt gleichmäßig hell, egal wo die Hand ist.' }
];

/* ---------- 3. Fensterrechner ---------- */
const HIMMELSRICHTUNG = {
  sued: { name: 'Süden', lux: 12000 },
  westost: { name: 'Westen oder Osten', lux: 5000 },
  nord: { name: 'Norden', lux: 2000 }
};

/* Licht nimmt mit dem Quadrat des Abstands ab – deshalb der starke Abfall
   schon nach einem Meter. Das unterschätzen fast alle. */
const ABSTAND = {
  '0': { name: 'Direkt am Fenster', faktor: 1 },
  '1': { name: 'Etwa 1 Meter entfernt', faktor: 0.45 },
  '2': { name: '2 bis 3 Meter entfernt', faktor: 0.18 },
  '4': { name: 'Weiter als 3 Meter', faktor: 0.07 }
};

const VERSCHATTUNG = {
  keine: { name: 'Freier Blick zum Himmel', faktor: 1 },
  gardine: { name: 'Gardine oder Store', faktor: 0.5 },
  baum: { name: 'Baum, Balkon oder Nachbarhaus davor', faktor: 0.4 },
  beides: { name: 'Gardine und Verschattung', faktor: 0.22 }
};

function fensterRechnen() {
  const r = HIMMELSRICHTUNG[$('#licht-richtung').value] || HIMMELSRICHTUNG.westost;
  const a = ABSTAND[$('#licht-abstand').value] || ABSTAND['1'];
  const v = VERSCHATTUNG[$('#licht-schatten').value] || VERSCHATTUNG.keine;
  // Zwischen November und Februar kommt draußen deutlich weniger an
  const winter = winterAktiv() ? 0.45 : 1;
  return Math.round(r.lux * a.faktor * v.faktor * winter);
}

/* ---------- Ergebnis ---------- */
let lichtZiel = null;      // Pflanze, für die gemessen wird

function lichtOeffnen(pid) {
  lichtZiel = pid || null;
  const p = pid ? DB.plants.find(x => x.id === pid) : null;

  $('#licht-inhalt').innerHTML = `
    <div class="grabber"></div>
    <h2>Wie hell ist es hier?</h2>
    <p class="sheet-hinweis">Zu wenig Licht ist die häufigste Ursache dafür, dass eine
      Pflanze nicht wächst – und die, die man am schlechtesten schätzt. Das Auge gleicht
      Helligkeit so stark aus, dass ein Platz, der hell genug aussieht, oft ein Zehntel
      des Lichts hat, das die Pflanze bräuchte.</p>

    <div class="section-title">Schattenprobe</div>
    <p class="sheet-hinweis">Leg ein weißes Blatt Papier an den Platz und halte die Hand
      etwa 30 Zentimeter darüber. Am besten mittags. Wie sieht der Schatten aus?</p>
    ${SCHATTEN.map((s, i) => `
      <button class="problem" data-schatten="${i}">
        <span class="problem-titel">${esc(s.name)}<span style="display:block;
          color:var(--text-3);font-size:13px;font-weight:400">${esc(s.hilfe)}</span></span>
        <span class="problem-pfeil">›</span>
      </button>`).join('')}

    <div class="section-title">Oder aus der Fensterlage schätzen</div>
    <div class="group">
      <div class="field"><label>Fenster zeigt nach</label>
        <select id="licht-richtung">
          ${Object.entries(HIMMELSRICHTUNG).map(([k, v]) =>
            `<option value="${k}">${esc(v.name)}</option>`).join('')}
        </select></div>
      <div class="field"><label>Abstand</label>
        <select id="licht-abstand">
          ${Object.entries(ABSTAND).map(([k, v]) =>
            `<option value="${k}">${esc(v.name)}</option>`).join('')}
        </select></div>
      <div class="field"><label>Davor</label>
        <select id="licht-schatten">
          ${Object.entries(VERSCHATTUNG).map(([k, v]) =>
            `<option value="${k}">${esc(v.name)}</option>`).join('')}
        </select></div>
    </div>
    <button class="btn sec" id="btn-licht-fenster">Daraus schätzen</button>

    <div class="section-title">Oder mit der Kamera</div>
    <div id="licht-kamera">
      <p class="sheet-hinweis">Funktioniert nur, wenn das Gerät die Belichtungswerte
        herausgibt. Auf dem iPhone tut Safari das nicht – dort bleibt die
        Schattenprobe.</p>
      ${kameraMoeglich()
        ? `<button class="btn sec" id="btn-licht-kamera">Mit der Kamera messen</button>`
        : `<div class="karte karte-ruhig" style="color:var(--text-2)">Keine Kamera verfügbar.</div>`}
    </div>

    <button class="btn sec" data-close>Schließen</button>`;

  const knopf = $('#btn-licht-kamera');
  if (knopf) knopf.onclick = kameraStarten;
  $('#btn-licht-fenster').onclick = () => lichtErgebnis(fensterRechnen(), 'Fensterlage');
  openSheet('#sheet-licht');
}

function lichtErgebnis(lux, herkunft) {
  const stufe = stufeZuLux(lux);
  const p = lichtZiel ? DB.plants.find(x => x.id === lichtZiel) : null;
  const art = p ? (artFinden(p.name) || artFinden(p.art)) : null;

  let urteil = '';
  if (art && art.licht) {
    const soll = LICHT_STUFEN.find(s => s.k === art.licht);
    if (soll) {
      if (lux >= soll.von) {
        urteil = `<div class="karte" style="border-left:3px solid var(--accent)">
          <b>Passt.</b> ${esc(art.n)} will „${esc(art.licht)}“ – das ist hier gegeben.</div>`;
      } else if (lux >= soll.von / 3) {
        urteil = `<div class="karte" style="border-left:3px solid var(--orange)">
          <b>Knapp.</b> ${esc(art.n)} will „${esc(art.licht)}“, hier ist es merklich
          dunkler. Sie überlebt, wächst aber langsam und bildet längere Triebe.</div>`;
      } else {
        urteil = `<div class="karte" style="border-left:3px solid var(--red)">
          <b>Zu dunkel.</b> ${esc(art.n)} will „${esc(art.licht)}“ – hier bekommt sie
          einen Bruchteil davon. Auf Dauer geht das nicht gut.</div>`;
      }
    }
  }
  if (lux < LICHT_MINIMUM) {
    urteil += `<div class="karte" style="border-left:3px solid var(--red)">
      Unter ${LICHT_MINIMUM} Lux wächst praktisch keine Zimmerpflanze mehr. Sie zehrt
      dann von ihren Reserven und wird über Monate immer dünner.</div>`;
  }

  $('#licht-inhalt').innerHTML = `
    <div class="grabber"></div>
    <h2>${esc(stufe.k)}</h2>
    <div class="karte">
      <div class="lux-zahl">etwa ${luxText(lux)}</div>
      <div class="lux-quelle">${esc(herkunft)} · ${esc(stufe.text)}</div>
      <div class="lux-skala">
        ${LICHT_STUFEN.slice().reverse().map(s => `<span class="${
          s.k === stufe.k ? 'on' : ''}">${esc(s.k.split(',')[0])}</span>`).join('')}
      </div>
    </div>
    ${urteil}
    ${p ? `<button class="btn" data-licht-uebernehmen="${p.id}" data-stufe="${esc(stufe.k)}">
      Für ${esc(p.name)} übernehmen</button>` : ''}
    <button class="btn sec" data-licht-neu="${lichtZiel || ''}">Nochmal messen</button>
    <button class="btn sec" data-close>Schließen</button>`;
}

function lichtUebernehmen(pid, stufe) {
  const p = DB.plants.find(x => x.id === pid);
  if (!p) return;
  p.licht = stufe;
  DB.logs.push({ id: uid(), plantId: pid, typ: 'licht', text: stufe, ts: Date.now() });
  save();
  renderAll();
  closeSheets();
  setTimeout(() => openDetail(pid), 180);
  toast('Licht übernommen: ' + stufe);
}

/* ---------- Pflanzen im Freien ----------
   Eine verpasste Frostnacht kostet die Pflanze. Nicht „schadet ihr“ – kostet
   sie. Bei einer Zitrone auf dem Balkon reicht eine einzige Nacht mit vier
   Grad und Wind, bei einer Monstera weniger als das.

   Die Wetterdaten liegen ohnehin auf dem Server. Sie zu haben und nicht zu
   warnen wäre die Verschwendung. */
const FREILAND = {
  nein: 'Bleibt drinnen',
  sommer: 'Im Sommer draußen',
  ganzjahr: 'Ganzjährig draußen'
};

/* Was eine Pflanze noch verträgt. Die Werte sind Nachtminima, gemessen im
   Wetterbericht – im Topf auf dem Balkon wird es regelmäßig ein bis zwei Grad
   kälter als in zwei Meter Höhe, deshalb sind sie eher vorsichtig gewählt. */
const KAELTE_STUFEN = [
  { wert: 12, name: 'Sehr empfindlich', bei: 'Monstera, Alocasia, Ficus, Orchideen' },
  { wert: 8, name: 'Empfindlich', bei: 'Zitrus, Bougainvillea, Hibiskus' },
  { wert: 3, name: 'Robust', bei: 'Olive, Oleander, Agave, viele Sukkulenten' },
  { wert: -5, name: 'Frosthart', bei: 'Buchs, Lavendel, winterharte Stauden' }
];

function stehtDraussen(p) {
  return !!(p && p.draussen) && freilandVon(p) !== 'nein';
}

function freilandVon(p) {
  const f = p && p.freiland;
  return FREILAND[f] ? f : 'nein';
}

function kaelteGrenze(p) {
  const w = Number(p && p.minTemp);
  return isFinite(w) ? w : 8;
}

/** Die nächste Nacht, in der es einer Pflanze draußen zu kalt wird. */
function kalteNacht(p) {
  if (!wetterAktiv() || !Array.isArray(WETTER.naechte)) return null;
  const grenze = kaelteGrenze(p);
  return WETTER.naechte.find(n => n.tmin <= grenze) || null;
}

/** Alle Pflanzen, die reingeholt werden sollten – gruppiert nach Nacht. */
function frostGefahr() {
  if (!wetterAktiv() || !Array.isArray(WETTER.naechte) || !WETTER.naechte.length) return null;
  const betroffen = aktive().filter(p => stehtDraussen(p) && kalteNacht(p));
  if (!betroffen.length) return null;

  // Die früheste betroffene Nacht bestimmt die Dringlichkeit
  const naechste = betroffen
    .map(p => ({ p, nacht: kalteNacht(p) }))
    .sort((a, b) => a.nacht.datum.localeCompare(b.nacht.datum));
  const datum = naechste[0].nacht.datum;
  const jetzt = naechste.filter(x => x.nacht.datum === datum);
  return { datum, tmin: jetzt[0].nacht.tmin, pflanzen: jetzt.map(x => x.p),
           spaeter: naechste.length - jetzt.length };
}

function nachtText(datum) {
  const heute = toISO(new Date());
  const morgen = toISO(new Date(Date.now() + 86400000));
  if (datum === heute) return 'Heute Nacht';
  if (datum === morgen) return 'Morgen Nacht';
  return 'In der Nacht auf ' + fromISO(datum).toLocaleDateString('de-DE',
    { weekday: 'long', day: 'numeric', month: 'short' });
}

/** Die Warnkarte auf der Startseite. */
function frostKarteHTML() {
  const g = frostGefahr();
  if (!g) return '';
  const namen = g.pflanzen.map(p => esc(p.name)).join(', ');
  return `
    <div class="karte frostwarnung">
      <div class="karte-kopf">🥶 ${nachtText(g.datum)} nur ${
        String(g.tmin).replace('.', ',')} °C</div>
      <div class="beh-warten">${g.pflanzen.length === 1
        ? namen + ' steht draußen und verträgt das nicht.'
        : g.pflanzen.length + ' Pflanzen stehen draußen und vertragen das nicht: ' + namen + '.'}
        ${g.spaeter ? `<br>Weitere ${g.spaeter} werden es in den Nächten danach.` : ''}</div>
      <button class="btn" data-reinholen>${g.pflanzen.length === 1
        ? 'Reingeholt' : 'Alle reingeholt'}</button>
    </div>`;
}

/** Merkt für alle gefährdeten Pflanzen, dass sie drinnen stehen. */
function alleReinholen() {
  const g = frostGefahr();
  if (!g) return;
  for (const p of g.pflanzen) p.draussen = false;
  DB.logs.push(...g.pflanzen.map(p => ({
    id: uid(), plantId: p.id, typ: 'reingeholt', ts: Date.now()
  })));
  save();
  renderAll();
  toast(g.pflanzen.length === 1 ? g.pflanzen[0].name + ' steht jetzt drinnen'
                                : g.pflanzen.length + ' Pflanzen sind drinnen');
}

function draussenUmschalten(id) {
  const p = DB.plants.find(x => x.id === id);
  if (!p) return;
  p.draussen = !p.draussen;
  DB.logs.push({ id: uid(), plantId: id,
                 typ: p.draussen ? 'rausgestellt' : 'reingeholt', ts: Date.now() });
  save();
  renderAll();
  if ($('#sheet-detail').classList.contains('open')) openDetail(id);

  const nacht = p.draussen ? kalteNacht(p) : null;
  toast(p.draussen ? '🌤 ' + p.name + ' steht jetzt draußen' : '🏠 ' + p.name + ' ist drinnen',
        nacht ? 'Achtung: ' + nachtText(nacht.datum).toLowerCase() + ' ' +
                String(nacht.tmin).replace('.', ',') + ' °C' : null,
        nacht ? () => {} : null);
}

/** Chips in der Detailansicht. */
function freilandChipsHTML(p) {
  if (freilandVon(p) === 'nein') return '';
  const nacht = stehtDraussen(p) ? kalteNacht(p) : null;
  return `<div class="topf-arten">
    <span class="topf-art">${stehtDraussen(p) ? '🌤 steht draußen' : '🏠 steht drinnen'}</span>
    <span class="topf-art">${esc(FREILAND[freilandVon(p)])}</span>
    <span class="topf-art">bis ${String(kaelteGrenze(p)).replace('.', ',')} °C</span>
    ${nacht ? `<span class="topf-art warnung">${nachtText(nacht.datum)}: ${
      String(nacht.tmin).replace('.', ',')} °C</span>` : ''}
  </div>`;
}

/** Vorschlag, wenn die Saison so weit ist. */
function freilandVorschlag(p) {
  if (freilandVon(p) !== 'sommer' || !wetterAktiv()) return null;
  const naechte = Array.isArray(WETTER.naechte) ? WETTER.naechte : [];
  if (!naechte.length) return null;
  const kaelteste = Math.min(...naechte.map(n => n.tmin));
  const monat = new Date().getMonth() + 1;   // 1 = Januar

  if (!p.draussen && monat >= 5 && monat <= 8 && kaelteste > kaelteGrenze(p) + 3) {
    return 'Die Nächte bleiben über ' + Math.round(kaelteste) + ' Grad – sie könnte raus.';
  }
  if (p.draussen && monat >= 9 && kaelteste <= kaelteGrenze(p) + 2) {
    return 'Die Nächte werden kühl. Zeit, ans Winterquartier zu denken.';
  }
  return null;
}

/* ---------- Formular ---------- */
function freilandAnzeigen() {
  const f = $('#f-freiland').value;
  const draussenMoeglich = f !== 'nein';
  $('#feld-mintemp').hidden = !draussenMoeglich;
  $('#feld-draussen').hidden = !draussenMoeglich;

  const hinweis = $('#freiland-hinweis');
  if (draussenMoeglich) {
    const stufe = KAELTE_STUFEN.find(s => s.wert === Number($('#f-mintemp').value))
      || KAELTE_STUFEN[1];
    hinweis.innerHTML = `<p><b>${esc(stufe.name)}</b> – typisch für ${esc(stufe.bei)}.</p>` +
      `<p>Sinkt die Nachttemperatur laut Vorhersage auf ${
        String(stufe.wert).replace('.', ',')} Grad oder darunter, warnt die App – ` +
      `vorausgesetzt, ein Ort fürs Wetter ist gesetzt und die Pflanze ist als ` +
      `„steht draußen“ vermerkt.</p>` +
      `<p>Die Werte sind bewusst vorsichtig: Im Topf auf dem Balkon wird es ` +
      `regelmäßig ein bis zwei Grad kälter als im Wetterbericht.</p>`;
    hinweis.hidden = false;
  } else {
    hinweis.hidden = true;
  }
}

/* ---------- Umgebung und Wetter ----------
   Zwei Pflanzen derselben Art brauchen völlig Unterschiedliches, je nachdem,
   wo sie stehen. Über der Heizung trocknet die Luft aus und Spinnmilben
   kommen; unter der Klimaanlage passiert genau dasselbe, nur im Sommer. Am
   Südfenster verdunstet im August das Doppelte, im dunklen Flur fast nichts.

   Deshalb bekommt jede Pflanze Merkmale ihres Platzes. Sie wirken an drei
   Stellen: im Gießrhythmus, in den Hinweisen, und in der Problem-Hilfe – dort
   werden die Ursachen nach oben gestellt, die zur Lage passen.

   Das Wetter kommt vom eigenen Server (Open-Meteo). Für Zimmerpflanzen zählt
   davon nicht der Regen, sondern: läuft die Heizung, ist es zu heiß, droht
   Frost am Fensterbrett, ist es zu trüb zum Wachsen. */
const UMGEBUNG = [
  { k: 'heizung', emoji: '🔥', name: 'Über oder neben der Heizung',
    hinweis: 'Trockene Heizungsluft ist die häufigste Ursache für braune Blattspitzen und Spinnmilben.' },
  { k: 'klima', emoji: '❄️', name: 'Klimaanlage im Raum',
    hinweis: 'Klimaanlagen entziehen der Luft Feuchtigkeit – im Sommer derselbe Effekt wie eine Heizung im Winter.' },
  { k: 'sonne', emoji: '☀️', name: 'Direkte Mittagssonne',
    hinweis: 'Am Süd- oder Westfenster verdunstet im Sommer deutlich mehr, und empfindliche Blätter verbrennen.' },
  { k: 'zugluft', emoji: '🌬', name: 'Zugluft von Fenster oder Tür',
    hinweis: 'Zugluft ist einer der häufigsten Gründe für plötzlichen Blattfall.' },
  { k: 'kalt', emoji: '🧊', name: 'Kalter Boden oder kühler Raum',
    hinweis: 'In kalter Erde nehmen Wurzeln kaum Wasser auf – dann schadet die gewohnte Menge.' },
  { k: 'feucht', emoji: '💦', name: 'Feuchter Raum (Bad, Küche)',
    hinweis: 'Hohe Luftfeuchte ist gut fürs Blattwerk, begünstigt aber Schimmel auf der Erde.' },
  { k: 'dunkel', emoji: '🌑', name: 'Wenig Tageslicht',
    hinweis: 'Wenig Licht heißt wenig Wachstum – und damit deutlich weniger Wasserbedarf.' }
];

function umgebungVon(p) {
  return Array.isArray(p && p.umgebung) ? p.umgebung : [];
}

function hatUmgebung(p, k) {
  return umgebungVon(p).includes(k);
}

/* Wetterlage. Wird beim Start geholt und im localStorage zwischengelagert,
   damit die App offline nicht ohne dasteht. Nicht Teil von DB: Der Sync
   soll keine Wetterdaten zwischen Geräten hin- und herschieben. */
const WETTER_KEY = 'pg_wetter';
let WETTER = null;

function wetterLaden() {
  try {
    const roh = localStorage.getItem(WETTER_KEY);
    if (roh) WETTER = JSON.parse(roh);
  } catch (e) { WETTER = null; }
}

/** Ist die gespeicherte Lage noch brauchbar? Drei Stunden sind die Grenze. */
function wetterFrisch() {
  return WETTER && WETTER.stand && (Date.now() / 1000 - WETTER.stand) < 3 * 3600;
}

async function wetterHolen(erzwingen) {
  const ort = DB.settings.ort;
  if (!ort || DB.settings.wetterAn === false || !SYNC.user) return;
  if (!erzwingen && wetterFrisch()) return;
  try {
    const r = await api(`/wetter?lat=${ort.lat}&lon=${ort.lon}`);
    if (!r.ok) return;
    WETTER = await r.json();
    try { localStorage.setItem(WETTER_KEY, JSON.stringify(WETTER)); } catch (e) { /* egal */ }
    renderAll();
  } catch (e) { /* ohne Wetter läuft alles weiter */ }
}

/** Gilt die Wetterlage gerade? Ohne Ort oder abgeschaltet: nein. */
function wetterAktiv() {
  return !!(WETTER && DB.settings.ort && DB.settings.wetterAn !== false);
}

/** Faktor aufs Gießintervall aus der Wetterlage.

    Bewusst nur in eine Richtung: Hitze lässt früher gießen. Das Verlängern im
    Winter macht weiterhin der Winter-Modus – sonst zählt beides doppelt und
    die Pflanze steht im Januar sechs Wochen trocken. */
function wetterFaktor(p) {
  if (!wetterAktiv() || !WETTER.hitze) return 1;
  return hatUmgebung(p, 'sonne') ? 0.7 : 0.8;
}

/** Kurzer Text für die Kopfzeile der Tagesansicht. */
function wetterZeile() {
  if (!wetterAktiv()) return '';
  const grad = WETTER.tmax !== null && WETTER.tmax !== undefined
    ? Math.round(WETTER.tmax) + ' °C' : '';
  if (WETTER.hitze) {
    return { emoji: '🔥', text: `Hitze, ${grad} – Töpfe trocknen schneller, ` +
      `alle Pflanzen werden 20 % früher fällig.` };
  }
  if (WETTER.frost) {
    return { emoji: '🧊', text: 'Frost in den nächsten Tagen – Pflanzen abends vom ' +
      'Fensterbrett nehmen und beim Lüften nicht daneben stehen lassen.' };
  }
  if (WETTER.heizperiode) {
    return { emoji: '🔥', text: `Heizperiode bei ${grad} – die Luft wird trocken. ` +
      'Auf braune Spitzen und Spinnmilben achten.' };
  }
  if (WETTER.trueb) {
    return { emoji: '☁️', text: 'Trübe Tage – wenig Licht heißt wenig Wachstum. ' +
      'Lieber einmal zu wenig gießen als einmal zu viel.' };
  }
  return '';
}

/** Merkmale, die gerade zutreffen: Pflanze plus Wetterlage. */
function lageJetzt(p) {
  const raus = new Set(umgebungVon(p));
  const mittel = raumMittel(p && p.raum);
  if (mittel !== null && mittel < 18) raus.add('kalt');
  if (mittel !== null && mittel >= 27) raus.add('hitze');

  if (wetterAktiv()) {
    if (WETTER.heizperiode) raus.add('heizperiode');
    if (WETTER.hitze) raus.add('hitze');
    if (WETTER.frost) raus.add('frost');
    if (WETTER.trueb) raus.add('trueb');
  }
  // Heizperiode plus Heizung ist die eigentlich kritische Kombination
  if (raus.has('heizperiode') && raus.has('heizung')) raus.add('trockene-luft');
  if (raus.has('hitze') && raus.has('klima')) raus.add('trockene-luft');
  return raus;
}

/** Hinweise aus Umgebung und Wetter, für „Aufgefallen“ in der Hilfe. */
function umgebungsHinweise(p) {
  if (!p) return [];
  const lage = lageJetzt(p);
  const raus = [];

  if (lage.has('trockene-luft')) {
    raus.push(lage.has('heizung')
      ? 'Die Heizung läuft und die Pflanze steht direkt daran. Das ist die Kombination, ' +
        'bei der braune Spitzen und Spinnmilben zuerst auftreten.'
      : 'Klimaanlage bei Hitze: Die Luft ist so trocken wie im Winter über der Heizung.');
  }
  if (lage.has('hitze') && lage.has('sonne')) {
    raus.push('Hitze und direkte Mittagssonne: Der Topf trocknet jetzt fast doppelt so ' +
      'schnell aus wie sonst. Notfalls für ein paar Tage etwas weiter vom Fenster weg.');
  }
  if (lage.has('frost') && (lage.has('zugluft') || lage.has('kalt'))) {
    raus.push('Frost angekündigt und die Pflanze steht kalt oder zugig. Beim Lüften ' +
      'wegstellen – kalte Zugluft kostet innerhalb eines Tages Blätter.');
  }
  if (lage.has('trueb') && lage.has('dunkel')) {
    raus.push('Trübe Tage und ohnehin wenig Licht: Der Wasserbedarf ist jetzt am ' +
      'niedrigsten. Vor jedem Gießen die Erde prüfen.');
  }
  if (lage.has('feucht') && !lage.has('trockene-luft')) {
    raus.push('Feuchter Raum: gut fürs Blattwerk, aber die Erde trocknet langsamer. ' +
      'Weißer Belag darauf ist meist harmloser Schimmel.');
  }
  return raus;
}

/** Chips für die Detailansicht. */
function umgebungChipsHTML(p) {
  const liste = umgebungVon(p);
  if (!liste.length) return '';
  return `<div class="topf-arten">` + liste.map(k => {
    const u = UMGEBUNG.find(x => x.k === k);
    return u ? `<span class="topf-art">${u.emoji} ${esc(u.name)}</span>` : '';
  }).join('') + `</div>`;
}

/** Einzeiler für die Einstellungen. */
function wetterLageText() {
  if (!DB.settings.ort) return 'ohne Ort kein Wetter';
  if (DB.settings.wetterAn === false) return 'abgeschaltet';
  if (!WETTER) return 'noch nicht abgerufen';
  const teile = [];
  if (WETTER.tmax !== null && WETTER.tmax !== undefined) teile.push(Math.round(WETTER.tmax) + ' °C');
  if (WETTER.hitze) teile.push('Hitze');
  if (WETTER.heizperiode) teile.push('Heizperiode');
  if (WETTER.frost) teile.push('Frost');
  if (WETTER.trueb) teile.push('trüb');
  if (teile.length < 2) teile.push('unauffällig');
  return teile.join(' · ');
}

/* ---------- Ort ---------- */
let ortTreffer = [];

function ortOeffnen() {
  const ort = DB.settings.ort;
  $('#ort-inhalt').innerHTML = `
    <div class="grabber"></div>
    <h2>Ort fürs Wetter</h2>
    <p class="sheet-hinweis">Zimmerpflanzen stehen drinnen – trotzdem entscheidet das Wetter
      draußen, ob die Heizung läuft, wie schnell die Töpfe austrocknen und wie viel Licht
      ankommt. Der Ort wird nur dafür verwendet.</p>
    <p class="sheet-hinweis">Die Wetterdaten holt der Grünzeug-Server bei Open-Meteo. Dein
      Gerät baut dafür keine Verbindung nach außen auf.</p>

    ${ort ? `<div class="karte">
        <div class="karte-kopf">${esc(ort.name)}</div>
        <div style="color:var(--text-2);font-size:14px">${esc(ort.region || '')}</div>
      </div>` : ''}

    <div class="field col" style="margin-bottom:12px">
      <label>Ort suchen</label>
      <input id="ort-suche" placeholder="z.B. Hannover" autocomplete="off">
    </div>
    <div id="ort-liste"></div>
    ${ort ? `<button class="btn sec" id="btn-ort-weg">Ort entfernen</button>` : ''}
    <button class="btn sec" data-close>Schließen</button>`;

  const feld = $('#ort-suche');
  let timer = null;
  feld.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => ortSuchen(feld.value), 400);
  };
  const weg = $('#btn-ort-weg');
  if (weg) weg.onclick = () => {
    delete DB.settings.ort;
    WETTER = null;
    try { localStorage.removeItem(WETTER_KEY); } catch (e) { /* egal */ }
    save(); renderAll(); closeSheets();
    toast('Ort entfernt');
  };
  openSheet('#sheet-ort');
  setTimeout(() => feld.focus(), 300);
}

async function ortSuchen(begriff) {
  const box = $('#ort-liste');
  if (!box) return;
  if ((begriff || '').trim().length < 2) { box.innerHTML = ''; return; }
  if (!SYNC.user) {
    box.innerHTML = `<div class="karte karte-ruhig" style="color:var(--text-2)">
      Dafür musst du angemeldet sein – die Suche läuft über den Server.</div>`;
    return;
  }
  box.innerHTML = `<div class="karte karte-ruhig" style="color:var(--text-2)">Suche …</div>`;
  try {
    const r = await api('/orte?q=' + encodeURIComponent(begriff));
    ortTreffer = r.ok ? (await r.json()).orte || [] : [];
  } catch (e) { ortTreffer = []; }

  box.innerHTML = ortTreffer.length
    ? ortTreffer.map((o, i) => `
        <button class="problem" data-ort="${i}">
          <span class="problem-emoji">📍</span>
          <span class="problem-titel">${esc(o.name)}<span style="color:var(--text-3)">${
            o.region ? ' · ' + esc(o.region) : ''}</span></span>
          <span class="problem-pfeil">›</span>
        </button>`).join('')
    : `<div class="karte karte-ruhig" style="color:var(--text-2)">Nichts gefunden.</div>`;
}

function ortWaehlen(i) {
  const o = ortTreffer[Number(i)];
  if (!o) return;
  DB.settings.ort = o;
  if (DB.settings.wetterAn === undefined) DB.settings.wetterAn = true;
  save();
  closeSheets();
  toast('Ort gesetzt: ' + o.name);
  wetterHolen(true);
  renderAll();
}

/* ---------- Behandlungen ----------
   Steht die Ursache fest, hilft ein Ratschlag allein wenig: Bei Schädlingen
   entscheidet die Wiederholung. Eine einmalige Behandlung erwischt nie alle
   Eier, drei Wochen später ist der Befall zurück – daran scheitern die
   meisten Versuche.

   Eine laufende Behandlung hängt deshalb als `behandlung` an der Pflanze und
   meldet sich wie jede andere Aufgabe: in der Tagesansicht, in der
   Detailansicht und per Push. Mehr als eine gleichzeitig gibt es nicht, das
   wäre nicht mehr zu überblicken. */

/** Die laufende Behandlung mit ihren Stammdaten, oder null. */
function behandlungVon(p) {
  const b = p && p.behandlung;
  if (!b || !b.start) return null;
  const problem = PROBLEME.find(x => x.id === b.problem);
  const ursache = problem && problem.ursachen[b.ursache];
  if (!ursache || !ursache.plan) return null;
  return { b, problem, ursache, plan: ursache.plan };
}

/** Alle Schritte mit Fälligkeitsdatum und Zustand. */
function behandlungSchritte(p) {
  const bh = behandlungVon(p);
  if (!bh) return [];
  const erledigt = new Set(bh.b.erledigt || []);
  return bh.plan.map((s, i) => {
    const faellig = fromISO(bh.b.start);
    faellig.setDate(faellig.getDate() + s.tag);
    return {
      i, text: s.text, tag: s.tag,
      faellig: toISO(faellig),
      tage: tageDiff(heute0(), faellig),
      erledigt: erledigt.has(i)
    };
  });
}

/** Was heute ansteht – auch alles Liegengebliebene. */
function behandlungOffen(p) {
  return behandlungSchritte(p).filter(s => !s.erledigt && s.tage <= 0);
}

/** Fällige Behandlungsschritte über alle Pflanzen. */
function faelligeBehandlungen() {
  const raus = [];
  for (const p of aktive()) {
    const offen = behandlungOffen(p);
    if (offen.length) raus.push({ pflanze: p, offen });
  }
  return raus;
}

/** „Sofort“, „Nach 3 Tagen“, „Nach 2 Wochen“ – der Abstand zum Start. */
function tagText(tag) {
  if (tag === 0) return 'Sofort';
  if (tag === 1) return 'Am nächsten Tag';
  if (tag % 7 === 0) {
    const w = tag / 7;
    return 'Nach ' + (w === 1 ? 'einer Woche' : w + ' Wochen');
  }
  return 'Nach ' + tag + ' Tagen';
}

/** Zeigt den Plan zu einer Ursache, mit Weg zum Start. */
function planZeigen(problemId, index) {
  const problem = PROBLEME.find(x => x.id === problemId);
  const ursache = problem && problem.ursachen[Number(index)];
  if (!ursache || !ursache.plan) return;

  // Schritte mit gleichem Abstand unter eine Überschrift
  const gruppen = [];
  for (const s of ursache.plan) {
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.tag === s.tag) letzte.texte.push(s.text);
    else gruppen.push({ tag: s.tag, texte: [s.text] });
  }

  const dauer = ursache.plan[ursache.plan.length - 1].tag;
  const p = hilfePflanze ? DB.plants.find(x => x.id === hilfePflanze) : null;
  const laeuft = p && behandlungVon(p);

  $('#hilfe-titel').textContent = ursache.was;
  $('#hilfe-inhalt').innerHTML =
    `<div class="karte karte-ruhig" style="color:var(--text-2);line-height:1.5">${esc(ursache.tun)}</div>` +
    `<div class="section-title mit-aktion"><span>Behandlungsplan</span>` +
    `<span style="text-transform:none;letter-spacing:0;font-weight:400">${
      ursache.plan.length} Schritte · ${dauer === 0 ? 'ein Tag' : dauer + ' Tage'}</span></div>` +
    gruppen.map(g => `
      <div class="plan-block">
        <div class="plan-wann">${tagText(g.tag)}</div>
        ${g.texte.map(t => `<div class="plan-schritt">${esc(t)}</div>`).join('')}
      </div>`).join('') +
    (laeuft
      ? `<div class="karte karte-ruhig" style="color:var(--text-2)">Für ${esc(p.name)} läuft bereits
           eine Behandlung. Sie muss erst beendet werden.</div>`
      : p
        ? `<button class="btn" data-beh-start="${problemId}" data-idx="${index}" data-pid="${p.id}">
             Behandlung für ${esc(p.name)} starten</button>`
        : `<div class="section-title">Für welche Pflanze?</div>` +
          (aktive().length
            ? aktive().map(x => `
                <button class="problem" data-beh-start="${problemId}" data-idx="${index}" data-pid="${x.id}">
                  <span class="problem-emoji">${x.emoji || '🪴'}</span>
                  <span class="problem-titel">${esc(x.name)}${
                    behandlungVon(x) ? ' · läuft schon' : ''}</span>
                  <span class="problem-pfeil">›</span>
                </button>`).join('')
            : `<div class="karte karte-ruhig" style="color:var(--text-2)">Noch keine Pflanzen angelegt.</div>`)) +
    `<button class="btn sec" data-problem-zurueck="${problemId}">Zurück</button>`;
}

/** Legt die Behandlung an und macht sie zur laufenden Aufgabe. */
function behandlungStarten(pid, problemId, index) {
  const p = DB.plants.find(x => x.id === pid);
  const problem = PROBLEME.find(x => x.id === problemId);
  const ursache = problem && problem.ursachen[Number(index)];
  if (!p || !ursache || !ursache.plan) return;
  if (behandlungVon(p)) { toast('Für ' + p.name + ' läuft schon eine Behandlung'); return; }

  // `tage` und `was` sind für den Server: Der Push-Versand kennt die Pläne
  // nicht und braucht die Abstände, um Fälligkeit zu rechnen.
  p.behandlung = {
    problem: problemId, ursache: Number(index),
    start: toISO(new Date()), erledigt: [],
    tage: ursache.plan.map(x => x.tag),
    was: ursache.was
  };
  DB.logs.push({ id: uid(), plantId: pid, typ: 'behandlung-start',
                 text: ursache.was, ts: Date.now() });
  save();
  renderAll();
  closeSheets();
  setTimeout(() => openDetail(pid), 180);
  toast('Behandlung gestartet: ' + ursache.was);
}

function behandlungSchrittErledigt(pid, i) {
  const p = DB.plants.find(x => x.id === pid);
  const bh = behandlungVon(p);
  if (!bh) return;
  const nummer = Number(i);
  const erledigt = new Set(bh.b.erledigt || []);
  if (erledigt.has(nummer)) return;
  erledigt.add(nummer);
  bh.b.erledigt = Array.from(erledigt).sort((a, b) => a - b);

  const fertig = bh.b.erledigt.length >= bh.plan.length;
  if (fertig) {
    DB.logs.push({ id: uid(), plantId: pid, typ: 'behandlung-ende',
                   text: bh.ursache.was, ts: Date.now() });
    delete p.behandlung;
  }
  save();
  renderAll();
  if ($('#sheet-detail').classList.contains('open')) openDetail(pid);
  if (navigator.vibrate) navigator.vibrate(12);
  toast(fertig ? '✅ Behandlung abgeschlossen: ' + bh.ursache.was
               : 'Schritt erledigt · noch ' + (bh.plan.length - bh.b.erledigt.length));
}

function behandlungBeenden(pid) {
  const p = DB.plants.find(x => x.id === pid);
  const bh = behandlungVon(p);
  if (!bh) return;
  const offen = bh.plan.length - (bh.b.erledigt || []).length;
  if (offen > 0 && !confirm('Behandlung „' + bh.ursache.was + '“ beenden?\n\n' +
      offen + ' von ' + bh.plan.length + ' Schritten sind noch offen.')) return;
  DB.logs.push({ id: uid(), plantId: pid, typ: 'behandlung-ende',
                 text: bh.ursache.was, ts: Date.now() });
  delete p.behandlung;
  save();
  renderAll();
  if ($('#sheet-detail').classList.contains('open')) openDetail(pid);
  toast('Behandlung beendet');
}

/** Die Karte in der Detailansicht. */
function behandlungKarteHTML(p) {
  const bh = behandlungVon(p);
  if (!bh) return '';
  const schritte = behandlungSchritte(p);
  const getan = schritte.filter(s => s.erledigt).length;
  const offen = schritte.filter(s => !s.erledigt && s.tage <= 0);
  const naechst = schritte.find(s => !s.erledigt && s.tage > 0);
  const seit = tageDiff(fromISO(bh.b.start), heute0());

  return `
    <div class="karte behandlung">
      <div class="karte-kopf">${bh.problem.emoji} In Behandlung · ${esc(bh.ursache.was)}</div>
      <div class="beh-fortschritt">
        <div class="beh-balken"><i style="width:${Math.round(getan / schritte.length * 100)}%"></i></div>
        <span>${getan} von ${schritte.length}</span>
      </div>
      <div class="beh-seit">Seit ${seit === 0 ? 'heute' : seit === 1 ? 'gestern' : seit + ' Tagen'}</div>
      ${offen.map(s => `
        <button class="tun" data-beh-schritt="${s.i}" data-pid="${p.id}">
          <span class="tun-kreis"></span>
          <span class="tun-text">${esc(s.text)}</span>
          ${s.tage < 0 ? `<span class="tun-spaet">${Math.abs(s.tage)} ${
            Math.abs(s.tage) === 1 ? 'Tag' : 'Tage'} zu spät</span>` : ''}
        </button>`).join('')}
      ${!offen.length && naechst ? `<div class="beh-warten">Nächster Schritt ${
        naechst.tage === 1 ? 'morgen' : 'in ' + naechst.tage + ' Tagen'}: ${esc(naechst.text)}</div>` : ''}
      <button class="btn sec" data-beh-ende="${p.id}">Behandlung beenden</button>
    </div>`;
}

/* ---------- Haltungsarten ----------
   Erde, Ableger im Wasserglas und Semi-Hydrokultur unterscheiden sich in
   fast allem: was zu tun ist, wie oft, und was daneben noch anfällt.

   Semi-Hydro (Blähton, Pon, Seramis) ist der Sonderfall: Das Substrat ist
   inert und liefert keine Nährstoffe. Gedüngt wird deshalb nicht gelegentlich,
   sondern bei jeder Wassergabe – schwach dosiert. Dafür sammeln sich Salze im
   Substrat, die regelmäßig ausgespült werden müssen. */

function haltungVon(p) {
  if (p.haltung) return p.haltung;
  return p.imWasser ? 'wasser' : 'erde';   // Altbestand vor v2.5.0
}

function istAbleger(p) { return haltungVon(p) === 'wasser'; }
function istHydro(p) { return haltungVon(p) === 'hydro'; }

/** Wortwahl für die Hauptaufgabe der jeweiligen Haltung. */
function wasserWorte(p) {
  switch (haltungVon(p)) {
    case 'wasser':
      return { titel: 'Wasser wechseln', partizip: 'Wasser gewechselt',
               emoji: '🫙', heute: 'Heute wechseln' };
    case 'hydro':
      return { titel: 'Nachfüllen', partizip: 'nachgefüllt',
               emoji: '💧', heute: 'Heute nachfüllen' };
    default:
      return { titel: 'Gießen', partizip: 'gegossen',
               emoji: '💧', heute: 'Heute gießen' };
  }
}

/** Kurzer Zusatz zur Aufgabe, der die Besonderheit der Haltung nennt. */
function wasserZusatz(p) {
  if (istHydro(p)) return 'mit Dünger';
  return p.menge ? esc(p.menge) : '';
}

const HALTUNG_NAME = { erde: 'in Erde', wasser: 'Ableger im Wasser',
                       hydro: 'Semi-Hydro' };

/** Wie lange steht der Ableger schon im Wasser? */
function abegerSeit(p) {
  if (!istAbleger(p) || !p.imWasserSeit) return null;
  const tage = tageDiff(fromISO(p.imWasserSeit), heute0());
  if (tage < 0) return null;
  if (tage < 14) return tage === 1 ? 'seit einem Tag' : `seit ${tage} Tagen`;
  const wochen = Math.round(tage / 7);
  return wochen < 9 ? `seit ${wochen} Wochen` : `seit ${Math.round(tage / 30)} Monaten`;
}

/** Aus dem Ableger wird eine eingetopfte Pflanze. */
function abelegerEintopfen(id) {
  const p = DB.plants.find(x => x.id === id);
  if (!p) return;
  if (!confirm(p.name + ' ist bewurzelt und kommt in Erde?\n\n' +
               'Ab dann erinnert die App ans Gießen statt ans Wasserwechseln.')) return;

  const art = artFinden(p.name) || artFinden(p.art);
  p.haltung = 'erde';
  delete p.imWasser;
  delete p.imWasserSeit;
  p.intervall = art ? art.iv : 7;
  p.letzt = toISO(new Date());
  if (art && !p.menge) p.menge = art.menge;
  if (art && !p.licht) p.licht = art.licht;
  if (art && art.w && !p.winterFaktor) p.winterFaktor = art.w;
  if (art && !Number(p.duengerInt)) {
    p.duengerInt = art.d;
    p.duengerLetzt = toISO(new Date());
  }
  DB.logs.push({ id: uid(), plantId: id, typ: 'eingetopft', ts: Date.now() });
  save();
  renderAll();
  openDetail(id);
  toast(p.name + ' ist eingetopft – jetzt alle ' + p.intervall + ' Tage gießen');
}

/* ---------- Mehrere Pflanzen in einem Topf ----------
   Eine Schale mit drei Arten wird einmal gegossen, nicht dreimal. Deshalb ist
   der Topf die Einheit: ein Gießintervall, eine Wassermenge. Die Arten darin
   stehen als Mitbewohner daneben – für Pflegehinweise und um zu prüfen, ob
   sie überhaupt zusammenpassen. */

function mitbewohner(p) {
  return Array.isArray(p.mitbewohner) ? p.mitbewohner : [];
}

/** Alle Arten im Topf, die Hauptpflanze eingeschlossen. */
function topfArten(p) {
  const namen = [{ name: p.name, art: p.art }].concat(mitbewohner(p));
  return namen.map(n => ({ ...n, treffer: artFinden(n.name) || artFinden(n.art) }))
              .filter(x => x.treffer);
}

/** Prüft, ob die Arten im Topf zusammenpassen.
    Zurück kommt ein Hinweis oder null. */
function topfPruefung(p) {
  const arten = topfArten(p);
  if (arten.length < 2) return null;

  const intervalle = arten.map(a => a.treffer.iv);
  const kuerzestes = Math.min(...intervalle);
  const laengstes = Math.max(...intervalle);
  const durstig = arten.find(a => a.treffer.iv === kuerzestes);
  const genuegsam = arten.find(a => a.treffer.iv === laengstes);

  const hinweise = [];

  if (laengstes >= kuerzestes * 3) {
    hinweise.push(`${durstig.treffer.n} braucht alle ${kuerzestes} Tage Wasser, ` +
      `${genuegsam.treffer.n} nur alle ${laengstes}. Das passt schlecht in einen Topf – ` +
      `nach der durstigen zu gießen ersäuft die genügsame.`);
  } else if (laengstes > kuerzestes) {
    hinweise.push(`Richte dich nach ${durstig.treffer.n} (alle ${kuerzestes} Tage), ` +
      `das ist die durstigste im Topf.`);
  }

  const lichter = Array.from(new Set(arten.map(a => a.treffer.licht)));
  if (lichter.length > 1) {
    hinweise.push('Unterschiedlicher Lichtbedarf: ' +
      arten.map(a => `${a.treffer.n} braucht „${a.treffer.licht}“`).join(', ') + '.');
  }

  return { kuerzestes, hinweise, arten };
}

/** Wassermenge nach Topfdurchmesser schätzen.

    Ein üblicher Topf fasst etwa 0,35 Liter je Kubik-Dezimeter Durchmesser
    (konisch, Höhe ungefähr gleich dem Durchmesser). Davon sind rund 15 %
    eine sinnvolle Gabe: genug, dass es unten ankommt, ohne zu schwemmen. */
function mengeAusTopf(durchmesser) {
  const d = Number(durchmesser) || 0;
  if (d < 5) return null;
  const ml = Math.round(0.0525 * d * d * d / 10) * 10;
  return ml >= 1000 ? (ml / 1000).toFixed(1).replace('.', ',') + ' l' : ml + ' ml';
}

/* ---------- Formular ---------- */

let topfListe = [];   // Mitbewohner im offenen Formular

function zeichneTopf() {
  const box = $('#topf-liste');
  box.innerHTML = topfListe.map((m, i) => `
    <div class="field">
      <input class="topf-name" data-topf-i="${i}" value="${esc(m.name)}"
             placeholder="Name der Pflanze" list="name-liste" autocomplete="off">
      <button class="topf-weg" data-topf-weg="${i}" title="Entfernen">✕</button>
    </div>`).join('');

  const p = { name: $('#f-name').value, art: $('#f-art').value, mitbewohner: topfListe };
  const pruefung = topfPruefung(p);
  const hinweis = $('#topf-hinweis');
  if (pruefung && pruefung.hinweise.length) {
    hinweis.innerHTML = pruefung.hinweise.map(h => `<p>${esc(h)}</p>`).join('') +
      `<button type="button" class="aktion" id="btn-topf-intervall">Auf ${
        pruefung.kuerzestes} Tage stellen</button>`;
    hinweis.hidden = false;
    $('#btn-topf-intervall').onclick = () => {
      $('#f-intervall').value = pruefung.kuerzestes;
      toast('Intervall auf ' + pruefung.kuerzestes + ' Tage gesetzt');
    };
  } else {
    hinweis.hidden = true;
  }
}

function bindeTopf() {
  $('#btn-topf-neu').onclick = () => {
    if (topfListe.length >= 5) { toast('Mehr als sechs Pflanzen in einem Topf sind selten'); return; }
    topfListe.push({ name: '', art: '' });
    zeichneTopf();
    const felder = $$('#topf-liste .topf-name');
    if (felder.length) felder[felder.length - 1].focus();
  };

  $('#topf-liste').oninput = e => {
    const i = e.target.dataset.topfI;
    if (i === undefined) return;
    topfListe[i].name = e.target.value;
    const treffer = artFinden(e.target.value);
    topfListe[i].art = treffer ? treffer.art : '';
    clearTimeout(bindeTopf._t);
    bindeTopf._t = setTimeout(() => {
      const stelle = document.activeElement === e.target;
      zeichneTopf();
      if (stelle) {
        const feld = $(`#topf-liste [data-topf-i="${i}"]`);
        if (feld) { feld.focus(); feld.setSelectionRange(feld.value.length, feld.value.length); }
      }
    }, 600);
  };

  $('#f-topfgroesse').oninput = e => {
    const vorschlag = mengeAusTopf(e.target.value);
    const hinweis = $('#topf-menge-hinweis');
    if (!vorschlag) { hinweis.hidden = true; return; }
    hinweis.innerHTML = `<span>Für ${esc(e.target.value)} cm Durchmesser etwa ${vorschlag}` +
      `${topfListe.length ? ' – unabhängig davon, wie viele Pflanzen darin stehen' : ''}.</span>` +
      `<button type="button" class="aktion" id="btn-menge-uebernehmen">Übernehmen</button>`;
    hinweis.hidden = false;
    $('#btn-menge-uebernehmen').onclick = () => {
      $('#f-menge').value = vorschlag;
      hinweis.hidden = true;
      toast('Wassermenge übernommen');
    };
  };
}

/* ---------- Frühere Stände ----------
   Der Server hebt die letzten Stände auf. Das ist die Rückversicherung gegen
   den Fall, dass hier versehentlich alles gelöscht wird – der Sync verteilt
   so etwas sonst binnen Sekunden auf alle Geräte. */
async function zeigeStaende() {
  const box = $('#staende-inhalt');
  box.innerHTML = '<div class="empty"><p>Wird geladen …</p></div>';
  openSheet('#sheet-staende');

  if (!SYNC.user) {
    box.innerHTML = `<div class="empty"><div class="big">🔒</div>
      <p>Frühere Stände liegen auf dem Server.</p>
      <p>Dafür musst du angemeldet sein.</p></div>`;
    return;
  }

  let liste;
  try {
    const r = await api('/versionen');
    if (!r.ok) throw new Error('Status ' + r.status);
    liste = (await r.json()).versionen;
  } catch (e) {
    box.innerHTML = `<div class="empty"><div class="big">📡</div>
      <p>Server nicht erreichbar.</p></div>`;
    return;
  }

  if (!liste.length) {
    box.innerHTML = `<div class="empty"><div class="big">🕰</div>
      <p>Noch keine früheren Stände.</p>
      <p>Sie entstehen beim Speichern – stündlich und immer dann,
         wenn Pflanzen verschwinden.</p></div>`;
    return;
  }

  box.innerHTML =
    `<p style="color:var(--text-2);font-size:14px;margin:0 0 14px">
       Ein Stand ersetzt deine aktuellen Daten auf allen Geräten. Der bisherige
       Stand wird vorher gesichert, du kannst also zurück.</p>` +
    `<div class="group">` + liste.map(v => {
      const d = new Date(v.erstellt);
      const heute = d.toDateString() === new Date().toDateString();
      const wann = heute
        ? 'heute ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        : d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }) +
          ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      return `<div class="field">
        <label>${wann}<br><span style="color:var(--text-2);font-size:13px">${
          v.pflanzen === 1 ? '1 Pflanze' : v.pflanzen + ' Pflanzen'}</span></label>
        <button class="aktion" data-stand="${v.id}" data-anzahl="${v.pflanzen}"
          style="background:none;padding:0">Wiederherstellen</button>
      </div>`;
    }).join('') + `</div>`;
}

async function standWiederherstellen(id, anzahl) {
  const jetzt = DB.plants.length;
  const text = 'Diesen Stand wiederherstellen?\n\n' +
    'Danach: ' + (anzahl === 1 ? '1 Pflanze' : anzahl + ' Pflanzen') + '\n' +
    'Aktuell: ' + (jetzt === 1 ? '1 Pflanze' : jetzt + ' Pflanzen') + '\n\n' +
    'Der jetzige Stand wird vorher gesichert und lässt sich zurückholen.';
  if (!confirm(text)) return;

  try {
    const r = await api('/versionen/' + encodeURIComponent(id) + '/wiederherstellen',
                        { method: 'POST' });
    if (!r.ok) throw new Error('Status ' + r.status);
    const antwort = await r.json();
    uebernehmeServer({ rev: antwort.rev, daten: antwort.daten });
    closeSheets();
    toast('Stand wiederhergestellt');
  } catch (e) {
    toast('Wiederherstellen fehlgeschlagen');
  }
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

/* Ein gescannter QR-Code kann auf einem Gerät landen, das die Pflanzen noch
   gar nicht hat – etwa in Safari statt in der installierten App. Deshalb wird
   die Kennung gemerkt und mehrfach versucht: sofort, nach dem Abgleich mit dem
   Server und nach einer Anmeldung. */
let offeneKennung = null;

function hashMerken() {
  const treffer = /^#p=([A-Za-z0-9_-]+)$/.exec(location.hash || '');
  if (!treffer) return;
  offeneKennung = treffer[1];
  history.replaceState(null, '', location.pathname + location.search);
}

/** Versucht, die gemerkte Pflanze zu öffnen.
    @param endgueltig - letzter Versuch, sonst still abwarten */
function hashOeffnen(endgueltig) {
  if (!offeneKennung) return;
  const id = offeneKennung;
  const p = DB.plants.find(x => x.id === id);
  if (p) {
    offeneKennung = null;
    if (p.archiviert) toast(p.name + ' liegt im Archiv');
    setTimeout(() => openDetail(id), 200);
    return;
  }
  if (endgueltig) {
    offeneKennung = null;
    toast('Diese Pflanze gibt es in diesem Konto nicht');
  }
}

/** Blendet ein Formularfeld samt Zeile aus oder ein. */
function feldZeigen(wahl, zeigen) {
  const feld = $(wahl);
  const zeile = feld && feld.closest('.field');
  if (zeile) zeile.hidden = !zeigen;
}

/** Passt das Formular an die gewählte Haltung an. */
function haltungAnzeigen() {
  const art = $('#f-haltung').value;
  const wasser = art === 'wasser';
  const hydro = art === 'hydro';
  const erde = art === 'erde';

  $('#titel-giessen').textContent = wasser ? 'Wasser wechseln'
    : hydro ? 'Nachfüllen und düngen' : 'Gießen';
  $('#label-letzt').textContent = wasser ? 'Zuletzt gewechselt'
    : hydro ? 'Zuletzt nachgefüllt' : 'Zuletzt gegossen';

  $('#feld-wasser-seit').hidden = !wasser;
  $('#feld-spuelen').hidden = !hydro;
  $('#feld-spuelen-letzt').hidden = !hydro;

  // Erde-Themen: nur in Erde
  feldZeigen('#f-topfgroesse', erde);
  feldZeigen('#f-umtopfen-int', erde);
  feldZeigen('#f-umtopfen-letzt', erde);
  feldZeigen('#f-menge', !wasser);
  feldZeigen('#f-schneiden-int', !wasser);
  feldZeigen('#f-schneiden-letzt', !wasser);
  feldZeigen('#f-winter', !wasser);

  // In Semi-Hydro wird bei jeder Gabe gedüngt – ein eigenes Intervall wäre falsch
  feldZeigen('#f-duenger-int', erde);
  feldZeigen('#f-duenger-letzt', erde);

  // Für einen Steckling gelten andere Regeln – phaseAnzeigen entscheidet zuletzt
  if ($('#f-phase')) phaseAnzeigen();

  const hinweis = $('#hydro-hinweis');
  if (hydro) {
    hinweis.innerHTML = '<p>Blähton, Pon und Seramis enthalten keine Nährstoffe. ' +
      'Gedüngt wird deshalb bei <b>jeder</b> Wassergabe, dafür schwach dosiert – ' +
      'ein eigenes Düngeintervall gibt es hier nicht.</p>' +
      '<p>Weil sich dabei Salze im Substrat sammeln, sollte es alle paar Wochen ' +
      'unter fließendem Wasser durchgespült werden.</p>';
    hinweis.hidden = false;
  } else {
    hinweis.hidden = true;
  }
}

/* ---------- Sheets ---------- */
/* Alle Sheets haben denselben z-index, also entscheidet die Reihenfolge im
   HTML, welches oben liegt. Ein aus der Detailansicht geöffnetes Sheet stünde
   dort weiter oben und läge damit darunter – es sah aus, als passiere nichts.
   Deshalb wandert das zuletzt geöffnete nach vorne. */
let sheetEbene = 100;

function openSheet(sel) {
  const el = $(sel);
  if (!el) { console.warn('Sheet fehlt:', sel); return; }
  el.style.zIndex = ++sheetEbene;
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSheets() {
  $$('.sheet').forEach(s => { s.classList.remove('open'); s.style.zIndex = ''; });
  sheetEbene = 100;
  document.body.style.overflow = '';
}

/* Die Vorschlagslisten für Name und Art.

   ARTEN selbst bleibt in seiner gewachsenen Reihenfolge: artFinden nimmt den
   ersten Treffer, und die Reihenfolge entscheidet dort mit, welche Art bei
   mehrdeutigen Namen gewinnt. Sortiert wird deshalb nur die Anzeige.

   Bei „Art" fallen Einträge ohne botanischen Namen auf den deutschen zurück,
   und mehrere Sorten teilen sich eine Gattung – doppelte Einträge fliegen
   deshalb raus. */
function vorschlagslisten() {
  const alphabetisch = liste => Array.from(new Set(liste))
    .sort((a, b) => a.localeCompare(b, 'de'))
    .map(v => `<option value="${esc(v)}">`).join('');

  $('#art-liste').innerHTML = alphabetisch(ARTEN.map(a => a.art || a.n));
  $('#name-liste').innerHTML = alphabetisch(ARTEN.map(a => a.n));
}

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
  $('#f-topfgroesse').value = p ? (p.topfGroesse || '') : '';
  $('#f-haltung').value = p ? haltungVon(p) : 'erde';
  $('#f-wasser-seit').value = p ? (p.imWasserSeit || '') : toISO(new Date());
  $('#f-spuelen-int').value = p ? (p.spuelenTage || 42) : 42;
  $('#f-spuelen-letzt').value = p ? (p.spuelenLetzt || '') : toISO(new Date());
  haltungAnzeigen();
  topfListe = p ? mitbewohner(p).map(m => ({ ...m })) : [];
  $('#topf-menge-hinweis').hidden = true;
  zeichneTopf();
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
  $('#f-freiland').value = p ? freilandVon(p) : 'nein';
  $('#f-mintemp').value = String(p ? kaelteGrenze(p) : 8);
  $('#f-draussen').checked = !!(p && p.draussen);
  $('#f-phase').value = p ? phaseVon(p) : 'erwachsen';
  $('#f-methode').value = p ? (p.methode || (istAbleger(p) ? 'wasser' : 'erde')) : 'wasser';
  $('#f-phase-seit').value = p ? (p.phaseSeit || p.imWasserSeit || '') : toISO(new Date());
  editUmgebung = p ? umgebungVon(p).slice() : [];
  editEigene = p ? eigeneVon(p).map(e => Object.assign({}, e)) : [];
  zeichneUmgebung();
  zeichneEigene();
  phaseAnzeigen();
  freilandAnzeigen();
  $('#btn-delete').style.display = p ? 'block' : 'none';
  $('#btn-foto-del').style.display = editFoto ? 'block' : 'none';
  renderEmojiPick();
  vorschlagslisten();
  $('#art-vorschlag').hidden = true;
  if (p) artVorschlagPruefen();
  openSheet('#sheet-edit');
  if (!p) setTimeout(() => $('#f-name').focus(), 300);
}

/* Auswahl der Umgebungsmerkmale im Formular. Bewusst Chips statt
   Kontrollkästchen: Es sind sieben Stück, und mehrere treffen fast immer zu. */
let editUmgebung = [];

function zeichneUmgebung() {
  $('#umgebung-wahl').innerHTML = UMGEBUNG.map(u => `
    <button type="button" class="chip ${editUmgebung.includes(u.k) ? 'on' : ''}"
            data-umgebung="${u.k}">${u.emoji} ${esc(u.name)}</button>`).join('');
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
    topfGroesse: Number($('#f-topfgroesse').value) || 0,
    haltung: $('#f-haltung').value,
    imWasserSeit: $('#f-haltung').value === 'wasser'
      ? ($('#f-wasser-seit').value || toISO(new Date())) : '',
    freiland: $('#f-freiland').value,
    minTemp: $('#f-freiland').value === 'nein' ? null : Number($('#f-mintemp').value),
    draussen: $('#f-freiland').value !== 'nein' && $('#f-draussen').checked,
    freiland: $('#f-freiland').value,
    minTemp: $('#f-freiland').value === 'nein' ? null : Number($('#f-mintemp').value),
    draussen: $('#f-freiland').value !== 'nein' && $('#f-draussen').checked,
    phase: $('#f-phase').value,
    methode: $('#f-phase').value === 'steckling' ? $('#f-methode').value : '',
    phaseSeit: $('#f-phase').value === 'erwachsen' ? ''
      : ($('#f-phase-seit').value || toISO(new Date())),
    umgebung: editUmgebung.slice(),
    eigene: editEigene.map(e => Object.assign({}, e)),
    spuelenTage: $('#f-haltung').value === 'hydro'
      ? Math.max(0, Number($('#f-spuelen-int').value) || 0) : 0,
    spuelenLetzt: $('#f-haltung').value === 'hydro'
      ? ($('#f-spuelen-letzt').value || toISO(new Date())) : '',
    mitbewohner: topfListe.filter(m => m.name.trim()).map(m => ({
      name: m.name.trim(), art: m.art || ''
    })),
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

/** Fortschrittsring als SVG: zeigt, wie weit das Intervall aufgebraucht ist. */
function ringHTML(anteil, farbe, inhalt) {
  const r = 26, umfang = 2 * Math.PI * r;
  const gefuellt = Math.max(0, Math.min(1, anteil)) * umfang;
  return `<div class="ring">
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle class="ring-bahn" cx="32" cy="32" r="${r}"></circle>
      <circle class="ring-wert" cx="32" cy="32" r="${r}"
        stroke="${farbe}" stroke-dasharray="${gefuellt} ${umfang}"></circle>
    </svg>
    <span class="ring-inhalt">${inhalt}</span>
  </div>`;
}

/** Eine Kachel im Kopf der Detailansicht: Ring, Aufgabe, Fälligkeit. */
function statusKachel(titel, tage, anteil, symbol, letztDatum) {
  const farbe = tage < 0 ? 'var(--red)' : tage === 0 ? 'var(--accent)'
    : tage <= 2 ? 'var(--orange)' : 'var(--accent)';
  const wann = tage < 0 ? (Math.abs(tage) === 1 ? '1 Tag überfällig' : Math.abs(tage) + ' Tage überfällig')
    : tage === 0 ? 'Heute' : tage === 1 ? 'Morgen' : 'in ' + tage + ' Tagen';
  return `<div class="status-kachel">
    ${ringHTML(anteil, farbe, symbol)}
    <div class="status-titel">${esc(titel)}</div>
    <div class="status-wann" style="color:${farbe}">${wann}</div>
    ${letztDatum ? `<div class="status-letzt">zuletzt ${letztDatum}</div>` : ''}
  </div>`;
}

let offeneDetailId = null;

function openDetail(id) {
  const p = DB.plants.find(x => x.id === id);
  if (!p) return;
  if (!$('#sheet-detail').classList.contains('open')) { erledigtAm = null; verlaufLang = false; }
  if (offeneDetailId !== id) { verlaufLang = false; offeneDetailId = id; }

  const iv = effIntervall(p);
  const t = tageBis(p);
  const anteil = 1 - (t / iv);
  const datum = wert => wert ? fromISO(wert).toLocaleDateString('de-DE',
    { day: 'numeric', month: 'short' }) : null;

  // Offene Aufgaben: Gießen bzw. Wasserwechsel plus alles, was sonst ansteht
  const w = wasserWorte(p);
  const offen = [];
  if (t <= 0) offen.push({ art: 'wasser', titel: w.titel, tage: t,
                           zusatz: istAbleger(p) ? '' : wasserZusatz(p) });
  for (const { a, tage } of offeneAufgaben(p)) {
    offen.push({ art: a.schluessel, titel: a.name, tage, zusatz: '' });
  }

  const kacheln = [statusKachel(w.titel, t, anteil, w.emoji, datum(p.letzt))]
    .concat(aufgabenVon(p).map(a => {
      const at = tageBisAufgabe(a);
      if (at === null) return '';
      const gesamt = a.einheit === 'monate' ? a.intervall * 30 : a.intervall;
      return statusKachel(a.name, at, 1 - (at / Math.max(1, gesamt)), a.emoji, datum(a.letzt));
    })).join('');

  $('#detail-body').innerHTML = `
    <div class="grabber"></div>

    <div class="hero">
      ${p.foto
        ? `<img src="${p.foto}" alt="">`
        : `<div class="hero-emoji">${p.emoji || '🪴'}</div>`}
      <div class="hero-chips">
        ${p.raum ? `<span class="hero-chip">${esc(p.raum)}</span>` : ''}
        ${zustandVon(p) !== 'gut'
          ? `<span class="hero-chip warn">${
              ZUSTAENDE.find(x => x.k === zustandVon(p)).emoji} ${
              esc(ZUSTAENDE.find(x => x.k === zustandVon(p)).kurz)}</span>` : ''}
        <span class="hero-chip ${statusOf(p)}">${statusText(p)}</span>
      </div>
    </div>

    <h2 class="detail-name">${esc(p.name)}</h2>
    ${p.art ? `<p class="detail-art">${esc(p.art)}</p>` : ''}
    ${istAbleger(p) && !istSteckling(p) ? `<div class="topf-arten">
      <span class="topf-art">🫙 Ableger im Wasser</span>
      ${abegerSeit(p) ? `<span class="topf-art">${esc(abegerSeit(p))}</span>` : ''}
    </div>` : ''}
    ${istHydro(p) ? `<div class="topf-arten">
      <span class="topf-art">🪨 Semi-Hydro</span>
      <span class="topf-art">Dünger bei jeder Gabe</span>
    </div>` : ''}
    ${freilandChipsHTML(p)}
    ${freilandChipsHTML(p)}
    ${phaseChipsHTML(p)}
    ${raumChipHTML(p) ? `<div class="topf-arten">${raumChipHTML(p)}</div>` : ''}
    ${umgebungChipsHTML(p)}
    ${mitbewohner(p).length ? `<div class="topf-arten">
      <span class="topf-art">im selben Topf:</span>
      ${mitbewohner(p).map(m => `<span class="topf-art">${esc(m.name)}</span>`).join('')}
    </div>` : ''}

    <div class="status-reihe">${kacheln}</div>

    ${freilandVon(p) !== 'nein' ? `
      <div class="karte">
        <div class="karte-kopf">${stehtDraussen(p) ? '🌤 Steht draußen' : '🏠 Steht drinnen'}</div>
        ${(() => { const n = stehtDraussen(p) ? kalteNacht(p) : null;
          return n ? `<div class="beh-warten" style="color:var(--red)">${nachtText(n.datum)} nur ${
            String(n.tmin).replace('.', ',')} °C – sie verträgt ${
            String(kaelteGrenze(p)).replace('.', ',')} °C.</div>` : ''; })()}
        ${freilandVorschlag(p) ? `<div class="beh-warten">${esc(freilandVorschlag(p))}</div>` : ''}
        <button class="btn sec" data-draussen="${p.id}">${
          stehtDraussen(p) ? '🏠 Ist reingeholt' : '🌤 Steht jetzt draußen'}</button>
      </div>` : ''}
    ${zustandKarteHTML(p)}
    ${phaseKarteHTML(p)}
    ${behandlungKarteHTML(p)}

    ${offen.length ? `
      <div class="karte">
        <div class="karte-kopf">Heute zu tun</div>
        ${offen.map(o => `
          <button class="tun" data-tun="${o.art}" data-pid="${p.id}">
            <span class="tun-kreis"></span>
            <span class="tun-text">${esc(o.titel)}${o.zusatz ? ' · ' + o.zusatz : ''}</span>
            ${o.tage < 0 ? `<span class="tun-spaet">${Math.abs(o.tage)} ${
              Math.abs(o.tage) === 1 ? 'Tag' : 'Tage'} zu spät</span>` : ''}
          </button>`).join('')}
        ${offen.length > 1 ? `<button class="btn" data-alles-hier="${p.id}">Alles erledigen</button>` : ''}
        ${offen.some(o => o.art === 'umtopfen')
          ? `<button class="btn sec" data-anleitung="umtopfen" data-pid="${p.id}">
               🪴 Anleitung zum Umtopfen</button>` : ''}
        <button class="btn sec" data-aufschub-frage="${p.id}">Noch nicht – später erinnern</button>
        <div class="wann-zeile">
          <span class="wann-text">Erledigt am</span>
          <input type="date" id="erledigt-datum" max="${toISO(new Date())}"
                 value="${erledigtAm || toISO(new Date())}">
        </div>
      </div>` : behandlungOffen(p).length ? '' : `
      <div class="karte karte-ruhig">
        <div class="tun-text" style="text-align:center;color:var(--text-2)">
          ${aufschubTageBis(p) !== null
            ? 'Verschoben auf den ' + fromISO(p.aufschubBis).toLocaleDateString('de-DE',
                { day: 'numeric', month: 'long' }) + '.'
            : 'Nichts zu tun. Nächstes Gießen ' + statusText(p).toLowerCase() + '.'}</div>
        ${aufschubTageBis(p) !== null
          ? `<button class="btn sec" data-aufschub="0" data-pid="${p.id}">Aufschub aufheben</button>`
          : ''}
      </div>`}

    ${abschnittHTML('pflege', 'Pflege', `
      <div class="group">
        <div class="field"><label>${istAbleger(p) ? 'Wasserwechsel'
          : istHydro(p) ? 'Nachfüllen' : 'Gießintervall'}</label><span class="hint">alle ${p.intervall} Tage${
          winterAktiv() && effIntervall(p) !== Number(p.intervall) ? ' · Winter: ' + effIntervall(p) : ''}${
          wetterFaktor(p) !== 1 ? ' · Hitze: ' + effIntervall(p) : ''}</span></div>
        ${p.winterFaktor ? `<div class="field"><label>Winterruhe</label><span class="hint">×${
          String(p.winterFaktor).replace('.', ',')}</span></div>` : ''}
        ${p.menge ? `<div class="field"><label>Wassermenge</label><span class="hint">${esc(p.menge)}</span></div>` : ''}
        ${p.licht ? `<div class="field"><label>Licht</label><span class="hint">${esc(p.licht)}</span></div>` : ''}
        ${raumBereich(p.raum) ? `<div class="field"><label>Raumtemperatur</label>
          <span class="hint">${raumBereich(p.raum)[0]}–${raumBereich(p.raum)[1]} °C ${
          istWinterzeit() ? 'im Winter' : 'im Sommer'}</span></div>` : ''}
        ${aufgabenVon(p).map(a => `<div class="field"><label>${a.emoji} ${esc(a.name)}</label>
          <span class="hint">alle ${a.intervall} ${a.einheit === 'monate' ? 'Monate' : 'Tage'}</span></div>`).join('')}
      </div>
      ${p.notiz ? `<div class="karte" style="white-space:pre-wrap;color:var(--text-2)">${esc(p.notiz)}</div>` : ''}`)}

    ${abschnittHTML('fotos', `Fotoverlauf (${fotosVon(p).length})`, fotoGalerieHTML(p))}

    ${verlaufHTML(p)}

    ${abschnittHTML('mehr', 'Mehr zu dieser Pflanze', `
      ${istAbleger(p) && !istSteckling(p) ? `<button class="btn sec" data-eintopfen="${p.id}">🪴 Ist bewurzelt, kommt in Erde</button>` : ''}
      <button class="btn sec" data-hilfe="${p.id}">${
        behandlungVon(p) ? 'Weiteres Problem?' : 'Problem mit dieser Pflanze?'}</button>
      <button class="btn sec" data-licht="${p.id}">💡 Licht am Standort messen</button>
      <button class="btn sec" data-anleitung="umtopfen" data-pid="${p.id}">🪴 Anleitung zum Umtopfen</button>
      <button class="btn sec" data-qr="${p.id}">QR-Code für den Topf</button>
      ${p.archiviert
        ? `<button class="btn sec" data-entarchiv="${p.id}">Zurück in die Liste</button>`
        : `<button class="btn sec" data-archiv="${p.id}">Archivieren</button>`}
      <button class="btn danger" data-del="${p.id}">Pflanze löschen</button>`)}

    <button class="btn sec" data-edit="${p.id}">Bearbeiten</button>
    <button class="btn sec" data-close>Schließen</button>
  `;
  const feld = $('#erledigt-datum');
  if (feld) feld.onchange = e => {
    const heute = toISO(new Date());
    erledigtAm = e.target.value && e.target.value !== heute ? e.target.value : null;
    if (erledigtAm) {
      toast('Wird auf den ' + fromISO(erledigtAm).toLocaleDateString('de-DE') + ' eingetragen');
    }
  };
  openSheet('#sheet-detail');
}

/** Erledigt eine einzelne offene Aufgabe aus der Detailansicht. */
function tunErledigt(pid, art) {
  if (art === 'wasser') giessen(pid);
  else aufgabeErledigt(pid, art);
}

/** Alles, was bei dieser Pflanze gerade offen ist, in einem Zug. */
function allesHier(pid) {
  const p = DB.plants.find(x => x.id === pid);
  if (!p) return;
  const heute = erledigtAm || toISO(new Date());
  const eintraege = [];

  if (tageBis(p) <= 0) {
    const logId = uid();
    eintraege.push({ feld: 'letzt', plantId: pid, vorher: p.letzt, logId });
    p.letzt = heute;
    delete p.aufschubBis;
    DB.logs.push({ id: logId, plantId: pid, typ: 'wasser', ts: zeitstempel(heute) });
  }
  for (const { a } of offeneAufgaben(p)) {
    const logId = uid();
    eintraege.push(aufgabeEintrag(p, a, logId));
    aufgabeSetzen(p, a, heute);
    DB.logs.push({ id: logId, plantId: pid, typ: a.schluessel, ts: zeitstempel(heute) });
  }
  if (!eintraege.length) return;

  letzteAktion = { eintraege };
  save();
  renderAll();
  openDetail(pid);
  if (navigator.vibrate) navigator.vibrate(14);
  toast(p.name + ': ' + eintraege.length + ' erledigt', abhakAktionen(heute));
}

/** Beschriftung eines Verlaufseintrags. */
function logText(typ, text) {
  if (typ === 'notiz') return '📝 ' + (text || 'Notiz');
  if (String(typ).startsWith('eigen:')) return '📌 ' + eigenName(typ);
  if (typ === 'licht') return '💡 Licht gemessen';
  if (typ === 'rausgestellt') return '🌤 Nach draußen gestellt';
  if (typ === 'reingeholt') return '🏠 Reingeholt';
  if (typ === 'zustand') return '🩺 Zustand: ' + (text || 'geändert');
  if (typ === 'bewurzelt') return '🌿 Bewurzelt, jetzt Jungpflanze';
  if (typ === 'ausgewachsen') return '🪴 Ausgewachsen';
  if (typ === 'behandlung-start') return '🩹 Behandlung begonnen';
  if (typ === 'behandlung-ende') return '🩹 Behandlung beendet';
  if (typ === 'wasser') return '💧 Gegossen';
  if (typ === 'eingetopft') return '🪴 In Erde gepflanzt';
  const a = AUFGABEN.find(x => x.schluessel === typ);
  return a ? a.emoji + ' ' + a.partizip.charAt(0).toUpperCase() + a.partizip.slice(1) : typ;
}

/* ---------- Foto ---------- */
function fotoVerarbeiten(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const max = zielKante(560, 1100);
      const f = Math.min(max / img.width, max / img.height, 1);
      let quelle = img, b = img.width, h = img.height;
      const zielB = Math.max(1, Math.round(img.width * f));
      const zielH = Math.max(1, Math.round(img.height * f));
      while (b > zielB * 2) {
        b = Math.round(b / 2); h = Math.round(h / 2);
        quelle = aufLeinwand(quelle, b, h);
      }
      editFoto = aufLeinwand(quelle, zielB, zielH).toDataURL('image/jpeg', 0.74);
      $('#btn-foto-del').style.display = 'block';
      renderEmojiPick();
      toast('Foto übernommen');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/** Zeigt in den Einstellungen, was wie viel Platz braucht. */
function speicherAnzeigen() {
  const zeile = $('#dat-speicher');
  if (!zeile) return;
  const daten = speicherBytes();
  zeile.textContent = byteText(daten) + ' Daten';
  bilderGroesse().then(({ anzahl, bytes }) => {
    if (!$('#dat-speicher')) return;
    $('#dat-speicher').textContent = byteText(daten) + ' Daten · ' +
      (anzahl ? anzahl + ' Bilder (' + byteText(bytes) + ')' : 'keine Bilder');
  });
  verwaisteBilder().then(liste => {
    const zeile2 = $('#zeile-verwaist');
    if (!zeile2) return;
    zeile2.hidden = !liste.length;
    if (liste.length) {
      $('#dat-verwaist').textContent = liste.length +
        (liste.length === 1 ? ' Bild ohne Pflanze ›' : ' Bilder ohne Pflanze ›');
    }
  });
}

/* ---------- Alles löschen ----------
   Die gefährlichste Schaltfläche der App: Sie räumt nicht nur dieses Gerät
   leer, sondern schiebt den leeren Stand über den Sync innerhalb von Sekunden
   auf alle anderen. Eine einzelne Rückfrage im Vorbeigehen ist dafür zu wenig.

   Deshalb steht hier, was genau verschwindet, was der Weg zurück ist, und der
   Knopf wird erst nach einer bewussten Bestätigung scharf. */
function allesLoeschenOeffnen() {
  const pflanzen = DB.plants.length;
  const eintraege = DB.logs.length;

  $('#loeschen-inhalt').innerHTML = `
    <div class="grabber"></div>
    <h2>Alle Daten löschen</h2>
    <p class="sheet-hinweis">Das betrifft nicht nur dieses Gerät: Bist du angemeldet,
      ist der leere Stand in wenigen Sekunden auch auf allen anderen.</p>

    <div class="section-title">Was gelöscht wird</div>
    <div class="group">
      <div class="field"><label>Pflanzen</label><span class="hint">${pflanzen}</span></div>
      <div class="field"><label>Verlaufseinträge</label><span class="hint">${eintraege}</span></div>
      <div class="field"><label>Fotos</label><span class="hint" id="loesch-bilder">…</span></div>
      <div class="field"><label>Einstellungen</label><span class="hint">bleiben erhalten</span></div>
    </div>

    <div class="section-title">Der Weg zurück</div>
    <div class="karte" style="color:var(--text-2);line-height:1.5">
      ${SYNC.user
        ? 'Der jetzige Stand wird auf dem Server als Version abgelegt. Unter ' +
          '<b>Mehr → Frühere Stände wiederherstellen</b> kannst du ihn zurückholen – ' +
          'solange du dich nicht abmeldest und keine sieben neueren Stände entstehen.'
        : 'Du bist nicht angemeldet. Damit gibt es <b>keinen Weg zurück</b> – ' +
          'ohne Server werden keine früheren Stände gesichert.'}
    </div>

    <button class="btn sec" id="btn-loesch-export">Vorher sichern (JSON)</button>

    <label class="bestaetigung">
      <input type="checkbox" id="loesch-sicher">
      <span>Ja, ich will ${pflanzen === 1 ? 'die Pflanze' : 'alle ' + pflanzen + ' Pflanzen'}
        und den gesamten Verlauf löschen</span>
    </label>

    <button class="btn danger" id="btn-loesch-jetzt" disabled>Endgültig löschen</button>
    <button class="btn sec" data-close>Abbrechen</button>`;

  bilderGroesse().then(({ anzahl, bytes }) => {
    const z = $('#loesch-bilder');
    if (z) z.textContent = anzahl ? anzahl + ' (' + byteText(bytes) + ')' : 'keine';
  });

  $('#loesch-sicher').onchange = e => {
    $('#btn-loesch-jetzt').disabled = !e.target.checked;
  };
  $('#btn-loesch-export').onclick = exportieren;
  $('#btn-loesch-jetzt').onclick = allesLoeschen;

  openSheet('#sheet-loeschen');
}

async function allesLoeschen() {
  const anzahl = DB.plants.length;

  // Die Bilder gehören dazu – sie lägen sonst als Datenmüll in IndexedDB
  const schluessel = Object.keys(bilderSammeln());
  DB.plants = [];
  DB.logs = [];
  save();
  await Promise.all(schluessel.map(bildLoeschen)).catch(() => {});

  renderAll();
  closeSheets();
  toast(anzahl ? 'Alles gelöscht (' + anzahl + ' Pflanzen)' : 'Es war nichts da',
        SYNC.user ? 'Frühere Stände' : null,
        SYNC.user ? zeigeStaende : null);
}

/* ---------- Sicherungen auf dem Server ----------
   Die Datenbank wird nachts um halb vier automatisch gesichert, sieben Tage
   werden aufgehoben. Von Hand ging das bisher nur per SSH – für einen kurzen
   Blick vor einer größeren Änderung ist das zu umständlich. */
function sicherungenOeffnen() {
  if (!SYNC.user) {
    toast('Dafür musst du angemeldet sein – gesichert wird auf dem Server');
    return;
  }
  $('#sicherung-inhalt').innerHTML = `
    <div class="grabber"></div>
    <h2>Sicherungen</h2>
    <p class="sheet-hinweis">Die Datenbank auf dem Server wird jede Nacht um halb vier
      automatisch gesichert. Die letzten sieben Tage bleiben liegen, ältere werden
      entfernt. Die Push-Schlüssel liegen mit dabei – ohne sie wären nach einer
      Wiederherstellung alle Erinnerungen stumm.</p>
    <div id="sicherung-liste"><div class="karte karte-ruhig" style="color:var(--text-2)">
      Wird geladen …</div></div>
    <button class="btn" id="btn-sicherung-jetzt">Jetzt sichern</button>
    <button class="btn sec" data-close>Schließen</button>`;
  $('#btn-sicherung-jetzt').onclick = sicherungStarten;
  openSheet('#sheet-sicherung');
  sicherungenLaden();
}

async function sicherungenLaden() {
  try {
    const r = await api('/backup');
    if (!r.ok) throw new Error('Status ' + r.status);
    sicherungenZeichnen((await r.json()).sicherungen || []);
  } catch (e) {
    $('#sicherung-liste').innerHTML =
      `<div class="karte karte-ruhig" style="color:var(--text-2)">Liste nicht abrufbar.</div>`;
  }
}

function sicherungenZeichnen(liste) {
  const box = $('#sicherung-liste');
  if (!box) return;
  const heute = toISO(new Date());
  box.innerHTML = liste.length
    ? `<div class="section-title">Vorhanden (${liste.length})</div><div class="group">` +
      liste.map(x => `<div class="field">
        <label>${fromISO(x.datum).toLocaleDateString('de-DE',
          { weekday: 'short', day: 'numeric', month: 'long' })}${
          x.datum === heute ? ' · heute' : ''}</label>
        <span class="hint">${x.zeit} Uhr · ${byteText(x.bytes)}</span></div>`).join('') +
      `</div>`
    : `<div class="karte karte-ruhig" style="color:var(--text-2)">
         Noch keine Sicherung vorhanden.</div>`;
}

async function sicherungStarten() {
  const knopf = $('#btn-sicherung-jetzt');
  knopf.disabled = true;
  knopf.textContent = 'Sichert …';
  try {
    const r = await api('/backup', { method: 'POST' });
    if (r.status === 429) { toast('Gerade eben schon gesichert'); return; }
    if (!r.ok) throw new Error('Status ' + r.status);
    const a = await r.json();
    sicherungenZeichnen(a.sicherungen || []);
    toast('Gesichert · ' + byteText(a.bytes) +
          (a.entfernt ? ' · ' + a.entfernt + ' alte entfernt' : ''));
  } catch (e) {
    toast('Sicherung fehlgeschlagen');
  } finally {
    knopf.disabled = false;
    knopf.textContent = 'Jetzt sichern';
  }
}

/* ---------- Export / Import ---------- */
async function exportieren() {
  /* Seit die Bilder in IndexedDB liegen, sind sie kurz nach dem Start noch
     nicht im Datensatz. Ein Backup, das dann still ohne Fotos rausgeht, ist
     schlimmer als gar keins – deshalb hier warten. */
  if (!bilderGeladen) {
    toast('Bilder werden noch geladen …');
    await bilderNachladen();
  }
  const inhalt = JSON.stringify(DB, null, 2);
  const blob = new Blob([inhalt], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'gruenzeug-' + toISO(new Date()) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);

  const bilder = Object.keys(bilderSammeln()).length;
  toast('Backup gespeichert · ' + byteText(inhalt.length) +
        (bilder ? ' inkl. ' + bilder + (bilder === 1 ? ' Bild' : ' Bildern') : ''));
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
      // Enthielt das Backup keine Bilder, kommen die vorhandenen wieder rein
      bilderNachladen();
      const ohneBilder = !JSON.stringify(d).includes('data:image');
      toast(d.plants.length + ' Pflanzen importiert' +
            (ohneBilder ? ' (das Backup enthielt keine Fotos)' : ''));
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

/* ---------- Neue Fassung ----------
   Der Service Worker liefert die App aus dem Zwischenspeicher, damit sie
   offline läuft. Eine neue Fassung liegt deshalb still im Hintergrund, bis
   sie übernommen wird – ohne Hinweis merkt davon niemand etwas. */
const VERSION_KEY = 'pg_version';
let neueFassung = null;   // wartender Service Worker

function updateBannerZeigen(reg) {
  neueFassung = reg.waiting;
  const banner = $('#update-banner');
  banner.hidden = false;
  requestAnimationFrame(() => banner.classList.add('show'));
}

function updateUebernehmen() {
  if (!neueFassung) { location.reload(); return; }
  // Nach dem Wechsel lädt die Seite neu und zeigt dann, was neu ist
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(),
                                           { once: true });
  neueFassung.postMessage('jetzt-aktualisieren');
  $('#btn-update').textContent = 'Lädt …';
}

/** Nach dem Update einmal zeigen, was sich geändert hat. */
function neuerungenZeigen() {
  let vorher;
  try { vorher = localStorage.getItem(VERSION_KEY); } catch (e) { return; }
  try { localStorage.setItem(VERSION_KEY, VERSION); } catch (e) { /* egal */ }

  if (!vorher || vorher === VERSION) return;   // erster Start oder unverändert

  const eintrag = HISTORIE.find(h => h.v === VERSION);
  const erste = eintrag && eintrag.punkte[0];
  setTimeout(() => {
    toast('Version ' + VERSION + (erste ? ': ' + erste.replace(/\.$/, '') : ' installiert'),
          'Was ist neu?', zeigeHistorie);
  }, 900);
}

/* Verhindert, dass ein hängender Wechsel die App in eine Neulade-Schleife
   schickt. Einmal je Sitzung genügt. */
let schonNeugeladen = false;

/** Übernimmt eine wartende Fassung sofort, ohne zu fragen. */
function sofortUebernehmen(wartend) {
  if (schonNeugeladen || !wartend) return;
  schonNeugeladen = true;
  navigator.serviceWorker.addEventListener('controllerchange',
    () => location.reload(), { once: true });
  wartend.postMessage('jetzt-aktualisieren');
}

/** Prüft beim Start und danach stündlich, ob eine neue Fassung bereitliegt. */
function updatePruefungStarten() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('sw.js').then(reg => {
    /* Lag beim Start schon eine Fassung bereit, wird sie ohne Nachfrage
       übernommen. Die App wurde gerade geöffnet – hier stört ein Wechsel
       niemanden, und genau das erwartet man beim Öffnen.

       Vorher gab es hier nur ein Banner. Wer das übersah, blieb auf der alten
       Fassung hängen: Ein einmal wartender Service Worker meldet sich von
       selbst nie wieder, `updatefound` feuert nur für eine *neue* Fassung. */
    if (reg.waiting && navigator.serviceWorker.controller) {
      sofortUebernehmen(reg.waiting);
      return;
    }

    reg.addEventListener('updatefound', () => {
      const neu = reg.installing;
      if (!neu) return;
      neu.addEventListener('statechange', () => {
        // controller fehlt beim allerersten Besuch – dann ist es kein Update
        if (neu.state === 'installed' && navigator.serviceWorker.controller) {
          // Mitten in der Sitzung wird gefragt, nicht einfach neu geladen
          updateBannerZeigen(reg);
        }
      });
    });

    /** Nach jeder Prüfung nachsehen, ob etwas bereitliegt. `updatefound`
        allein reicht nicht: Es feuert nur beim Finden, nicht beim Warten. */
    const pruefen = () => reg.update()
      .then(() => { if (reg.waiting) updateBannerZeigen(reg); })
      .catch(() => {});

    setInterval(pruefen, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) pruefen();
    });
  }).catch(e => console.warn('SW:', e));
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
  bindeTopf();
  $('#f-haltung').onchange = () => {
    haltungAnzeigen();
    const art = $('#f-haltung').value;
    // Ein Glas will alle paar Tage frisches Wasser, unabhängig von der Art
    if (art === 'wasser' && $('#f-intervall').value === '7') $('#f-intervall').value = 5;
    // In Semi-Hydro hält der Vorrat im Übertopf länger als Erde
    if (art === 'hydro' && !$('#f-spuelen-letzt').value) {
      $('#f-spuelen-letzt').value = toISO(new Date());
    }
  };
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
  $('#zeile-staende').onclick = zeigeStaende;
  $('#zeile-archiv').onclick = () => {
    raumFilter = '__archiv';
    suchText = '';
    $('#suchfeld').value = '';
    $('#suche-weg').hidden = true;
    tab('pflanzen');
    renderPflanzen();
  };
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
  $('#btn-reset').onclick = allesLoeschenOeffnen;

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
      hashOeffnen(true);
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

  $('#btn-licht-messen').onclick = () => {
    // Aus dem Formular heraus ohne Bezug zur Pflanze: nur messen, nicht setzen
    closeSheets();
    setTimeout(() => lichtOeffnen(editId), 180);
  };
  $('#f-freiland').onchange = freilandAnzeigen;
  $('#f-mintemp').onchange = freilandAnzeigen;
  $('#f-phase').onchange = phaseAnzeigen;
  $('#f-methode').onchange = phaseAnzeigen;
  $('#btn-eigen-neu').onclick = eigeneNeuOeffnen;
  $('#zeile-verwaist').onclick = verwaisteLoeschen;
  $('#zeile-etiketten').onclick = etikettenOeffnen;
  $('#zeile-sicherungen').onclick = sicherungenOeffnen;
  $('#zeile-raeume').onclick = raeumeOeffnen;
  $('#zeile-ort').onclick = ortOeffnen;
  $('#set-rueckblick').onchange = e => {
    DB.settings.rueckblick = e.target.checked;
    save();
    toast(e.target.checked ? 'Rückblick kommt sonntags um 18 Uhr'
                           : 'Wochenrückblick abgeschaltet');
  };
  $('#set-wetter').onchange = e => {
    DB.settings.wetterAn = e.target.value === '1';
    save(); renderAll();
    if (DB.settings.wetterAn) wetterHolen(true);
  };
  $('#btn-update').onclick = updateUebernehmen;
  $('#btn-update-spaeter').onclick = () => {
    $('#update-banner').classList.remove('show');
    setTimeout(() => { $('#update-banner').hidden = true; }, 250);
  };
  $('#btn-push-toggle').onclick = pushToggle;
  $('#set-theme').onchange = e => { DB.settings.theme = e.target.value; save(); applyTheme(); };
  $('#set-winter').onchange = e => { DB.settings.winter = e.target.value; save(); renderAll(); };
  $('#set-vorwarn').onchange = e => { DB.settings.vorwarn = Number(e.target.value); save(); renderAll(); };
  $('#set-pushzeit').onchange = e => { DB.settings.pushZeit = e.target.value; save(); pushZeitGeaendert(); };
  $('#btn-push-test').onclick = pushTesten;

  /* Delegation für dynamische Inhalte */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-water],[data-dueng],[data-aufgabe],[data-alle-giessen],[data-open],[data-emoji],[data-raum],[data-edit],[data-del],[data-close],[data-farbe],[data-hg],[data-pemoji],[data-filter],[data-filter-weg],[data-foto],[data-foto-neu],[data-foto-weg],[data-runde],[data-runde-start],[data-hilfe],[data-problem],[data-problem-zurueck],[data-archiv],[data-entarchiv],[data-qr],[data-stand],[data-tun],[data-alles-hier],[data-topf-weg],[data-eintopfen],[data-plan],[data-beh-start],[data-beh-schritt],[data-beh-ende],[data-umgebung],[data-ort],[data-aufschub],[data-aufschub-frage],[data-abschnitt],[data-log],[data-notiz],[data-verlauf-alle],[data-eigen-weg],[data-eigen-vorlage],[data-eigen-emoji],[data-anleitung],[data-anleitung-schritt],[data-anleitung-fertig],[data-bewurzelt],[data-erwachsen],[data-zustand],[data-raum-vorlage],[data-sorgen],[data-draussen],[data-reinholen],[data-licht],[data-schatten],[data-licht-uebernehmen],[data-licht-neu],[data-plan],[data-monat],[data-etikett],[data-etikett-raum],[data-etikett-alle],[data-etikett-druck]');
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
    if (t.dataset.umgebung) {
      e.stopPropagation();
      const k = t.dataset.umgebung;
      editUmgebung = editUmgebung.includes(k)
        ? editUmgebung.filter(x => x !== k) : editUmgebung.concat([k]);
      zeichneUmgebung();
      return;
    }
    if (t.dataset.ort) { e.stopPropagation(); ortWaehlen(t.dataset.ort); return; }
    if (t.dataset.etikett) { etikettUmschalten(t.dataset.etikett); return; }
    if (t.dataset.etikettRaum) { e.stopPropagation(); etikettRaum(t.dataset.etikettRaum); return; }
    if (t.dataset.etikettAlle !== undefined) { e.stopPropagation(); etikettAlle(); return; }
    if (t.dataset.etikettDruck !== undefined) { e.stopPropagation(); etikettenDrucken(); return; }
    if (t.dataset.plan) {
      e.stopPropagation();
      planJahr = t.dataset.plan === 'jahr';
      renderPlan();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (t.dataset.monat) { e.stopPropagation(); monatUmschalten(t.dataset.monat); return; }
    if (t.dataset.licht) {
      e.stopPropagation();
      closeSheets();
      setTimeout(() => lichtOeffnen(t.dataset.licht), 180);
      return;
    }
    if (t.dataset.schatten !== undefined) {
      e.stopPropagation();
      lichtErgebnis(SCHATTEN[Number(t.dataset.schatten)].lux, 'Schattenprobe');
      return;
    }
    if (t.dataset.lichtUebernehmen) {
      e.stopPropagation();
      lichtUebernehmen(t.dataset.lichtUebernehmen, t.dataset.stufe);
      return;
    }
    if (t.dataset.lichtNeu !== undefined) {
      e.stopPropagation();
      lichtOeffnen(t.dataset.lichtNeu || null);
      return;
    }
    if (t.dataset.draussen) { e.stopPropagation(); draussenUmschalten(t.dataset.draussen); return; }
    if (t.dataset.reinholen !== undefined) { e.stopPropagation(); alleReinholen(); return; }
    if (t.dataset.sorgen !== undefined) {
      e.stopPropagation();
      raumFilter = '__sorgen';
      suchText = '';
      $('#suchfeld').value = '';
      $('#suche-weg').hidden = true;
      tab('pflanzen');
      renderPflanzen();
      return;
    }
    if (t.dataset.raumVorlage) { e.stopPropagation(); raumVorlageNehmen(t.dataset.raumVorlage); return; }
    if (t.dataset.zustand) { e.stopPropagation(); zustandSetzen(t.dataset.pid, t.dataset.zustand); return; }
    if (t.dataset.bewurzelt) { e.stopPropagation(); stecklingBewurzelt(t.dataset.bewurzelt); return; }
    if (t.dataset.erwachsen) { e.stopPropagation(); jungAusgewachsen(t.dataset.erwachsen); return; }
    if (t.dataset.anleitung) {
      e.stopPropagation();
      const pid = t.dataset.pid || null;
      if (pid) { closeSheets(); setTimeout(() => anleitungOeffnen(t.dataset.anleitung, pid), 180); }
      else anleitungOeffnen(t.dataset.anleitung, null);
      return;
    }
    if (t.dataset.anleitungSchritt) { e.stopPropagation(); anleitungSchritt(t.dataset.anleitungSchritt); return; }
    if (t.dataset.anleitungFertig) { e.stopPropagation(); anleitungFertig(t.dataset.anleitungFertig); return; }
    if (t.dataset.abschnitt) {
      e.stopPropagation();
      abschnittUmschalten(t.dataset.abschnitt);
      if (offeneDetailId) openDetail(offeneDetailId);
      return;
    }
    if (t.dataset.verlaufAlle !== undefined) {
      e.stopPropagation(); verlaufLang = true;
      if (offeneDetailId) openDetail(offeneDetailId);
      return;
    }
    if (t.dataset.log) { e.stopPropagation(); notizOeffnen(t.dataset.pid, t.dataset.log); return; }
    if (t.dataset.notiz) { e.stopPropagation(); notizOeffnen(t.dataset.notiz, null); return; }
    if (t.dataset.eigenWeg !== undefined) {
      e.stopPropagation();
      editEigene.splice(Number(t.dataset.eigenWeg), 1);
      zeichneEigene();
      return;
    }
    if (t.dataset.eigenVorlage !== undefined) { e.stopPropagation(); eigeneVorlage(t.dataset.eigenVorlage); return; }
    if (t.dataset.eigenEmoji) {
      e.stopPropagation();
      eigenEmoji = t.dataset.eigenEmoji;
      zeichneEigenEmoji();
      return;
    }
    if (t.dataset.aufschubFrage) { e.stopPropagation(); aufschubFragen(t.dataset.aufschubFrage); return; }
    if (t.dataset.aufschub !== undefined) {
      e.stopPropagation();
      aufschieben(t.dataset.pid, t.dataset.aufschub);
      return;
    }
    if (t.dataset.plan) { e.stopPropagation(); planZeigen(t.dataset.plan, t.dataset.idx); return; }
    if (t.dataset.behStart) {
      e.stopPropagation();
      behandlungStarten(t.dataset.pid, t.dataset.behStart, t.dataset.idx);
      return;
    }
    if (t.dataset.behSchritt) {
      e.stopPropagation();
      behandlungSchrittErledigt(t.dataset.pid, t.dataset.behSchritt);
      return;
    }
    if (t.dataset.behEnde) { e.stopPropagation(); behandlungBeenden(t.dataset.behEnde); return; }
    if (t.dataset.problem) { e.stopPropagation(); problemZeigen(t.dataset.problem); return; }
    if (t.dataset.problemZurueck !== undefined) {
      e.stopPropagation();
      // Aus dem Plan geht es zurück zu den Ursachen, von dort zur Übersicht
      if (t.dataset.problemZurueck) problemZeigen(t.dataset.problemZurueck);
      else hilfeOeffnen(hilfePflanze);
      return;
    }
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
    if (t.dataset.tun) { e.stopPropagation(); tunErledigt(t.dataset.pid, t.dataset.tun); return; }
    if (t.dataset.allesHier) { e.stopPropagation(); allesHier(t.dataset.allesHier); return; }
    if (t.dataset.eintopfen) { e.stopPropagation(); abelegerEintopfen(t.dataset.eintopfen); return; }
    if (t.dataset.topfWeg !== undefined) {
      topfListe.splice(Number(t.dataset.topfWeg), 1);
      zeichneTopf();
      return;
    }
    if (t.dataset.stand) {
      e.stopPropagation();
      standWiederherstellen(t.dataset.stand, Number(t.dataset.anzahl) || 0);
      return;
    }
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
hashMerken();
hashOeffnen(false);   // klappt sofort, wenn die Daten schon lokal liegen
starte();

/* Systemwechsel nur nachziehen, solange 'System' eingestellt ist */
window.matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => { if ((DB.settings.theme || 'auto') === 'auto') applyTheme(); });

wetterLaden();
abschnitteLaden();
bilderStarten();
window.addEventListener('load', () => { updatePruefungStarten(); wetterHolen(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) wetterHolen(); });
neuerungenZeigen();
