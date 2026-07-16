import { useState, useEffect } from 'react';
import { Save, Check, Clock, Banknote, Bell, BellOff, Shield, Trash2, AlertTriangle, Loader2, Download, Smartphone } from 'lucide-react';
import { deleteAllBookings } from '@/hooks/useFirestoreBookings';
import { isPushSupported, subscribeToPush, unsubscribeFromPush, isPushSubscribed, isPushSubscriptionCurrent } from '@/admin/lib/pushNotifications';
import { useInstallPrompt, InstallModal } from '@/components/InstallModal';
import { useAppSettings } from '@/admin/hooks/useAppSettings';
import { BatteryOptimizationGuide, BatteryOptimizationButton } from '@/admin/components/BatteryOptimizationGuide';
import { PushDiagnostics } from '@/admin/components/PushDiagnostics';
import { NotificationSetupGuide } from '@/admin/components/NotificationSetupGuide';

export function Settings() {
  const { settings, loading: settingsLoading, saveSettings } = useAppSettings();
  const { installed, showModal, setShowModal, openInstall } = useInstallPrompt();

  const [saved, setSaved] = useState(false);
  const [openingTime, setOpeningTime] = useState(settings.openingTime);
  const [closingTime, setClosingTime] = useState(settings.closingTime);
  const [sunClosing, setSunClosing] = useState(settings.sundayClosingTime);
  const [bigPrice, setBigPrice] = useState(String(settings.bigCourtPrice));
  const [multiPrice, setMultiPrice] = useState(String(settings.multiCourtPrice));
  const [payWindow, setPayWindow] = useState(String(settings.paymentWindowMinutes));
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Push notification state
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(true);
  const [pushError, setPushError] = useState('');
  const [showBatteryGuide, setShowBatteryGuide] = useState(false);

  // Sync local form state when Firestore settings load
  useEffect(() => {
    setOpeningTime(settings.openingTime);
    setClosingTime(settings.closingTime);
    setSunClosing(settings.sundayClosingTime);
    setBigPrice(String(settings.bigCourtPrice));
    setMultiPrice(String(settings.multiCourtPrice));
    setPayWindow(String(settings.paymentWindowMinutes));
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings({
        openingTime,
        closingTime,
        sundayClosingTime: sunClosing,
        bigCourtPrice: Number(bigPrice) || 0,
        multiCourtPrice: Number(multiPrice) || 0,
        paymentWindowMinutes: Number(payWindow) || 1,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Failed to save settings: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (clearConfirm) {
      try {
        await deleteAllBookings();
        setClearConfirm(false);
        alert('All bookings have been deleted.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        alert(`Failed to clear bookings: ${msg}`);
      }
    } else {
      setClearConfirm(true);
    }
  };

  // Check push support and subscription status on mount
  useEffect(() => {
    const checkPush = async () => {
      const supported = isPushSupported();
      setPushSupported(supported);

      if (supported) {
        const subscribed = await isPushSubscribed();
        if (subscribed && !(await isPushSubscriptionCurrent())) {
          // VAPID key rotated — clean up the stale subscription so the admin can re-subscribe.
          await unsubscribeFromPush();
          setPushSubscribed(false);
          setPushError('Push keys were updated. Please enable notifications again.');
        } else {
          setPushSubscribed(subscribed);
        }
      }
      setPushLoading(false);
    };
    checkPush();
  }, []);



  // Toggle push subscription
  const handlePushToggle = async () => {
    setPushLoading(true);
    setPushError('');

    if (pushSubscribed) {
      const result = await unsubscribeFromPush();
      if (result.success) {
        setPushSubscribed(false);
      } else {
        setPushError(result.error || 'Failed to unsubscribe');
      }
    } else {
      const result = await subscribeToPush();
      if (result.success) {
        setPushSubscribed(true);
      } else {
        setPushError(result.error || 'Failed to subscribe');
      }
    }

    setPushLoading(false);
  };

  const [testPushLoading, setTestPushLoading] = useState(false);
  const [testPushMessage, setTestPushMessage] = useState('');

  const handleTestPush = async () => {
    setTestPushLoading(true);
    setTestPushMessage('');
    try {
      const res = await fetch('https://europe-west1-stella-indoor.cloudfunctions.net/sendTestPush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json()) as { success?: boolean; message?: string };
      if (res.ok && data.success) {
        setTestPushMessage('Test push sent. Close the app and wait a few seconds.');
      } else {
        setTestPushMessage(`Test push failed: ${data.message || res.statusText}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestPushMessage(`Test push error: ${msg}`);
    } finally {
      setTestPushLoading(false);
    }
  };

  const rowClass = 'flex items-center justify-between py-3 border-b border-[#1e293b] last:border-0';
  const inputClass = 'h-9 w-24 px-3 rounded-lg border border-[#1e293b] bg-[#0b0f1e] text-white text-sm text-center focus:outline-none focus:border-[#6366f1] transition-all tab-nums';

  if (settingsLoading) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[#6366f1]" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      {/* Hours */}
      <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-[#818cf8]" />
          <h3 className="text-sm font-bold text-[#94a3b8]">Operating Hours</h3>
        </div>
        <div className="space-y-1">
          <div className={rowClass}>
            <span className="text-sm text-[#cbd5e1]">Monday — Saturday</span>
            <div className="flex items-center gap-2">
              <input type="time" value={openingTime} onChange={e => setOpeningTime(e.target.value)} className={inputClass} />
              <span className="text-[#475569]">to</span>
              <input type="time" value={closingTime} onChange={e => setClosingTime(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className={rowClass}>
            <span className="text-sm text-[#cbd5e1]">Sunday</span>
            <div className="flex items-center gap-2">
              <input type="time" value={openingTime} disabled className={`${inputClass} opacity-50`} />
              <span className="text-[#475569]">to</span>
              <input type="time" value={sunClosing} onChange={e => setSunClosing(e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Banknote className="w-4 h-4 text-[#818cf8]" />
          <h3 className="text-sm font-bold text-[#94a3b8]">Court Pricing (per hour)</h3>
        </div>
        <div className="space-y-1">
          <div className={rowClass}>
            <span className="text-sm text-[#cbd5e1]">Big Court</span>
            <div className="flex items-center gap-1">
              <span className="text-sm text-[#64748b]">R</span>
              <input type="number" value={bigPrice} onChange={e => setBigPrice(e.target.value)} className={inputClass} min="0" />
            </div>
          </div>
          <div className={rowClass}>
            <span className="text-sm text-[#cbd5e1]">Multipurpose Courts</span>
            <div className="flex items-center gap-1">
              <span className="text-sm text-[#64748b]">R</span>
              <input type="number" value={multiPrice} onChange={e => setMultiPrice(e.target.value)} className={inputClass} min="0" />
            </div>
          </div>
        </div>
      </div>

      {/* Payment */}
      <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-[#818cf8]" />
          <h3 className="text-sm font-bold text-[#94a3b8]">Payment Settings</h3>
        </div>
        <div className={rowClass}>
          <div>
            <span className="text-sm text-[#cbd5e1]">Payment Window</span>
            <p className="text-[11px] text-[#475569] mt-0.5">Minutes before pending booking expires</p>
          </div>
          <div className="flex items-center gap-1">
            <input type="number" value={payWindow} onChange={e => setPayWindow(e.target.value)} className={inputClass} min="1" max="60" />
            <span className="text-xs text-[#64748b]">min</span>
          </div>
        </div>
      </div>

      {/* Push Notifications */}
      <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-[#818cf8]" />
          <h3 className="text-sm font-bold text-[#94a3b8]">Push Notifications</h3>
        </div>

        {!pushSupported ? (
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <BellOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-amber-300">Push notifications are not supported in this browser.</p>
              <p className="text-[10px] text-amber-400/70 mt-0.5">Use Chrome, Firefox, or Edge on Android, or Safari 16.4+ on iOS (with PWA installed).</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className={rowClass}>
              <div>
                <span className="text-sm text-[#cbd5e1]">
                  {pushSubscribed ? 'Push notifications enabled' : 'Enable push notifications'}
                </span>
                <p className="text-[11px] text-[#475569] mt-0.5">
                  {pushSubscribed
                    ? 'You will receive alerts for new bookings and cancellations'
                    : 'Get notified when customers book or cancel'
                  }
                </p>
              </div>
              <button
                onClick={handlePushToggle}
                disabled={pushLoading}
                className={`relative h-9 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50
                  ${pushSubscribed
                    ? 'bg-[#6366f1] text-white hover:bg-[#4f46e5]'
                    : 'bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white hover:from-[#5558e0] hover:to-[#7c4ee5]'
                  }`}
              >
                {pushLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : pushSubscribed ? (
                  <><BellOff className="w-3.5 h-3.5" /> Disable</>
                ) : (
                  <><Bell className="w-3.5 h-3.5" /> Enable</>
                )}
              </button>
            </div>

            {pushError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{pushError}</p>
              </div>
            )}

            {pushSubscribed && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-[#6366f1]/10 border border-[#6366f1]/20">
                <Check className="w-3.5 h-3.5 text-[#818cf8] shrink-0" />
                <p className="text-xs text-[#818cf8]">Subscribed. You will receive notifications even when this app is closed.</p>
              </div>
            )}

            {pushSubscribed && <BatteryOptimizationButton onClick={() => setShowBatteryGuide(true)} />}

            {pushSubscribed && (
              <button
                onClick={handleTestPush}
                disabled={testPushLoading}
                className="w-full h-10 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {testPushLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                Send Test Push Notification
              </button>
            )}

            {testPushMessage && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-[#6366f1]/10 border border-[#6366f1]/20">
                <Bell className="w-3.5 h-3.5 text-[#818cf8] shrink-0 mt-0.5" />
                <p className="text-xs text-[#94a3b8]">{testPushMessage}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Push Diagnostics */}
      <PushDiagnostics />

      {/* Notification Setup Guide */}
      <NotificationSetupGuide />

      {/* Notifications (in-app) */}
      <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-[#818cf8]" />
          <h3 className="text-sm font-bold text-[#94a3b8]">In-App Notifications</h3>
        </div>
        <div className={rowClass}>
          <span className="text-sm text-[#cbd5e1]">Enable booking notifications</span>
          <button onClick={() => setNotifEnabled(!notifEnabled)}
            className={`w-11 h-6 rounded-full transition-colors relative ${notifEnabled ? 'bg-[#6366f1]' : 'bg-[#1e293b]'}`}>
            <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${notifEnabled ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
      </div>

      {/* App Installation */}
      <div className="bg-[#13182b] rounded-2xl border border-[#1e293b] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Smartphone className="w-4 h-4 text-[#818cf8]" />
          <h3 className="text-sm font-bold text-[#94a3b8]">App Installation</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[#cbd5e1]">Install Stella Admin on this device</p>
            <p className="text-[11px] text-[#475569] mt-0.5">Add to home screen for quick access like a native app</p>
          </div>
          <button
            onClick={openInstall}
            disabled={installed}
            className={`h-9 px-4 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-lg shadow-[#6366f1]/20 ${
              installed
                ? 'bg-[#1e293b] text-[#94a3b8] cursor-default'
                : 'bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:from-[#5558e0] hover:to-[#7c4ee5]'
            }`}
          >
            {installed ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
            {installed ? 'Installed ✓' : 'Install App'}
          </button>
        </div>
      </div>

      {/* Install Modal */}
      <InstallModal open={showModal} onClose={() => setShowModal(false)} variant="admin" />

      {/* Battery Optimization Guide */}
      <BatteryOptimizationGuide open={showBatteryGuide} onClose={() => setShowBatteryGuide(false)} />

      {/* Danger */}
      <div className="bg-[#13182b] rounded-2xl border border-red-500/20 p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-bold text-red-400">Danger Zone</h3>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[#cbd5e1]">Clear all booking data</p>
            <p className="text-[11px] text-[#475569]">This will permanently delete all bookings</p>
          </div>
          <button onClick={handleClear}
            className={`h-9 px-4 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${clearConfirm ? 'bg-red-500 text-white' : 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'}`}>
            <Trash2 className="w-3.5 h-3.5" />
            {clearConfirm ? 'Confirm Delete' : 'Clear All'}
          </button>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className={`h-11 px-6 rounded-xl font-bold text-sm flex items-center gap-2 transition-all disabled:opacity-50 ${saved ? 'bg-[#6366f1]/20 text-[#818cf8] border border-[#6366f1]/30' : 'bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:from-[#5558e0] hover:to-[#7c4ee5] text-white shadow-lg shadow-[#6366f1]/20'}`}>
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
          ) : saved ? (
            <><Check className="w-4 h-4" /> Saved</>
          ) : (
            <><Save className="w-4 h-4" /> Save Settings</>
          )}
        </button>
      </div>
    </div>
  );
}
