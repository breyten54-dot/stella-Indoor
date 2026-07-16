import { useState, useEffect } from 'react';
import { X, Battery, Smartphone, AlertTriangle, Check, ChevronDown, ChevronUp } from 'lucide-react';

export type DeviceType = 'samsung' | 'xiaomi' | 'huawei' | 'oppo' | 'vivo' | 'oneplus' | 'ios' | 'android' | 'windows' | 'macos' | 'generic';

export interface DeviceInfo {
  type: DeviceType;
  label: string;
  os: string;
}

export function detectDevice(): DeviceInfo {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';

  // Mobile OS/manufacturer detection
  if (/iphone|ipad|ipod/.test(ua) || /macintosh/.test(ua) && 'ontouchend' in document) {
    return { type: 'ios', label: 'iPhone / iPad', os: 'iOS' };
  }
  if (/samsung/.test(ua)) return { type: 'samsung', label: 'Samsung', os: 'Android' };
  if (/xiaomi|miui|redmi/.test(ua)) return { type: 'xiaomi', label: 'Xiaomi / Redmi', os: 'Android' };
  if (/huawei|honor/.test(ua)) return { type: 'huawei', label: 'Huawei / Honor', os: 'Android' };
  if (/oppo|coloros/.test(ua)) return { type: 'oppo', label: 'OPPO', os: 'Android' };
  if (/vivo|funtouch/.test(ua)) return { type: 'vivo', label: 'vivo', os: 'Android' };
  if (/oneplus|oxygen/.test(ua)) return { type: 'oneplus', label: 'OnePlus', os: 'Android' };
  if (/android/.test(ua)) return { type: 'android', label: 'Android', os: 'Android' };
  if (/win32|win64|windows/.test(platform) || /windows/.test(ua)) return { type: 'windows', label: 'Windows', os: 'Windows' };
  if (/macintosh|mac os/.test(ua)) return { type: 'macos', label: 'macOS', os: 'macOS' };

  return { type: 'generic', label: 'this device', os: 'your OS' };
}

interface Step {
  title: string;
  steps: string[];
}

