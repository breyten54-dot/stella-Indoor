/**
 * Stella Indoor - Service Worker Kill Switch
 * Replaces any older service workers, clears all caches, then self-unregisters.
 * If any old caches were cleared it reloads the active clients so the new
 * build is served immediately.
 */

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  let hadCaches = false;

  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      hadCaches = cacheNames.length > 0;
      return Promise.all(cacheNames.map(function (name) {
        return caches.delete(name);
      }));
    }).then(function () {
      return self.clients.claim();
    }).then(function () {
      return self.registration.unregister();
    }).then(function () {
      if (hadCaches && self.clients) {
        return self.clients.matchAll({ type: 'window' }).then(function (clients) {
          clients.forEach(function (client) {
            if (client.navigate) {
              client.navigate(client.url);
            }
          });
        });
      }
    })
  );
});
