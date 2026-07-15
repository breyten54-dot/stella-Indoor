import { VAPID_PUBLIC_KEY } from '@/admin/lib/pushConfig';

export interface PushResult {
  success: boolean;
  error?: string;
  step?: string;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function uint8ArrayToBase64Url(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const FUNCTIONS_BASE = 'https://europe-west1-stella-indoor.cloudfunctions.net';

export async function subscribeToPush(userEmail: string): Promise<PushResult> {
  try {
    if (!isPushSupported()) {
      return { success: false, error: 'Push notifications not supported', step: 'support' };
    }
    if (!VAPID_PUBLIC_KEY) {
      return { success: false, error: 'VAPID public key not configured', step: 'config' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: `Permission ${permission}`, step: 'permission' };
    }

    let registration: ServiceWorkerRegistration;
    try {
      const existing = await navigator.serviceWorker.getRegistration('/sw.js');
      registration = existing || await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    } catch (err: unknown) {
      return { success: false, error: `SW failed: ${err instanceof Error ? err.message : 'unknown'}`, step: 'sw' };
    }

    try {
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        const existingKey = existing.options.applicationServerKey;
        if (existingKey) {
          const existingKeyB64 = uint8ArrayToBase64Url(new Uint8Array(existingKey as ArrayBuffer));
          if (existingKeyB64 !== VAPID_PUBLIC_KEY) {
            await existing.unsubscribe();
          } else {
            await existing.unsubscribe();
          }
        } else {
          await existing.unsubscribe();
        }
      }
    } catch {
      // ignore cleanup errors
    }

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

    const subJson = subscription.toJSON() as Record<string, unknown>;
    const keys = (subJson.keys || {}) as Record<string, string>;

    const response = await fetch(`${FUNCTIONS_BASE}/subscribeClient`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        userEmail: userEmail.toLowerCase().trim(),
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
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!registration) return { success: true };
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return { success: true };

    await subscription.unsubscribe();

    await fetch(`${FUNCTIONS_BASE}/unsubscribeClient`, {
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
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!registration) return false;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}
