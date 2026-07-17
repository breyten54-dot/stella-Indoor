import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

interface ServiceWorkerUpdaterProps {
  swPath: string;
  variant?: 'client' | 'admin';
}

export function ServiceWorkerUpdater({ swPath, variant = 'client' }: ServiceWorkerUpdaterProps) {
  const isAdmin = variant === 'admin';
  const bg = isAdmin ? 'bg-[#6366f1]' : 'bg-[#1B7A40]';
  const buttonText = isAdmin ? 'text-[#6366f1]' : 'text-[#1B7A40]';
  const [show, setShow] = useState(false);
  const regRef = useRef<ServiceWorkerRegistration | null>(null);

  // Escape hatch for genuinely breaking changes: set VITE_FORCE_UPDATE_PROMPT=true
  // at build time to force the old "Update available" prompt. The CLIENT defaults to
  // silent updates so ordinary additive deploys do not interrupt the user mid-session.
  // The ADMIN app keeps its existing prompt unless the global escape hatch is on.
  const FORCE_UPDATE_PROMPT =
    (import.meta.env as Record<string, unknown>).VITE_FORCE_UPDATE_PROMPT === 'true';
  const silentByDefault = !isAdmin && !FORCE_UPDATE_PROMPT;

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let intervalId: number | undefined;
    let visibilityHandler: (() => void) | undefined;
    let mounted = true;

    const handleUpdateFound = () => {
      const worker = regRef.current?.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated' && navigator.serviceWorker.controller) {
          if (silentByDefault) {
            // Silent mode: let the waiting worker take over. The SW already calls
            // skipWaiting() and clients.claim(), so the new version becomes active
            // on the next navigation / app open without a mid-session reload.
            const waiting = regRef.current?.waiting || regRef.current?.installing;
            if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
          } else {
            // Admin default, or breaking-change mode forced by VITE_FORCE_UPDATE_PROMPT:
            // show the old prompt so the user reloads now.
            setShow(true);
          }
        }
      });
    };

    navigator.serviceWorker
      .register(swPath, { updateViaCache: 'none' })
      .then((reg) => {
        if (!mounted) return;
        regRef.current = reg;
        reg.addEventListener('updatefound', handleUpdateFound);

        // Check for updates periodically and when the app comes back to the foreground
        intervalId = window.setInterval(() => reg.update(), 60 * 60 * 1000);
        visibilityHandler = () => {
          if (!document.hidden) reg.update();
        };
        document.addEventListener('visibilitychange', visibilityHandler);
      })
      .catch((err) => console.error(`[SW] Failed to register ${swPath}:`, err));

    return () => {
      mounted = false;
      if (intervalId) window.clearInterval(intervalId);
      if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
      const reg = regRef.current;
      if (reg) reg.removeEventListener('updatefound', handleUpdateFound);
    };
  }, [swPath, silentByDefault]);

  const handleUpdate = async () => {
    setShow(false);
    const reg = regRef.current;
    const worker = reg?.waiting || reg?.installing;
    if (worker) worker.postMessage({ type: 'SKIP_WAITING' });

    // Wait for the new service worker to take control, then reload
    await new Promise<void>((resolve) => {
      if (!navigator.serviceWorker.controller || navigator.serviceWorker.controller.state === 'redundant') {
        resolve();
        return;
      }
      const onChange = () => {
        navigator.serviceWorker.removeEventListener('controllerchange', onChange);
        resolve();
      };
      navigator.serviceWorker.addEventListener('controllerchange', onChange);
      window.setTimeout(() => {
        navigator.serviceWorker.removeEventListener('controllerchange', onChange);
        resolve();
      }, 3000);
    });

    window.location.reload();
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[60] sm:left-auto sm:right-4 sm:w-96 animate-fade-in">
      <div className={`${bg} rounded-2xl shadow-xl shadow-black/30 p-4 flex items-start gap-3`}>
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
          <RefreshCw className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">Update available</p>
          <p className="text-xs text-white/80 mt-0.5">
            A newer version of the app has been released. Tap update to get the latest fixes.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleUpdate}
              className={`h-9 px-4 rounded-lg bg-white ${buttonText} text-xs font-bold flex items-center gap-1.5 hover:bg-white/90 transition-colors`}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Update Now
            </button>
            <button
              onClick={() => setShow(false)}
              className="h-9 px-3 rounded-lg bg-white/10 text-white text-xs font-bold flex items-center gap-1 hover:bg-white/20 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
