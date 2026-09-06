/* Getrennter Bildtransfer. Im Arbeitsspeicher bleiben vollständige Bilder,
   damit Anzeige, Offline-Nutzung und JSON-Export unverändert funktionieren. */
'use strict';
const BILD_REF = 'gzbild:';
const bildHashes = new Map();
const bildInhalte = new Map();

function bildFelder(daten) {
  const felder = [];
  for (const p of daten.plants || []) {
    if ('foto' in p) felder.push([p, 'foto']);
    for (const f of p.fotos || []) if ('bild' in f) felder.push([f, 'bild']);
  }
  for (const f of ['avatarFoto', 'hintergrundFoto']) {
    if (daten.settings && f in daten.settings) felder.push([daten.settings, f]);
  }
  return felder;
}

async function bildHash(inhalt) {
  if (!bildHashes.has(inhalt)) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(inhalt));
    const id = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
    bildHashes.set(inhalt, id);
    bildInhalte.set(id, inhalt);
  }
  return bildHashes.get(inhalt);
}

async function bildAntwort(r) {
  if (!r.ok) {
    syncFehler(r.status === 401 ? 'auth' : r.status === 413 ? 'gross' : 'bilder');
    if (r.status === 401) { SYNC.user = null; zeigeLogin(); }
    speichereSync();
    throw new Error('Bildtransfer: HTTP ' + r.status);
  }
  return r.json();
}

async function bildSyncVorbereiten(daten) {
  // Vor dem ersten await festhalten: Während Hashing/Upload darf weiter
  // gearbeitet werden. Die Antwort bestätigt nur diesen Schnappschuss.
  const stand = JSON.parse(JSON.stringify(daten));
  const bilder = new Map();
  for (const [objekt, feld] of bildFelder(stand)) {
    const inhalt = objekt[feld];
    if (typeof inhalt === 'string' && inhalt.startsWith('data:image/')) {
      const id = await bildHash(inhalt);
      bilder.set(id, inhalt);
      objekt[feld] = BILD_REF + id;
    }
  }
  for (const p of stand.plants || []) delete p.fotoVorhanden;
  if (stand.settings) {
    delete stand.settings.avatarFotoVorhanden;
    delete stand.settings.hintergrundFotoVorhanden;
  }
  const ids = Array.from(bilder.keys());
  for (let start = 0; start < ids.length; start += 500) {
    const antwort = await bildAntwort(await api('/bilder/abgleichen', {
      method: 'POST', body: JSON.stringify({ ids: ids.slice(start, start + 500) })
    }));
    for (const id of antwort.fehlen) {
      if (!bilder.has(id)) throw new Error('Unbekannte Bildkennung in Serverantwort');
      await bildAntwort(await api('/bilder/' + id, {
        method: 'PUT', body: JSON.stringify({ inhalt: bilder.get(id) })
      }));
    }
  }
  return stand;
}

async function serverStand(antwort) {
  if (!antwort.daten) return antwort;
  const stand = JSON.parse(JSON.stringify(antwort));
  const felder = bildFelder(stand.daten).filter(([objekt, feld]) =>
    typeof objekt[feld] === 'string' && objekt[feld].startsWith(BILD_REF));
  if (!felder.length) return stand; // Alte Server und alte Inline-Sicherungen.
  // Bereits auf diesem Gerät gespeicherte Bilder werden nicht erneut geladen.
  try {
    const lokal = await bilderLesen();
    for (const wert of new Set(Object.values(lokal))) {
      if (typeof wert === 'string' && wert.startsWith('data:image/')) await bildHash(wert);
    }
  } catch (e) { console.warn('Lokaler Bildcache nicht lesbar:', e); }
  for (const [objekt, feld] of felder) {
    const id = objekt[feld].slice(BILD_REF.length);
    if (!/^[0-9a-f]{64}$/.test(id)) throw new Error('Ungültiger Bildverweis');
    if (!bildInhalte.has(id)) {
      const bild = await bildAntwort(await api('/bilder/' + id));
      if (typeof bild.inhalt !== 'string' || await bildHash(bild.inhalt) !== id) {
        syncFehler('bilder'); throw new Error('Bildprüfung fehlgeschlagen');
      }
    }
    objekt[feld] = bildInhalte.get(id);
  }
  return stand;
}
