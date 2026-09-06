const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

(async () => {
  let server, browser;
  const base = process.env.HEUTE_BASE_URL || 'http://127.0.0.1:8777';
  try {
    if (!process.env.HEUTE_BASE_URL) {
      const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gruenzeug-browser-'));
      server = spawn(process.env.PYTHON || 'python', ['devserver.py'], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, GRUENZEUG_DB: path.join(scratch, 'test.db') },
        stdio: 'ignore',
      });
      server.on('error', error => { console.error(error); });
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } } catch {}
        await new Promise(r => setTimeout(r, 100));
      }
      assert.ok(ready, 'Lokaler Testserver startet');
    }
    browser = await chromium.launch({ headless: true,
      ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem('pg_sync', JSON.stringify({ lokalOk: true })));
    await page.goto(base);
    await page.waitForFunction(() => typeof renderHeute === 'function' && typeof SYNC !== 'undefined');
    async function seed() {
      await page.evaluate(() => {
        const date = days => { const d = new Date(); d.setDate(d.getDate() - days); return toISO(d); };
        DB.plants = [
          { id: 'a', name: 'Monstera', emoji: '🌿', raum: 'Wohnzimmer', intervall: 7, letzt: date(9), menge: '300 ml', duengerInt: 30, duengerLetzt: date(35) },
          { id: 'b', name: 'Efeutute', emoji: '🪴', raum: 'Arbeitszimmer', intervall: 7, letzt: date(7) },
          { id: 'c', name: 'Bogenhanf', emoji: '🌱', raum: 'Schlafzimmer', intervall: 14, letzt: date(13) },
          { id: 'd', name: 'Ficus', emoji: '🌳', raum: 'Wohnzimmer', intervall: 7, letzt: date(7) },
        ];
        DB.logs = []; DB.sammel = []; DB.settings = { winter: '0', vorwarn: 2, theme: 'light' };
        SYNC.user = null; heuteFilter = null; closeSheets(); applyTheme(); renderAll();
      });
    }
    await seed();
    assert.equal(await page.locator('#st-faellig').textContent(), '3');
    assert.equal(await page.locator('#st-pflege').textContent(), '1');
    assert.equal(await page.locator('#st-bald').textContent(), '1');
    const headings = await page.locator('#heute-liste .section-title').allTextContents();
    assert.ok(headings.indexOf('Weitere Pflege') < headings.indexOf('Demnächst'));
    console.log('PASS: Zähler und Priorität Pflege vor Vorschau');

    await page.locator('[data-filter="pflege"]').click();
    assert.equal(await page.locator('[data-filter="pflege"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#heute-liste [data-water]').count(), 0);
    await page.locator('#heute-liste [data-aufgabe]').click();
    assert.equal(await page.locator('#st-pflege').textContent(), '0');
    assert.match(await page.locator('#heute-liste').textContent(), /keine Pflegeaufgabe/);
    await page.locator('.toast-aktion', { hasText: 'Rückgängig' }).click();
    assert.equal(await page.locator('#st-pflege').textContent(), '1');
    await page.locator('[data-filter-weg]').click();
    await page.locator('#heute-liste [data-water="a"]').click();
    assert.equal(await page.locator('#st-faellig').textContent(), '2');
    await page.locator('.toast-aktion', { hasText: 'Rückgängig' }).click();
    assert.equal(await page.locator('#st-faellig').textContent(), '3');
    console.log('PASS: Pflege und Gießen abhaken, Rückgängig, Filter zurücksetzen');

    await page.locator('[data-filter="alle"]').click();
    assert.equal(await page.locator('#heute-liste .plant').count(), 4);
    await page.locator('[data-filter="alle"]').click();
    await page.locator('[data-runde-start]').click();
    assert.ok(await page.locator('#sheet-runde').evaluate(el => el.classList.contains('open')));
    await page.evaluate(() => closeSheets());
    await page.locator('[data-filter="bald"]').click();
    assert.equal(await page.locator('#heute-liste .plant').count(), 1);
    console.log('PASS: Alle Pflanzen, Gieß-Runde und Vorschau erreichbar');

    await seed();
    await page.evaluate(() => { DB.plants.forEach(p => p.letzt = toISO(new Date())); renderHeute(); });
    assert.equal(await page.locator('#st-faellig').textContent(), '0');
    assert.equal(await page.locator('#st-pflege').textContent(), '1');
    assert.match(await page.locator('#heute-ueberblick h2').textContent(), /Eine Aufgabe/);
    await page.evaluate(() => { DB.plants[0].duengerLetzt = toISO(new Date()); renderHeute(); });
    assert.match(await page.locator('#heute-ueberblick h2').textContent(), /alles erledigt/);
    await page.evaluate(() => { DB.plants = []; renderHeute(); });
    assert.ok(await page.locator('#heute-ueberblick').isHidden());
    assert.ok(await page.locator('#btn-beispiele-leer').isVisible());
    console.log('PASS: Nur Pflege fällig, alles erledigt und leerer Bestand');

    await seed();
    await page.evaluate(() => {
      const today = toISO(new Date());
      DB.plants[1].neuSeit = today;
      const problem = PROBLEME.find(p => p.ursachen.some(u => u.plan));
      DB.plants[3].behandlung = { problem: problem.id, ursache: problem.ursachen.findIndex(u => u.plan), start: today, erledigt: [] };
      DB.sammel = [{ id: 's', name: 'Blätter prüfen', emoji: '🔍', int: 1, letzt: DB.plants[0].letzt, einheit: 'tage', erledigt: [] }];
      renderHeute();
    });
    await page.locator('[data-filter="pflege"]').click();
    for (const selector of ['[data-aufgabe]', '[data-beh-schritt]', '[data-neu-schritt]', '[data-sammel-lauf]']) {
      assert.ok(await page.locator('#heute-liste ' + selector).count(), selector);
    }
    assert.equal(await page.locator('#st-pflege').textContent(), '4');
    console.log('PASS: Behandlung, Eingewöhnung und Sammelaufgaben im Pflegefilter');

    await seed();
    await page.evaluate(() => { DB.plants[0].archiviert = true; renderHeute(); });
    assert.equal(await page.locator('#st-faellig').textContent(), '2');
    assert.equal(await page.locator('#st-pflege').textContent(), '0');
    console.log('PASS: Archivierte Pflanzen bleiben aus Aufgaben und Zählern heraus');

    await seed();
    const shots = process.env.HEUTE_SCREENSHOTS;
    if (shots) fs.mkdirSync(shots, { recursive: true });
    await page.waitForFunction(() => !document.querySelector('#toast').classList.contains('show'));
    for (const [width, theme] of [[320, 'light'], [390, 'light'], [390, 'dark'], [1280, 'light']]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(theme => { DB.settings.theme = theme; applyTheme(); }, theme);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px ${theme}: kein horizontaler Überlauf`);
      if (shots) await page.screenshot({ path: path.join(shots, `heute-${width}-${theme}.png`), fullPage: true, animations: 'disabled' });
      await page.evaluate(() => {
        DB.plants[0].name = 'Monstera mit einem besonders langen Pflanzennamen';
        renderPflanzen();
      });
      await page.locator('[data-tab="pflanzen"]').click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px: Pflanzen ohne Überlauf`);
      if (shots) await page.screenshot({ path: path.join(shots, `pflanzen-${width}-${theme}.png`), fullPage: true, animations: 'disabled' });
      await page.locator('#pflanzen-grid [data-open="a"]').click();
      assert.ok(await page.locator('#sheet-detail').evaluate(el => el.classList.contains('open')));
      assert.ok(await page.locator('#detail-body').evaluate(el => el.scrollWidth <= el.clientWidth), `${width}px: Detail ohne Überlauf`);
      if (shots) await page.screenshot({ path: path.join(shots, `detail-${width}-${theme}.png`), animations: 'disabled' });
      await page.evaluate(() => {
        closeSheets();
      });
      await page.locator('[data-tab="heute"]').click();
    }
    assert.deepEqual(errors, []);
    console.log('PASS: 320/390/1280 px, Hell/Dunkel, kein Überlauf oder JavaScript-Laufzeitfehler');
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
