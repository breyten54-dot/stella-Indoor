const CACHE_NAME = 'stella-client-v2';
const SW_VERSION = 'v2';
const PRECACHE = ['/', '/index.html', '/manifest.json', '/logo-original.jpg'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept Firebase internal endpoints (auth iframe, init, etc.)
  if (url.pathname.startsWith('/__/')) return;

  // Network-first for navigation / HTML so updates are picked up quickly
  if (request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          return networkResponse;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Cache-first for same-origin static assets (hashed JS/CSS, icons, fonts)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
        return networkResponse;
      });
    })
  );
});

// Display push notifications sent from the Cloud Functions
self.addEventListener('push', (event) => {
  let payload = { title: 'Stella Indoor', body: '', url: 'https://stella-indoor.web.app' };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    // Use defaults if payload is invalid
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/logo-original.jpg',
      badge: payload.badge || '/badge-client.png',
      tag: payload.tag || 'stella-indoor',
      data: { url: payload.url },
      vibrate: [300, 100, 300],
      renotify: true,
      requireInteraction: payload.requireInteraction !== 'false',
      timestamp: Date.now(),
      silent: false,
      actions: payload.actions || [{ action: 'open', title: 'Open' }],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || 'https://stella-indoor.web.app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldSubscription = event.oldSubscription ? event.oldSubscription.toJSON() : null;
        const newSubscription = event.newSubscription ? event.newSubscription.toJSON() : null;
        if (!oldSubscription || !newSubscription) return;

        await fetch(`${self.location.origin}/updateClientPushSubscription`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            oldEndpoint: oldSubscription.endpoint,
            newEndpoint: newSubscription.endpoint,
            keys: newSubscription.keys,
            deviceInfo: self.navigator?.userAgent || 'Unknown',
          }),
        });
      } catch (err) {
        console.error('[SW] pushsubscriptionchange failed:', err);
      }
    })()
  );
});
