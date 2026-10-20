// Guarda la app en el teléfono para que abra sin internet.
// Los datos de la hoja los maneja app.js (siempre intenta la versión en vivo primero).
const VERSION = 'zamar-v21';
const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/config.js',
  'js/music.js',
  'js/songs.js',
  'js/chordpro.js',
  'js/setlists.js',
  'js/api.js',
  'js/edit.js',
  'js/compositions.js',
  'js/agenda.js',
  'js/bridges.js',
  'js/setshare.js',
  'js/progressions.js',
  'js/vendor/jspdf.umd.min.js',
  'js/vendor/qrcode.js',
  'data/repertorio.json',
  'manifest.webmanifest',
  'img/logo-negro.png',
  'img/logo-blanco.png',
  'img/simbolo-negro.png',
  'img/simbolo-blanco.png',
  'img/equipo-800.jpg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Archivos de la app: responde con la copia guardada y la renueva en segundo plano.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const fresh = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
