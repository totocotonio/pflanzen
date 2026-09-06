const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

(async () => {
  let server, browser;
  const root = path.join(__dirname, '..');
  const base = process.env.BILDER_BASE_URL || 'http://127.0.0.1:8777';
  assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Nur lokale Testserver verwenden');
  try {
    if (!process.env.BILDER_BASE_URL) {
      const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gruenzeug-bildtest-'));
      server = spawn(process.env.PYTHON || 'python', ['devserver.py'], {
        cwd: root, env: { ...process.env, GRUENZEUG_DB: path.join(scratch, 'test.db') }, stdio: 'ignore'
      });
      server.on('error', error => console.error(error));
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } } catch {}
        await new Promise(r => setTimeout(r, 100));
      }
      assert.ok(ready, 'Testserver startet');
    }
    browser = await chromium.launch({ headless: true,
      ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    const errors = [];
    const one = await browser.newContext(), two = await browser.newContext();
    async function login(context) {
      const p = await context.newPage();
      p.on('pageerror', e => errors.push(e.message));
      p.on('dialog', d => d.accept());
      await p.goto(base);
      await p.locator('#lg-name').fill('test'); await p.locator('#lg-pass').fill('test12345');
      await p.locator('#lg-btn').click();
      await p.waitForFunction(() => SYNC.user === 'test' && SYNC.status === 'ok' && !SYNC.laeuft);
      return p;
    }
    const p = await login(one);
    const photos = ['icon-192.png', 'icon-512.png', 'icon-maskable.png', 'apple-touch-icon.png']
      .map(f => 'data:image/png;base64,' + fs.readFileSync(path.join(root, f)).toString('base64'));
    const requests = [];
    p.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) requests.push({ path: new URL(r.url()).pathname, method: r.method(), body: r.postData() || '' }); });
    async function saved(page, oldRev) {
      await page.waitForFunction(rev => !SYNC.dirty && !SYNC.laeuft && SYNC.rev > rev, oldRev);
    }
    let rev = await p.evaluate(() => SYNC.rev);
    await p.evaluate(photo => {
      DB.plants = [{ id: 'bildtest', name: 'Bildtest', foto: photo, intervall: 7, letzt: '2020-01-01', fotos: [{ id: 'galerie', bild: photo, ts: 1 }] }];
      DB.settings.avatarFoto = photo; DB.settings.hintergrundFoto = photo;
      DB.logs = []; DB.sammel = []; save(); renderAll();
    }, photos[0]);
    await saved(p, rev);
    assert.equal(requests.filter(r => r.method === 'PUT' && r.path.startsWith('/api/bilder/')).length, 1);
    assert.ok(!requests.find(r => r.method === 'PUT' && r.path === '/api/data').body.includes('data:image/'));
    const q = await login(two);
    assert.equal(await q.evaluate(() => DB.plants[0].foto), photos[0]);
    assert.equal(await q.evaluate(() => DB.settings.avatarFoto), photos[0]);
    console.log('PASS: Erstübertragung dedupliziert; zweites Gerät erhält vollständige Fotos');

    requests.length = 0; rev = await p.evaluate(() => SYNC.rev);
    const legacyBytes = await p.evaluate(() => new TextEncoder().encode(JSON.stringify({ rev: SYNC.rev, daten: nutzdaten() })).length);
    await p.locator('#heute-liste [data-water="bildtest"]').click();
    await saved(p, rev);
    const dataRequests = requests.filter(r => r.method === 'PUT' && r.path === '/api/data');
    assert.equal(dataRequests.length, 1);
    assert.equal(requests.filter(r => r.method === 'PUT' && r.path.startsWith('/api/bilder/')).length, 0);
    const bytes = Buffer.byteLength(dataRequests[0].body);
    assert.ok(bytes < legacyBytes / 10);
    console.log(`PASS: Gießen ohne Bild-Upload; Metadaten ${bytes} statt ${legacyBytes} Bytes im Testbestand`);

    await q.evaluate(() => abgleichen());
    await q.evaluate(() => navigator.serviceWorker.ready);
    await q.waitForFunction(() => bilderGeladen);
    await two.setOffline(true); await q.reload();
    await q.waitForFunction(() => bilderGeladen && DB.plants[0]?.foto);
    assert.equal(await q.evaluate(() => DB.plants[0].foto), photos[0]);
    await two.setOffline(false);
    const downloadEvent = q.waitForEvent('download');
    await q.evaluate(() => exportieren());
    const download = await downloadEvent;
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.plants[0].foto, photos[0]);
    assert.equal(exported.plants[0].fotos[0].bild, photos[0]);
    assert.ok(!JSON.stringify(exported).includes('gzbild:'));
    console.log('PASS: Offline-Neuladen und vollständiger JSON-Export');

    requests.length = 0; rev = await p.evaluate(() => SYNC.rev);
    await p.evaluate(photo => { DB.plants[0].foto = photo; save(); }, photos[1]);
    await saved(p, rev);
    assert.equal(requests.filter(r => r.method === 'PUT' && r.path.startsWith('/api/bilder/')).length, 1);
    await q.evaluate(() => abgleichen());
    assert.equal(await q.evaluate(() => DB.plants[0].foto), photos[1]);
    rev = await p.evaluate(() => SYNC.rev);
    await p.evaluate(() => { DB.plants[0].foto = null; DB.plants[0].fotos = []; DB.settings.avatarFoto = null; DB.settings.hintergrundFoto = null; save(); });
    await saved(p, rev); await q.evaluate(() => abgleichen()); await q.reload();
    await q.waitForFunction(() => bilderGeladen && SYNC.status === 'ok');
    assert.ok(!await q.evaluate(() => DB.plants[0].foto));
    assert.ok(!await q.evaluate(() => DB.settings.avatarFoto));
    console.log('PASS: Bildwechsel überträgt nur neues Foto; entfernte Fotos bleiben nach Neuladen entfernt');

    const version = await p.evaluate(async () => (await (await api('/versionen')).json()).versionen[0].id);
    await p.evaluate(id => standWiederherstellen(id, 1), version);
    assert.equal(await p.evaluate(() => DB.plants[0].foto), photos[0]);
    console.log('PASS: Frühere Version stellt ihr ursprüngliches Foto wieder her');

    rev = await p.evaluate(() => SYNC.rev); await one.setOffline(true);
    await p.evaluate(photo => { DB.plants[0].foto = photo; save(); }, photos[2]);
    await p.waitForFunction(() => SYNC.dirty && !!SYNC.fehler);
    await one.setOffline(false); await saved(p, rev);
    assert.equal(await p.evaluate(() => DB.plants[0].foto), photos[2]);
    console.log('PASS: Offline-Fotoänderung wird nach Wiederverbinden nachgeholt');

    requests.length = 0; rev = await p.evaluate(() => SYNC.rev);
    await p.route('**/api/bilder/*', route => route.request().method() === 'PUT'
      ? route.fulfill({ status: 503, body: '{}' }) : route.continue());
    await p.evaluate(photo => { DB.plants[0].foto = photo; save(); }, photos[3]);
    await p.waitForFunction(() => SYNC.dirty && SYNC.fehler?.art === 'bilder' && !SYNC.laeuft);
    assert.equal(requests.filter(r => r.method === 'PUT' && r.path === '/api/data').length, 0);
    assert.equal(await p.evaluate(() => SYNC.rev), rev);
    await p.unroute('**/api/bilder/*'); await p.evaluate(() => schiebeHoch());
    await saved(p, rev);
    console.log('PASS: Fehlgeschlagener Bild-Upload bestätigt keine Metadaten; Wiederholung erfolgreich');

    const fifth = 'data:image/x-icon;base64,' + fs.readFileSync(path.join(root, 'favicon.ico')).toString('base64');
    requests.length = 0; rev = await p.evaluate(() => SYNC.rev);
    let release, started;
    const gate = new Promise(resolve => { release = resolve; });
    const beginning = new Promise(resolve => { started = resolve; });
    await p.route('**/api/bilder/*', async route => {
      if (route.request().method() === 'PUT') { started(); await gate; }
      await route.continue();
    });
    await p.evaluate(photo => { DB.plants[0].foto = photo; save(); }, fifth);
    await beginning;
    await p.evaluate(() => { DB.plants[0].notiz = 'Während Bild-Upload geändert'; save(); });
    release(); await saved(p, rev);
    assert.ok(requests.filter(r => r.method === 'PUT' && r.path === '/api/data').length >= 2);
    const remote = await p.evaluate(async () => (await (await api('/data')).json()).daten);
    assert.equal(remote.plants[0].notiz, 'Während Bild-Upload geändert');
    assert.equal(requests.filter(r => r.method === 'PUT' && r.path.startsWith('/api/bilder/')).length, 1);
    await p.unroute('**/api/bilder/*');
    console.log('PASS: Änderungen während Bild-Upload bleiben erhalten und werden nachgesendet');

    await q.evaluate(() => abgleichen()); rev = await q.evaluate(() => SYNC.rev);
    await q.evaluate(data => importieren(new File([JSON.stringify(data)], 'backup.json', { type: 'application/json' })), exported);
    await saved(q, rev);
    assert.equal(await q.evaluate(() => DB.plants[0].foto), photos[0]);
    console.log('PASS: Vollständiges JSON-Backup lässt sich mit Fotos wieder importieren');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => { server.once('exit', resolve); server.kill(); });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
