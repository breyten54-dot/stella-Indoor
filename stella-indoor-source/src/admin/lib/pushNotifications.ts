import { VAPID_PUBLIC_KEY } from './pushConfig';

export interface PushResult {
  success: boolean;
  error?: string;
  step?: string;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'default';
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

const FUNCTIONS_BASE = 'https://us-central1-stella-indoor.cloudfunctions.net';

export async function subscribeToPush(): Promise<PushResult> {
  try {
    if (!isPushSupported()) {
      return { success: false, error: 'Push notifications not supported', step: 'support' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: `Permission ${permission}`, step: 'permission' };
    }

    // Register service worker
    let registration: ServiceWorkerRegistration;
    try {
      const existing = await navigator.serviceWorker.getRegistration('/sw-admin.js');
      registration = existing || await navigator.serviceWorker.register('/sw-admin.js');
      await navigator.serviceWorker.ready;
    } catch (err: unknown) {
      return { success: false, error: `SW failed: ${err instanceof Error ? err.message : 'unknown'}`, step: 'sw' };
    }

    // Subscribe to push
    let subscription: PushSubscription;
    try {
      const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key as unknown as ArrayBuffer,
      });
    } catch (err: unknown) {
      return { success: false, error: `Subscribe failed: ${err instanceof Error ? err.message : 'unknown'}`, step: 'push' };
    }

    // Send to backend via HTTP
    const subJson = subscription.toJSON() as Record<string, unknown>;
    const keys = (subJson.keys || {}) as Record<string, string>;

    const response = await fetch(`${FUNCTIONS_BASE}/subscribeAdmin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        deviceInfo: navigator.userAgent,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `Server ${response.status}: ${text}`, step: 'server' };
    }

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: `Unexpected: ${err instanceof Error ? err.message : 'unknown'}`, step: 'unknown' };
  }
}

export async function unsubscribeFromPush(): Promise<PushResult> {
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw-admin.js');
    if (!registration) return { success: true };
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return { success: true };

    await subscription.unsubscribe();

    await fetch(`${FUNCTIONS_BASE}/unsubscribeAdmin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: `Unsubscribe failed: ${err instanceof Error ? err.message : 'unknown'}` };
  }
}

export async function isPushSubscribed(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw-admin.js');
    if (!registration) return false;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}
