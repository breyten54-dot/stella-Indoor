import { useState, useEffect } from 'react';
import { ListChecks, Check } from 'lucide-react';
import { isPushSubscribed, getNotificationPermission } from '@/admin/lib/pushNotifications';

type Platform = 'android' | 'ios';

function detectPlatform(): Platform {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'ios' : 'android';
}

interface Step {
  title: string;
  detail: string;
  // 'installed' / 'push' are auto-checked live; undefined steps are manual.
  autoCheck?: 'installed' | 'push';
}

const STEPS: Record<Platform, Step[]> = {
  android: [
    {
      title: 'Install the app to your home screen',
      detail: 'Open this site in Chrome → tap the ⋮ menu → "Add to Home screen" (or "Install app") → Add. Then always open Stella Admin from the home-screen icon.',
      autoCheck: 'installed',
    },
    {
      title: 'Enable push notifications',
      detail: 'In this Settings page, tap "Enable" under Push Notifications and choose Allow when your phone asks.',
      autoCheck: 'push',
    },
    {
      title: 'Allow pop-up banners (one-time phone setting)',
      detail: 'Shortcut: LONG-PRESS the Stella Admin icon on your home screen → tap App info (ⓘ) → Notifications. Turn everything on, and set the notification category (usually "General") to Urgent / "Show as pop-up". On Samsung, if you don\'t see categories: Settings → Notifications → Advanced settings → turn ON "Manage notification categories for each app", then come back here.',
    },
    {
      title: 'Prove it works',
      detail: 'Tap "Send Test Push Notification" above, then press your phone\'s home button. Within a few seconds the notification should drop down from the top of the screen with sound.',
    },
  ],
  ios: [
    {
      title: 'Install the app to your home screen (Safari only)',
      detail: 'Open this site in Safari (not Chrome) → tap the Share button → "Add to Home Screen" → Add. Requires iOS 16.4 or newer. Then always open Stella Admin from the home-screen icon — notifications only work from the installed app.',
      autoCheck: 'installed',
    },
    {
      title: 'Enable push notifications',
      detail: 'In this Settings page, tap "Enable" under Push Notifications and choose Allow when iOS asks.',
      autoCheck: 'push',
    },
    {
      title: 'Banners are on by default',
      detail: 'iOS shows notification banners automatically. If you ever change this: iPhone Settings → Notifications → Stella Admin → Banners.',
    },
    {
      title: 'Prove it works',
      detail: 'Tap "Send Test Push Notification" above, lock the phone or go to the home screen, and watch for the banner.',
    },
  ],
};

export function NotificationSetupGuide() {
  const [platform, setPlatform] = useState<Platform>(detectPlatform());
  const [installed, setInstalled] = useState(false);
  const [pushReady, setPushReady] = useState(false);

  useEffect(() => {
    const check = async () => {
      setInstalled(window.matchMedia('(display-mode: standalone)').matches);
      setPushReady(getNotificationPermission() === 'granted' && (await isPushSubscribed()));
    };
    check();
    // Re-check when the user returns to the page/app so ticks reflect
    // settings changed elsewhere (e.g. enabling push, installing the PWA).
    const onVisible = () => { if (!document.hidden) check(); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const checkState = (step: Step): boolean | null => {
    if (step.autoCheck === 'installed') return installed;
    if (step.autoCheck === 'push') return pushReady;
    return null; // manual step — no live check possible from web code
  };

  const tabClass = (active: boolean) =>
    `flex-1 h-9 rounded-lg text-xs font-bold transition-colors ${
      active ? 'bg-[#6366f1] text-white' : 'bg-[#1e293b] text-[#94a3b8] hover:bg-[#334155]'
    }`;

  return (
    <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] p-6" data-testid="notification-setup-guide">
      <div className="flex items-center gap-2 mb-1">
        <ListChecks className="w-4 h-4 text-[#818cf8]" />
        <h3 className="text-sm font-bold text-[#94a3b8]">Notification Setup — every alert, step by step</h3>
      </div>
      <p className="text-[11px] text-[#475569] mb-4">
        Follow these once per device. Steps with a green tick are already done on this device.
      </p>

      <div className="flex gap-2 mb-4">
        <button className={tabClass(platform === 'android')} onClick={() => setPlatform('android')}>Android</button>
        <button className={tabClass(platform === 'ios')} onClick={() => setPlatform('ios')}>iPhone / iPad</button>
      </div>

      <ol className="space-y-3">
        {STEPS[platform].map((step, i) => {
          const done = checkState(step);
          return (
            <li key={step.title} className="flex items-start gap-3">
              <span
                className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5 ${
                  done ? 'bg-[#1B7A40] text-white' : 'bg-[#1e293b] text-[#94a3b8]'
                }`}
              >
                {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </span>
              <div>
                <p className={`text-xs font-bold ${done ? 'text-[#7ED321]' : 'text-[#cbd5e1]'}`}>
                  {step.title}
                  {done === false && step.autoCheck && (
                    <span className="ml-2 text-[10px] font-normal text-amber-400">not done on this device</span>
                  )}
                </p>
                <p className="text-[11px] text-[#64748b] mt-0.5 leading-relaxed">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="text-[10px] text-[#475569] mt-4">
        Stuck? Run Diagnostics above and send the copied report to support — it shows exactly which step is failing.
      </p>
    </div>
  );
}
