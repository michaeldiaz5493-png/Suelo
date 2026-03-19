// ═══════════════════════════════════════════════
// SUELO — Service Worker v1.0
// Cache First para assets UI
// Network pass-through para Claude API y geolocalización
// ═══════════════════════════════════════════════

const CACHE = 'suelo-v1.0';
const PRECACHE = [
  '/index.html', '/manifest.json',
  '/icons/icon-192x192.png', '/icons/icon-512x512.png',
  '/icons/icon-180x180.png',
  '/icons-maskable/maskable-192x192.png',
  '/icons-maskable/maskable-512x512.png'
];

// ── INSTALL ──────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // NUNCA interceptar — privacidad + funcionalidad
  if (url.hostname === 'api.anthropic.com') return;
  if (url.hostname === 'ipapi.co') return;

  // Google Fonts — Network first con cache fallback
  if (url.hostname.includes('fonts.google') || url.hostname.includes('fonts.gstatic')) {
    e.respondWith(
      fetch(e.request).then(res => {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Todo lo demás — Cache first, stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) {
        fetch(e.request).then(fresh => {
          if (fresh?.status === 200)
            caches.open(CACHE).then(c => c.put(e.request, fresh));
        }).catch(() => {});
        return cached;
      }
      return fetch(e.request).then(res => {
        if (res?.status === 200 && res.type !== 'opaque')
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});

// ── PUSH NOTIFICATIONS ────────────────────────
self.addEventListener('push', e => {
  const d = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(d.title || 'SUELO', {
      body:    d.body || '¿Cómo estás hoy? Tus herramientas te esperan.',
      icon:    '/icons/icon-192x192.png',
      badge:   '/icons/icon-96x96.png',
      vibrate: [100, 50, 100],
      tag:     'suelo-reminder',
      renotify: false,
      data:    { url: d.url || '/' },
      actions: [
        { action: 'crisis', title: '⚡ Necesito ayuda ahora' },
        { action: 'open',   title: 'Abrir SUELO' }
      ]
    })
  );
});

// ── NOTIFICATION CLICK ────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.action === 'crisis' ? '/?crisis=1' : '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        for (const c of list) {
          if (c.url.includes(self.location.origin) && 'focus' in c) {
            c.focus();
            c.postMessage({ type: 'SW_ACTION', action: e.action, url: target });
            return;
          }
        }
        if (clients.openWindow) return clients.openWindow(target);
      })
  );
});
