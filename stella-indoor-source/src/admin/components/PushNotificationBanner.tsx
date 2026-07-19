import { useEffect, useState } from 'react';
import { Bell, X, AlertTriangle } from 'lucide-react';
import { isPushSupported, isPushSubscribed, subscribeToPush, getNotificationPermission } from '@/admin/lib/pushNotifications';
import { BatteryOptimizationGuide } from '@/admin/components/BatteryOptimizationGuide';

export function PushNotificationBanner() {
  const [visible, setVisible] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const check = async () => {
      if (!isPushSupported()) return;
      const permission = getNotificationPermission();
      if (permission === 'denied') {
        // K-16B: don't silently vanish — show a recovery state so a denied admin
        // knows notifications are blocked and how to re-enable them. A denied
        // state cannot be re-prompted programmatically; it needs the browser
        // site-settings change, so there is intentionally NO Enable button here.
        setBlocked(true);
        setVisible(true);
        return;
      }
      setBlocked(false);
      const subbed = await isPushSubscribed();
      setVisible(!subbed);
    };
    check();
  }, []);

  const handleEnable = async () => {
    setLoading(true);
    setError('');
    const result = await subscribeToPush();
    if (result.success) {
      setVisible(false);
      setShowGuide(true);
    } else {
      setError(result.error || 'Failed to enable notifications');
      if (result.error?.includes('Permission denied')) {
        setVisible(false);
      }
    }
    setLoading(false);
  };

  return (
    <>
      {visible && (
        <div className={blocked ? 'bg-amber-500/10 border-b border-amber-500/20 px-4 py-3' : 'bg-[#6366f1]/10 border-b border-[#6366f1]/20 px-4 py-3'}>
          <div className="max-w-7xl mx-auto flex items-start sm:items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${blocked ? 'bg-amber-500/20' : 'bg-[#6366f1]/20'}`}>
              {blocked ? <AlertTriangle className="w-4 h-4 text-amber-400" /> : <Bell className="w-4 h-4 text-[#818cf8]" />}
            </div>
            <div className="flex-1 min-w-0">
              {blocked ? (
                <>
                  <p className="text-sm font-bold text-white">Notifications are blocked for this site</p>
                  <p className="text-xs text-[#94a3b8] mt-0.5">
                    To turn them back on, allow notifications for this app in your browser's site settings
                    (lock/tune icon left of the address bar → Site settings → Notifications → Allow), then reload.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-white">Enable background notifications</p>
                  <p className="text-xs text-[#94a3b8] mt-0.5">
                    Get notified about new bookings and cancellations even when Stella Admin is closed.
                  </p>
                  {error && (
                    <div className="flex items-start gap-1.5 mt-1.5">
                      <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-400">{error}</p>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!blocked && (
                <button
                  onClick={handleEnable}
                  disabled={loading}
                  className="h-9 px-4 rounded-lg bg-[#6366f1] hover:bg-[#5558e0] text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {loading ? 'Enabling...' : 'Enable'}
                </button>
              )}
              <button
                onClick={() => setVisible(false)}
                className="w-8 h-8 rounded-lg bg-[#1e293b] hover:bg-[#334155] flex items-center justify-center text-[#64748b] hover:text-white transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      <BatteryOptimizationGuide open={showGuide} onClose={() => setShowGuide(false)} />
    </>
  );
}
