const CACHE_NAME = 'stella-admin-v4';
const SW_VERSION = 'v4'; // Parsed by the admin diagnostics panel
const PRECACHE = ['/', '/index.html', '/manifest-admin.json', '/logo-admin.png', '/badge-admin.png'];

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

  // Never intercept Firebase internal endpoints
  if (url.pathname.startsWith('/__/')) return;

  // Network-first for navigation / HTML
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

  // Cache-first for static assets
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
  let payload = { title: 'Stella Indoor', body: '', url: 'https://stella-indoor-admin.web.app' };
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
      icon: payload.icon || '/logo-admin.png',
      // Android uses the badge as a MASK for the status-bar icon — it must be
      // a monochrome (white-on-transparent) image or it renders as a plain
      // white square. badge-admin.png is the crest silhouette at 96x96.
      badge: payload.badge || '/badge-admin.png',
      tag: payload.tag || 'stella-indoor',
      data: { url: payload.url },
      // Heads-up ("drop-down") presentation. On Android, a vibration pattern
      // is what promotes a web notification to the peeking banner; renotify
      // re-alerts when a same-tag notification is replaced instead of
      // updating silently; requireInteraction keeps it on screen until the
      // admin acts on it. iOS ignores these flags and shows its standard
      // slide-down banner (its default) — nothing further is controllable
      // from web code there.
      vibrate: [300, 100, 300],
      renotify: true,
      // `requireInteraction` keeps real alerts on screen until the admin acts.
      // It can be overridden by the payload (e.g. test pushes set it to false so
      // we can isolate whether it suppresses the heads-up banner on Samsung).
      requireInteraction: payload.requireInteraction !== 'false',
      timestamp: Date.now(),
      silent: false,
      // One actionable button so the notification looks like a real native
      // alert and opens the admin calendar on tap.
      actions: payload.actions || [{ action: 'open', title: 'Open' }],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || 'https://stella-indoor-admin.web.app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

// Handle browser-managed subscription rotation so dormant devices stay reachable
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldSubscription = event.oldSubscription ? event.oldSubscription.toJSON() : null;
        const newSubscription = event.newSubscription ? event.newSubscription.toJSON() : null;
        if (!oldSubscription || !newSubscription) return;

        await fetch(`${self.location.origin}/updatePushSubscription`, {
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
