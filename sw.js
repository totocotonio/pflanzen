/* Grünzeug Service Worker */
const CACHE = 'gruenzeug-v1.4.0';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=1.4.0',
  './app.js?v=1.4.0',
  './manifest.json',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Network-first für HTML (immer aktuelle Version), Cache-first für den Rest */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  /* Die API wird nie zwischengespeichert. Sonst liefert der Cache alte
     Antworten und die App arbeitet mit einem veralteten Serverstand. */
  if (new URL(req.url).pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req)
        .then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); return r; })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)); }
      return r;
    }).catch(() => hit))
  );
});

/* ---- Push ---- */
self.addEventListener('push', e => {
  let data = { title: 'Grünzeug', body: 'Zeit zum Gießen 💧' };
  try { if (e.data) data = Object.assign(data, e.data.json()); } catch (_) {
    if (e.data) data.body = e.data.text();
  }
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: data.tag || 'giessen',
    data: { url: './index.html' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      return clients.openWindow('./index.html');
    })
  );
});
