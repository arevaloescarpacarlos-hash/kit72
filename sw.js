// Service worker de Kit 72 h: guarda la app para abrirla sin conexión y lanza los avisos de caducidad.
// Si cambias algún archivo, sube también un número nuevo aquí para que se actualice.
const CACHE = 'kit72-v6';
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Responde al instante con lo guardado y, si hay conexión, actualiza la copia para la próxima vez.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request, { ignoreSearch: true }).then(hit => {
        const red = fetch(e.request).then(res => {
          if (res && res.ok && new URL(e.request.url).origin === location.origin) cache.put(e.request, res.clone());
          return res;
        }).catch(() => hit || cache.match('./'));
        return hit || red;
      })
    )
  );
});

/* ---------- avisos de caducidad en segundo plano ---------- */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('kit72', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((res, rej) => {
    const r = db.transaction('kv').objectStore('kv').get(k);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(k, v) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(v, k);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
function fechaLocal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
// Muestra una notificación con lo que caduca pronto, como máximo una vez al día.
async function avisar(forzar) {
  const d = await idbGet('alertas').catch(() => null);
  if (!d || !Array.isArray(d.items)) return 'sin datos';
  const ahora = new Date();
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  if (!forzar && d.ultimo === iso) return 'ya avisado hoy';
  const lim = d.lim || 14;
  const prox = d.items
    .map(x => ({ n: x.n, dias: Math.round((fechaLocal(x.f) - hoy) / 86400000) }))
    .filter(x => Number.isFinite(x.dias) && x.dias <= lim)
    .sort((a, b) => a.dias - b.dias);
  if (!prox.length) return 'nada que avisar';
  const linea = x => x.dias < 0 ? `${x.n}: caducado` : x.dias === 0 ? `${x.n}: caduca hoy` : `${x.n}: ${x.dias} ${x.dias === 1 ? 'día' : 'días'}`;
  const body = prox.slice(0, 4).map(linea).join('\n') + (prox.length > 4 ? `\ny ${prox.length - 4} más` : '');
  await self.registration.showNotification('Kit de 72 h: caducidades', { body, tag: 'kit72-cad', icon: 'icon-192.png' });
  d.ultimo = iso;
  await idbSet('alertas', d);
  return 'avisado';
}
self.addEventListener('periodicsync', e => {
  if (e.tag === 'kit72-caducidad') e.waitUntil(avisar(false));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./'))
  );
});
