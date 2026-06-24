import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (localStorage.getItem('install-prompt-dismissed') === 'true') return;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem('install-prompt-dismissed', 'true');
    }
    setDeferredPrompt(null);
    setShow(false);
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('install-prompt-dismissed', 'true');
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:w-96 animate-fade-in">
      <div className="bg-[#1B7A40] rounded-2xl shadow-xl shadow-black/30 p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
          <Smartphone className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">Install Stella Indoor</p>
          <p className="text-xs text-white/80 mt-0.5">Add to your home screen for quick access to bookings</p>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={handleInstall} className="h-9 px-4 rounded-lg bg-white text-[#1B7A40] text-xs font-bold flex items-center gap-1.5 hover:bg-white/90 transition-colors">
              <Download className="w-3.5 h-3.5" /> Install App
            </button>
            <button onClick={handleDismiss} className="h-9 px-3 rounded-lg bg-white/10 text-white text-xs font-bold flex items-center gap-1 hover:bg-white/20 transition-colors">
              <X className="w-3.5 h-3.5" /> Not Now
            </button>
          </div>
        </div>
        <button onClick={handleDismiss} className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-colors shrink-0">
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
