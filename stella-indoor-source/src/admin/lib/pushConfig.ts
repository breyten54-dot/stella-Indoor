// VAPID Public Key - safe to expose in client code.
// Set VITE_VAPID_PUBLIC_KEY in your build environment and rebuild.
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

if (!VAPID_PUBLIC_KEY) {
  console.warn(
    '[pushConfig] VITE_VAPID_PUBLIC_KEY is not set. Push notifications will not work.'
  );
}
