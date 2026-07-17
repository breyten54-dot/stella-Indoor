import { useState, useEffect } from 'react';
import {
  Bell,
  Lock,
  X,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '@/lib/auth';
import { subscribeToPush, isPushSubscribed, isPushSupported } from '@/lib/clientPush';

interface ClientSettingsProps {
  userEmail: string;
  onClose: () => void;
}

type PermissionState = NotificationPermission | 'unsupported';

function getPermissionState(): PermissionState {
  if (!isPushSupported() || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function ClientSettings({ userEmail, onClose }: ClientSettingsProps) {
  const [permission, setPermission] = useState<PermissionState>('default');
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushResult, setPushResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

  const refreshPushStatus = async () => {
    setPermission(getPermissionState());
    setSubscribed(await isPushSubscribed());
  };

  useEffect(() => {
    refreshPushStatus();
  }, []);

  const handleEnableNotifications = async () => {
    setPushLoading(true);
    setPushResult(null);
    const result = await subscribeToPush(userEmail);
    setPushLoading(false);
    await refreshPushStatus();
    if (result.success) {
      setPushResult({ ok: true, text: 'Notifications enabled' });
    } else {
      setPushResult({ ok: false, text: result.error || 'Could not enable notifications' });
    }
  };

  const handleSendTestNotification = async () => {
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!registration) return;
    await registration.showNotification('Test notification', {
      body: 'Your Stella Indoor notification channel is working.',
      icon: '/logo-original.jpg',
      badge: '/badge-client-v2.png',
      tag: 'stella-test-notification',
    });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwError('All fields are required');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setPwError('Password must be at least 6 characters');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setPwError('You must be signed in to change your password');
      return;
    }

    setPwLoading(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(userEmail, currentPassword));
      await updatePassword(user, newPassword);
      setPwSuccess('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('auth/wrong-password') || message.includes('auth/invalid-credential')) {
        setPwError('Current password is incorrect');
      } else if (message.includes('auth/requires-recent-login')) {
        setPwError('Please sign in again before changing your password');
      } else if (message.includes('auth/weak-password')) {
        setPwError('New password is too weak');
      } else {
        setPwError(message || 'Could not update password');
      }
    } finally {
      setPwLoading(false);
    }
  };

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: boolean }).MSStream;
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  const canEnable =
    permission !== 'unsupported' &&
    permission !== 'denied' &&
    subscribed !== true;

  return (
    <div className="min-h-screen bg-[#0A0A0A] pt-14">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-black text-white tracking-tight">Settings</h1>
          <button
            onClick={onClose}
            className="h-10 px-4 rounded-xl bg-[#1B7A40] text-white text-sm font-bold hover:bg-[#145C32] transition-colors flex items-center gap-1.5"
          >
            <X className="w-4 h-4" /> Close
          </button>
        </div>

        <div className="space-y-6">
          {/* Notifications */}
          <section className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/10 flex items-center justify-center">
                <Bell className="w-5 h-5 text-[#7ED321]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Notifications</h2>
                <p className="text-xs text-[#8A8A8A]">Push alerts for slot releases and reminders</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#B0B0B0]">Browser permission</span>
                <span className="font-bold text-white capitalize">
                  {permission === 'unsupported' ? 'Not supported' : permission}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#B0B0B0]">Push subscription</span>
                <span className={`font-bold ${subscribed ? 'text-[#7ED321]' : 'text-[#8A8A8A]'}`}>
                  {subscribed ? 'Active' : 'Inactive'}
                </span>
              </div>

              {permission === 'denied' && (
                <div className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-400">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>
                    Notifications are blocked. Re-enable them in your browser/site settings, then
                    return here and tap Enable again.
                  </p>
                </div>
              )}

              {isIOS && !isStandalone && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-400">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>
                    On iOS, add Stella Indoor to your home screen first. iOS only allows web push
                    notifications from installed PWAs.
                  </p>
                </div>
              )}

              <button
                onClick={handleEnableNotifications}
                disabled={!canEnable || pushLoading}
                className="w-full h-12 rounded-xl bg-[#1B7A40] hover:bg-[#145C32] disabled:bg-[#2A2A2A] disabled:text-[#8A8A8A] text-white font-bold transition-colors flex items-center justify-center gap-2"
              >
                {pushLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : subscribed ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
                {subscribed ? 'Notifications enabled' : 'Enable notifications'}
              </button>

              {subscribed && (
                <button
                  onClick={handleSendTestNotification}
                  className="w-full h-11 rounded-xl bg-[#2A2A2A] hover:bg-[#3A3A3A] text-white text-sm font-bold transition-colors"
                >
                  Send test notification
                </button>
              )}

              {pushResult && (
                <div
                  className={`rounded-xl p-3 text-xs flex items-start gap-2 ${
                    pushResult.ok ? 'bg-[#1B7A40]/10 text-[#7ED321]' : 'bg-red-500/10 text-red-400'
                  }`}
                >
                  {pushResult.ok ? <Check className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                  <p>{pushResult.text}</p>
                </div>
              )}
            </div>
          </section>

          {/* Change password */}
          <section className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#1B7A40]/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-[#7ED321]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Change password</h2>
                <p className="text-xs text-[#8A8A8A]">Update your Stella Indoor account password</p>
              </div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3">
              <PasswordField
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder="Current password"
                show={showCurrent}
                onToggle={() => setShowCurrent((s) => !s)}
              />
              <PasswordField
                value={newPassword}
                onChange={setNewPassword}
                placeholder="New password"
                show={showNew}
                onToggle={() => setShowNew((s) => !s)}
              />
              <PasswordField
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Confirm new password"
                show={showConfirm}
                onToggle={() => setShowConfirm((s) => !s)}
              />

              {pwError && (
                <div className="rounded-xl bg-red-500/10 p-3 text-xs text-red-400">{pwError}</div>
              )}
              {pwSuccess && (
                <div className="rounded-xl bg-[#1B7A40]/10 p-3 text-xs text-[#7ED321]">{pwSuccess}</div>
              )}

              <button
                type="submit"
                disabled={pwLoading}
                className="w-full h-12 rounded-xl bg-[#1B7A40] hover:bg-[#145C32] disabled:bg-[#2A2A2A] text-white font-bold transition-colors"
              >
                {pwLoading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  placeholder,
  show,
  onToggle,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-12 rounded-xl bg-[#0A0A0A] border border-[#2A2A2A] text-white px-4 pr-11 placeholder-[#8A8A8A] focus:border-[#1B7A40] focus:ring-1 focus:ring-[#1B7A40]/30 outline-none transition-colors"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8A8A] hover:text-white transition-colors"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
