/**
 * Service Worker Manager
 * Unregisters any existing service worker to prevent cache conflicts
 * between client app and admin dashboard
 */

export function registerServiceWorker() {
  // Unregister ALL service workers to clear old caches
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => {
        console.log('[SW] Unregistering:', reg.scope);
        reg.unregister();
      });
    });
    // Also clear all caches
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => {
          console.log('[SW] Deleting cache:', name);
          caches.delete(name);
        });
      });
    }
  }
}