const GUIDES: Record<DeviceType, { title: string; intro: string; sections: Step[] }> = {
  samsung: {
    title: 'Samsung battery settings',
    intro: 'Samsung closes background apps aggressively. Follow these steps exactly to keep Stella Admin notifications reliable.',
    sections: [
      {
        title: 'Step 1: Set Chrome to Unrestricted',
        steps: [
          'Open Device Settings',
          'Tap Apps',
          'Tap Chrome',
          'Tap Battery',
          'Tap Unrestricted',
        ],
      },
      {
        title: 'Step 2: Add Chrome to Never sleeping apps',
        steps: [
          'Open Device Settings',
          'Tap Battery',
          'Tap Background usage limits',
          'Tap Never sleeping apps',
          'Tap + (Add apps)',
          'Select Chrome',
        ],
      },
      {
        title: 'Step 3: If Stella Admin appears as its own app',
        steps: [
          'Open Device Settings',
          'Tap Apps',
          'Tap Stella Admin',
          'Tap Battery',
          'Tap Unrestricted',
        ],
      },
      {
        title: 'Step 4: Enable the pop-up banner (Samsung One UI)',
        steps: [
          'Open Device Settings',
          'Tap Notifications',
          'Tap App notifications',
          'Tap Stella Admin',
          'Scroll down and tap Notification categories',
          'Tap the Stella Indoor / General / Sites channel',
          'Set Importance to Urgent',
          'Enable Show as pop-up',
        ],
      },
    ],
  },
  xiaomi: {
    title: 'Xiaomi / Redmi / MIUI battery settings',
    intro: 'MIUI restricts background apps heavily. Follow these steps exactly.',
    sections: [
      {
        title: 'Step 1: Set Chrome to No restrictions',
        steps: [
          'Open Device Settings',
          'Tap Apps',
          'Tap Manage apps',
          'Tap Chrome',
          'Tap Battery saver',
          'Tap No restrictions',
        ],
      },
      {
        title: 'Step 2: Allow Chrome to autostart',
        steps: [
          'Open Device Settings',
          'Tap Apps',
          'Tap Permissions',
          'Tap Autostart',
          'Enable Chrome',
        ],
      },
    ],
  },
  huawei: {
    title: 'Huawei / Honor battery settings',
    intro: 'EMUI kills background apps by default. Follow these steps exactly.',
    sections: [
      {
        title: 'Step 1: Protect Chrome from being closed',
        steps: [
          'Open Device Settings',
          'Tap Battery',
          'Tap App launch',
          'Find Chrome',
          'Tap Manage manually',
          'Enable Auto-launch',
          'Enable Secondary launch',
          'Enable Run in background',
        ],
      },
    ],
  },
  oppo: {
    title: 'OPPO / ColorOS battery settings',
    intro: 'ColorOS has aggressive battery optimization. Follow these steps exactly.',
    sections: [
      {
        title: 'Allow Chrome to run in the background',
        steps: [
          'Open Device Settings',
          'Tap Battery',
          'Tap App battery management',
          'Tap Chrome',
          'Tap Allow background running',
        ],
      },
    ],
  },
  vivo: {
    title: 'vivo / Funtouch OS battery settings',
    intro: 'Funtouch OS restricts background apps. Follow these steps exactly.',
    sections: [
      {
        title: 'Allow Chrome high background power use',
        steps: [
          'Open Device Settings',
          'Tap Battery',
          'Tap High background power consumption',
          'Find Chrome',
          'Enable / Allow',
        ],
      },
    ],
  },
  oneplus: {
    title: 'OnePlus / OxygenOS battery settings',
    intro: 'OxygenOS has app battery optimization. Follow these steps exactly.',
    sections: [
      {
        title: 'Disable battery optimization for Chrome',
        steps: [
          'Open Device Settings',
          'Tap Apps',
          'Tap Chrome',
          'Tap Battery usage',
          'Tap Battery optimization',
          'Tap Don\'t optimize',
        ],
      },
    ],
  },
  ios: {
    title: 'iOS PWA notifications',
    intro: 'iOS supports web push for installed PWAs, but it is less reliable than native apps. Follow these steps exactly.',
    sections: [
      {
        title: 'Step 1: Install Stella Admin on your Home Screen',
        steps: [
          'Open Stella Admin in Safari',
          'Tap the Share button',
          'Tap Add to Home Screen',
          'Tap Add',
          'Open Stella Admin from the Home Screen icon',
        ],
      },
      {
        title: 'Step 2: Allow notifications',
        steps: [
          'Open Device Settings',
          'Tap Notifications',
          'Tap Stella Admin',
          'Enable Allow Notifications',
          'Enable Lock Screen',
          'Enable Notification Centre',
          'Enable Banners',
        ],
      },
      {
        title: 'Step 3: Keep the app active',
        steps: [
          'Open Stella Admin at least once every few days',
          'iOS may clear PWA data if unused for ~7 days',
        ],
      },
    ],
  },
  android: {
    title: 'Android battery settings',
    intro: 'Android may restrict background apps to save battery. Follow these steps exactly.',
    sections: [
      {
        title: 'Step 1: Set Chrome to Unrestricted',
        steps: [
          'Open Device Settings',
          'Tap Apps',
          'Tap Chrome',
          'Tap Battery',
          'Tap Unrestricted',
        ],
      },
      {
        title: 'Step 2: If Stella Admin appears as its own app',
        steps: [
          'Open Device Settings',
          'Tap Apps',
          'Tap Stella Admin',
          'Tap Battery',
          'Tap Unrestricted',
        ],
      },
      {
        title: 'Step 3: Enable the pop-up banner',
        steps: [
          'Open Device Settings',
          'Tap Apps',
          'Tap Stella Admin',
          'Tap Notifications',
          'Tap the Stella Indoor / General / Sites channel',
          'Set Importance to High',
          'Enable Pop on screen',
        ],
      },
    ],
  },
  windows: {
    title: 'Windows notification settings',
    intro: 'If you are using Chrome or Edge on Windows, follow these steps exactly.',
    sections: [
      {
        title: 'Allow browser notifications',
        steps: [
          'Open Windows Settings',
          'Tap System',
          'Tap Notifications',
          'Enable Notifications',
          'Find Chrome or Edge in the list',
          'Enable it',
        ],
      },
      {
        title: 'Check Focus assist',
        steps: [
          'Open Windows Settings',
          'Tap System',
          'Tap Focus assist',
          'Turn off Priority only or Alarms only if active',
        ],
      },
    ],
  },
  macos: {
    title: 'macOS notification settings',
    intro: 'macOS may suppress browser notifications. Follow these steps exactly.',
    sections: [
      {
        title: 'Allow browser notifications',
        steps: [
          'Open System Settings',
          'Tap Notifications',
          'Find Chrome or Edge',
          'Tap it',
          'Enable Allow Notifications',
        ],
      },
    ],
  },
  generic: {
    title: 'Battery / notification settings',
    intro: 'Your device may restrict background apps. Follow these steps exactly.',
    sections: [
      {
        title: 'Disable battery optimization',
        steps: [
          'Open Device Settings',
          'Tap Apps',
          'Find Chrome (or the browser you used to install Stella Admin)',
          'Tap Battery',
          'Tap Unrestricted or Don\'t optimize',
          'Repeat for Stella Admin if it appears as its own app',
        ],
      },
    ],
  },
};

