const CACHE_NAME = 'invincible-gym-v25';
const ASSETS = ['./index.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

// Solo borra versiones viejas de SU caché. Las otras apps de srcuack9.github.io (App Hobbies…)
// comparten el almacenamiento de cachés del dominio: si se borraran las suyas, se quedarían
// sin copia para abrir sin conexión hasta volver a cargarse con red.
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k.startsWith('invincible-gym-') && k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Permite forzar la activación del SW nuevo desde la página
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

// NETWORK-FIRST: siempre intenta traer lo último de la red y actualiza la caché.
// Solo usa la caché si no hay conexión. Así la app SIEMPRE se actualiza sola.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});

// AVISOS: la página deja en IndexedDB la cola de los próximos días (settings.notifQueue).
// Cuando Android despierta la app (periodic sync), se muestran los que ya tocan.
function openGymDB() {
  return new Promise((res, rej) => { const r = indexedDB.open('InvincibleGym'); r.onsuccess = () => res(r.result); r.onerror = rej; });
}
function getSetting(db, key) {
  return new Promise(res => {
    const q = db.transaction('settings').objectStore('settings').get(key);
    q.onsuccess = () => res(q.result ? q.result.value : null);
    q.onerror = () => res(null);
  });
}
function putSetting(db, key, value) {
  return new Promise(res => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({key, value});
    tx.oncomplete = res;
    tx.onerror = res;
  });
}
async function showDue() {
  try {
    const db = await openGymDB();
    const queue = (await getSetting(db, 'notifQueue')) || [];
    const shown = (await getSetting(db, 'notifShown')) || [];
    const now = Date.now();
    for (const n of queue) {
      if (n.at <= now && n.at > now - 12 * 3600 * 1000 && !shown.includes(n.id)) {
        await self.registration.showNotification(n.title, {body: n.body, tag: n.id, data: {url: n.url}});
        shown.push(n.id);
      }
    }
    await putSetting(db, 'notifShown', shown.slice(-200));
  } catch (e) {}
}
self.addEventListener('periodicsync', e => {
  if (e.tag === 'gym-reminders') e.waitUntil(showDue());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    for (const c of list) {
      if ('navigate' in c) return c.navigate(url).then(c2 => (c2 || c).focus());
    }
    return self.clients.openWindow(url);
  }));
});
