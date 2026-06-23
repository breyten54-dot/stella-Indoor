import { useState, useEffect, useCallback } from 'react';
import { X, Download, Share, PlusSquare, MoreVertical, Home } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    if (isStandalone) {
      setInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowModal(false);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const openInstall = useCallback(() => {
    if (installed) return;
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(({ outcome }: { outcome: string }) => {
        if (outcome === 'accepted') setInstalled(true);
        setDeferredPrompt(null);
      });
    } else {
      setShowModal(true);
    }
  }, [deferredPrompt, installed]);

  return { installed, showModal, setShowModal, openInstall };
}

type Platform = 'ios-safari' | 'android-chrome' | 'samsung' | 'desktop' | 'other-mobile';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isSamsung = /SamsungBrowser/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edge|Edg/.test(ua);
  const isDesktop = !/Mobi|Android|iPhone|iPad|iPod/.test(ua);

  if (isSamsung) return 'samsung';
  if (isIOS) return 'ios-safari';
  if (isAndroid && isChrome) return 'android-chrome';
  if (isDesktop) return 'desktop';
  return 'other-mobile';
}

interface InstallModalProps {
  open: boolean;
  onClose: () => void;
}

export function InstallModal({ open, onClose }: InstallModalProps) {
  const [platform] = useState<Platform>(detectPlatform);

  if (!open) return null;

  const steps: Record<Platform, { title: string; icon: React.ReactNode; desc: string }[]> = {
    'ios-safari': [
      { title: 'Tap the Share button', icon: <Share className="w-5 h-5 text-[#60A5FA]" />, desc: 'Look for the square icon with an arrow at the bottom of Safari' },
      { title: 'Scroll and tap "Add to Home Screen"', icon: <PlusSquare className="w-5 h-5 text-[#7ED321]" />, desc: 'It has a + icon. You may need to scroll down in the share menu' },
      { title: 'Tap "Add"', icon: <Home className="w-5 h-5 text-[#1B7A40]" />, desc: 'The Stella Indoor icon will appear on your home screen' },
    ],
    'android-chrome': [
      { title: 'Tap the menu (3 dots)', icon: <MoreVertical className="w-5 h-5 text-[#60A5FA]" />, desc: 'In the top-right corner of Chrome' },
      { title: 'Tap "Add to Home screen"', icon: <PlusSquare className="w-5 h-5 text-[#7ED321]" />, desc: 'Or "Install app" if available' },
      { title: 'Tap "Add"', icon: <Home className="w-5 h-5 text-[#1B7A40]" />, desc: 'The Stella Indoor icon will appear on your home screen' },
    ],
    'samsung': [
      { title: 'Tap the menu', icon: <MoreVertical className="w-5 h-5 text-[#60A5FA]" />, desc: 'Bottom-right of Samsung Internet' },
      { title: 'Tap "Add page to"', icon: <PlusSquare className="w-5 h-5 text-[#7ED321]" />, desc: 'Then select "Home screen"' },
      { title: 'Tap "Add"', icon: <Home className="w-5 h-5 text-[#1B7A40]" />, desc: 'The Stella Indoor icon will appear on your home screen' },
    ],
    'desktop': [
      { title: 'Chrome: Click the install icon', icon: <Download className="w-5 h-5 text-[#60A5FA]" />, desc: 'Look for a computer+arrow icon in the address bar' },
      { title: 'Or use the menu', icon: <MoreVertical className="w-5 h-5 text-[#60A5FA]" />, desc: 'Chrome menu → Cast, save and share → Install page as app' },
      { title: 'Done!', icon: <Home className="w-5 h-5 text-[#1B7A40]" />, desc: 'The app will open in its own window, just like a desktop app' },
    ],
    'other-mobile': [
      { title: 'Open your browser menu', icon: <MoreVertical className="w-5 h-5 text-[#60A5FA]" />, desc: 'Usually 3 dots or lines in the corner' },
      { title: 'Tap "Add to Home Screen"', icon: <PlusSquare className="w-5 h-5 text-[#7ED321]" />, desc: 'Or "Install" / "Add shortcut"' },
      { title: 'Tap "Add"', icon: <Home className="w-5 h-5 text-[#1B7A40]" />, desc: 'The Stella Indoor icon will appear on your home screen' },
    ],
  };

  const platformLabels: Record<Platform, string> = {
    'ios-safari': 'iPhone / iPad (Safari)',
    'android-chrome': 'Android (Chrome)',
    'samsung': 'Samsung Internet',
    'desktop': 'Desktop Browser',
    'other-mobile': 'Your Browser',
  };

  const currentSteps = steps[platform] || steps['other-mobile'];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-[#141414] border border-[#2A2A2A] rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="text-lg font-bold text-white">Install Stella Indoor</h2>
            <p className="text-xs text-[#8A8A8A] mt-0.5">{platformLabels[platform]}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#2A2A2A] flex items-center justify-center text-[#8A8A8A] hover:text-white hover:bg-[#3A3A3A] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Steps */}
        <div className="px-5 pb-2">
          <div className="space-y-1">
            {currentSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 py-3">
                <div className="flex flex-col items-center gap-1 self-stretch">
                  <div className="w-10 h-10 rounded-xl bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center shrink-0">
                    {step.icon}
                  </div>
                  {i < currentSteps.length - 1 && (
                    <div className="w-px flex-1 bg-[#2A2A2A] min-h-[20px]" />
                  )}
                </div>
                <div className="pt-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#1B7A40]/20 text-[#7ED321] text-[10px] font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-sm font-semibold text-white">{step.title}</p>
                  </div>
                  <p className="text-xs text-[#8A8A8A] mt-1 leading-relaxed pl-7">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-2">
          <button
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-[#1B7A40] text-white text-sm font-bold hover:bg-[#145C32] transition-colors active:scale-[0.98]"
          >
            Got it
          </button>
          <p className="text-center text-[11px] text-[#5A5A5A] mt-3">
            Stella Indoor works best as an installed app on your home screen
          </p>
        </div>
      </div>
    </div>
  );
}
