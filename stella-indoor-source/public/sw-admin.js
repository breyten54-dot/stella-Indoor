/**
 * Stella Indoor - Service Worker Kill Switch
 * Replaces any older service workers, clears all caches, then self-unregisters.
 */

self.addEventListener('install', function() {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(cacheNames.map(function(name) {
        return caches.delete(name);
      }));
    }).then(function() {
      return self.clients.claim();
    }).then(function() {
      return self.registration.unregister();
    })
  );
});