interface Props {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}

export function BatteryOptimizationGuide({ open, onClose, onDone }: Props) {
  const [device, setDevice] = useState<DeviceInfo>({ type: 'generic', label: 'this device', os: 'your OS' });
  const [expanded, setExpanded] = useState<number[]>([0]);
  const [markedDone, setMarkedDone] = useState(false);

  useEffect(() => {
    if (open) {
      setDevice(detectDevice());
    }
  }, [open]);

  if (!open) return null;

  const guide = GUIDES[device.type] || GUIDES.generic;

  const toggleSection = (idx: number) => {
    setExpanded(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]);
  };

  const handleDone = () => {
    localStorage.setItem('stella-admin-battery-guide-seen', '1');
    setMarkedDone(true);
    onDone?.();
    setTimeout(onClose, 800);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-[#13182b] border-b border-[#1e293b] p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#6366f1]/20 flex items-center justify-center shrink-0">
            <Battery className="w-5 h-5 text-[#818cf8]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-white">{guide.title}</h2>
            <p className="text-xs text-[#94a3b8] mt-0.5">Detected: {device.label}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-[#1e293b] hover:bg-[#334155] flex items-center justify-center text-[#64748b] hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200">{guide.intro}</p>
          </div>

          {guide.sections.map((section, idx) => (
            <div key={idx} className="border border-[#1e293b] rounded-xl overflow-hidden">
              <button
                onClick={() => toggleSection(idx)}
                className="w-full flex items-center justify-between p-3 bg-[#0b0f1e] hover:bg-[#1e293b] transition-colors"
              >
                <span className="text-sm font-bold text-white text-left">{section.title}</span>
                {expanded.includes(idx) ? (
                  <ChevronUp className="w-4 h-4 text-[#64748b]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[#64748b]" />
                )}
              </button>
              {expanded.includes(idx) && (
                <div className="p-3 space-y-2">
                  {section.steps.map((step, sidx) => (
                    <div key={sidx} className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#6366f1]/20 text-[#818cf8] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {sidx + 1}
                      </span>
                      <p className="text-xs text-[#cbd5e1]">{step}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="flex items-start gap-2 p-3 rounded-xl bg-[#6366f1]/10 border border-[#6366f1]/20">
            <Smartphone className="w-4 h-4 text-[#818cf8] shrink-0 mt-0.5" />
            <p className="text-xs text-[#94a3b8]">
              You can reopen this guide anytime from <strong>Settings → Push Notifications</strong>.
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-[#13182b] border-t border-[#1e293b] p-4">
          <button
            onClick={handleDone}
            disabled={markedDone}
            className={`w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 ${
              markedDone
                ? 'bg-[#6366f1]/20 text-[#818cf8] border border-[#6366f1]/30'
                : 'bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:from-[#5558e0] hover:to-[#7c4ee5] text-white'
            }`}
          >
            {markedDone ? <><Check className="w-4 h-4" /> Saved</> : 'I’ve done this'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BatteryOptimizationButton({ onClick }: { onClick: () => void }) {
  const [device, setDevice] = useState<DeviceInfo>({ type: 'generic', label: 'this device', os: 'your OS' });

  useEffect(() => {
    setDevice(detectDevice());
  }, []);

  return (
    <button
      onClick={onClick}
      className="w-full mt-3 h-10 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-bold flex items-center justify-center gap-2 hover:bg-amber-500/20 transition-colors"
    >
      <Battery className="w-4 h-4" />
      Keep notifications reliable on {device.label}
    </button>
  );
}
