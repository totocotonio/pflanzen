const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Echte App-Funktionen, ohne DOM-Start. Netzwerk, Zeitgeber und Browser-Speicher
// werden kontrolliert, damit langsame Antworten reproduzierbar sind.
function app() {
  const storage = new Map();
  const timers = [];
  const messages = [];
  const ctx = vm.createContext({
    console, window: { matchMedia: () => ({ matches: false }), addEventListener() {} }, navigator: { onLine: true },
    localStorage: { getItem: k => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v) },
    setTimeout: fn => { timers.push(fn); return timers.length; },
    clearTimeout() {}, confirm: () => true,
  });
  const source = fs.readFileSync(process.env.APP_SOURCE || path.join(__dirname, '../app.js'), 'utf8');
  vm.runInContext(source.split('/* ---------- Start ---------- */')[0], ctx);
  ctx.messages = messages;
  vm.runInContext(`
    renderMore = renderAll = syncWarnungZeichnen = zeigeLogin = applyTheme =
      applyPersonalisierung = function() {};
    toast = message => messages.push(message);
    SYNC.user = 'test'; SYNC.rev = 1; SYNC.dirty = true;
    bilderGeladen = true;
    DB.plants = [{ id: 'p1', name: 'Monstera', created: 1 }];
  `, ctx);
  return { ctx, timers, storage, messages, run: code => vm.runInContext(code, ctx) };
}
const response = (status, body = {}) => ({ status, ok: status < 400, json: async () => body });
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };

test('Änderung während Upload bleibt offen und wird mit neuer Revision nachgesendet', async () => {
  const a = app(); const pending = deferred(); const requests = [];
  a.ctx.fetch = async (_, opts) => { requests.push(JSON.parse(opts.body)); return pending.promise; };
  const uploading = a.run('schiebeHoch()');
  a.run("DB.plants[0].name = 'Neu'; save()");
  pending.resolve(response(200, { rev: 2 })); await uploading;
  assert.equal(requests[0].daten.plants[0].name, 'Monstera');
  assert.equal(a.run('SYNC.dirty'), true);
  a.ctx.fetch = async (_, opts) => { requests.push(JSON.parse(opts.body)); return response(200, { rev: 3 }); };
  await a.timers.at(-1)();
  assert.equal(requests[1].rev, 2);
  assert.equal(requests[1].daten.plants[0].name, 'Neu');
  assert.equal(a.run('SYNC.dirty'), false);
});

test('Upload wartet auf Fotos und überträgt sie vollständig', async () => {
  const a = app(); const ready = deferred(); let payload;
  a.ctx.ready = ready.promise;
  a.ctx.window.indexedDB = {};
  a.run("bilderGeladen = false; bilderLesen = () => ready");
  a.ctx.fetch = async (_, opts) => { payload = JSON.parse(opts.body); return response(200, { rev: 2 }); };
  const uploading = a.run('schiebeHoch()');
  assert.equal(payload, undefined);
  ready.resolve({ 'p:p1': 'data:image/jpeg;base64,test' }); await uploading;
  assert.equal(payload.daten.plants[0].foto, 'data:image/jpeg;base64,test');
});

test('Nicht lesbare Fotos verhindern Upload und unvollständigen Export', async () => {
  const a = app(); let requests = 0;
  a.run('bilderGeladen = false; bilderNachladen = async () => {}');
  a.ctx.fetch = async () => { requests++; return response(200, { rev: 2 }); };
  await a.run('schiebeHoch()');
  assert.equal(requests, 0); assert.equal(a.run('SYNC.dirty'), true);
  assert.equal(a.run('SYNC.fehler.art'), 'bilder');
  await a.run('exportieren()');
  assert.match(a.messages.at(-1), /abgebrochen/);
});

for (const [status, kind] of [[401, 'auth'], [413, 'gross'], [500, 'server']]) {
  test(`HTTP ${status} lässt Änderungen offen und speichert Fehler`, async () => {
    const a = app(); a.ctx.fetch = async () => response(status);
    await a.run('schiebeHoch()');
    assert.equal(a.run('SYNC.dirty'), true);
    assert.equal(JSON.parse(a.storage.get('pg_sync')).fehler.art, kind);
  });
}

test('Offline-Fehler lässt sich anschließend erfolgreich nachholen', async () => {
  const a = app(); a.ctx.fetch = async () => { throw Error('offline'); };
  await a.run('schiebeHoch()');
  assert.equal(a.run('SYNC.fehler.art'), 'netz');
  assert.equal(a.run('SYNC.dirty'), true);
  a.ctx.fetch = async () => response(200, { rev: 2 });
  await a.run('schiebeHoch()');
  assert.equal(a.run('SYNC.dirty'), false); assert.equal(a.run('SYNC.fehler'), null);
});

test('Abmelden und erneutes Laden erhalten offene Änderungen', async () => {
  const a = app(); a.ctx.fetch = async () => response(200);
  await a.run('abmelden()'); a.run('ladeSync()');
  assert.equal(a.run('SYNC.dirty'), true); assert.equal(a.run('SYNC.rev'), 0);
});

test('Voller Speicher verspricht keine ungeprüfte Serversicherung', () => {
  const a = app(); a.ctx.localStorage.setItem = () => { throw Error('quota'); };
  a.run('save()');
  assert.equal(a.run('SYNC.dirty'), true);
  assert.doesNotMatch(a.messages[0], /liegen aber auf dem Server/);
});

test('Veraltete GET-Antwort ersetzt keinen inzwischen hochgeladenen Stand', async () => {
  const a = app(); const pending = deferred();
  a.ctx.fetch = async () => pending.promise;
  const reading = a.run('abgleichen()');
  a.run('SYNC.rev = 2; SYNC.dirty = false');
  pending.resolve(response(200, { rev: 1, daten: { plants: [], logs: [] } }));
  await reading;
  assert.equal(a.run('DB.plants.length'), 1); assert.equal(a.run('SYNC.rev'), 2);
});

test('Konflikt mit fehlgeschlagenem Folgeupload meldet keinen Erfolg', async () => {
  const a = app(); a.ctx.confirm = () => false;
  a.ctx.fetch = async () => response(413);
  await a.run('loeseKonflikt({ rev: 2, daten: { plants: [] } })');
  assert.equal(a.run('SYNC.dirty'), true);
  assert.equal(a.messages.some(m => /überschrieben|wurde auf dem Server gesichert/.test(m)), false);
});
