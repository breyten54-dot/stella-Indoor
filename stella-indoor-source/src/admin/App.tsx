import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import { useAdminAuth } from './hooks/useAdminAuth';
import { useAdminBookings } from './hooks/useAdminBookings';
import { useAdminClients } from './hooks/useAdminClients';
import { useBlockedSlots } from './hooks/useBlockedSlots';
import { subscribeToPush, getNotificationPermission, isPushSupported } from './lib/pushNotifications';
import { cancelBooking } from '@/hooks/useFirestoreBookings';
import { getErrorMessage } from '@/lib/error';
import { adjustAttendanceCounters } from '@/hooks/useFirestoreUsers';
import { db } from '@/lib/firebase';
import type { BookingRecord, BookingAttendance } from '@/types/booking';
import { AdminLogin } from './components/AdminLogin';
import { AdminLayout } from './components/AdminLayout';
import { ClipRecorder } from './components/ClipRecorder';
import { Dashboard } from './pages/Dashboard';
import { Calendar } from './pages/Calendar';
import { Clients } from './pages/Clients';
import { BlockedSlots } from './pages/BlockedSlots';
import { Settings } from './pages/Settings';
import { Toast } from './components/Toast';
import { ServiceWorkerUpdater } from '@/components/ServiceWorkerUpdater';
import { PushNotificationBanner } from './components/PushNotificationBanner';

export default function App() {
  // Reminder emails are now sent server-side by the sendDueReminderEmails
  // scheduled Cloud Function (every 5 min) — the old in-app poller was
  // removed to prevent double-sends.

  // Auto-detect and prompt for service worker updates
  const updater = <ServiceWorkerUpdater swPath="/sw-admin.js" variant="admin" />;

  const { isAdmin, user, login, logout, loading: authLoading } = useAdminAuth();

  // Silently refresh the admin push subscription on every authenticated open when
  // permission is ALREADY granted — mirrors the client's per-open re-subscribe
  // (BookingApp.tsx) so a stale/rotated endpoint self-heals (K-16). Never prompts
  // on open: first-time opt-in stays with the banner/Settings button, and the
  // permission guard means requestPermission is never reached when it could prompt.
  useEffect(() => {
    if (!isAdmin) return;
    if (!isPushSupported() || getNotificationPermission() !== 'granted') return;
    subscribeToPush().catch((err) => console.warn('[admin] push refresh failed:', err));
  }, [isAdmin]);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };
  const {
    bookings, stats, loading, error: bookingsError, dailyStats, courtStats,
    notifications, unreadCount, markAllRead, markRead, clearNotifications,
  } = useAdminBookings(isAdmin);
  const { clients, loading: clientsLoading, error: clientsError } = useAdminClients(isAdmin);
  const {
    slots: blockedSlots,
    loading: blocksLoading,
    createBlockedSlot,
    deleteBlockedSlot,
    updateBlockedSlot,
  } = useBlockedSlots(isAdmin);

  const handleCancelBooking = async (booking: import('@/types/booking').BookingRecord) => {
    try {
      // Server-side Cloud Function handles the client email, in-app notification,
      // reminder cleanup, and admin push (for client cancellations).
      await cancelBooking(booking.id, 'admin');
      showToast('Booking cancelled — client will be notified', 'success');
    } catch (err: unknown) {
      showToast(`Cancel failed: ${getErrorMessage(err)}`, 'error');
    }
  };

  // Change a booking's attendance status and keep user counters/ban state in sync
  const handleAttendanceChange = async (booking: BookingRecord, newAttendance: BookingAttendance) => {
    const previous = booking.attendance || 'pending';
    if (previous === newAttendance) return;

    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'bookings', booking.id), { attendance: newAttendance });
      const result = await adjustAttendanceCounters(
        booking.userEmail,
        previous,
        newAttendance,
        {
          name: booking.clientDetails.fullName,
          phone: booking.clientDetails.phone || '',
        }
      );

      if (newAttendance === 'missed' && result.banned) {
        showToast(`Client banned after ${result.missedCount} missed bookings`, 'error');
      } else if (newAttendance === 'missed') {
        showToast(`Marked as missed (${result.missedCount}/3)`, 'error');
      } else if (newAttendance === 'played') {
        showToast('Marked as played', 'success');
      } else {
        showToast('Attendance reset to pending', 'success');
      }
    } catch (err: unknown) {
      showToast(`Failed to update attendance: ${getErrorMessage(err)}`, 'error');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0b0f1e] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#6366f1]/30 border-t-[#6366f1] rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return <AdminLogin onLogin={login} />;
  }

  return (<>
    <PushNotificationBanner />
    <AdminLayout
      user={user}
      onLogout={logout}
      loading={loading || clientsLoading || blocksLoading}
      notifications={notifications}
      unreadCount={unreadCount}
      onMarkAllRead={markAllRead}
      onMarkRead={markRead}
      onClearNotifications={clearNotifications}
    >
      <Routes>
        <Route path="/" element={<Dashboard bookings={bookings} stats={stats} dailyStats={dailyStats} courtStats={courtStats} error={bookingsError} onAttendanceChange={handleAttendanceChange} />} />
        <Route path="/calendar" element={<Calendar bookings={bookings} blockedSlots={blockedSlots} onCancelBooking={handleCancelBooking} onAttendanceChange={handleAttendanceChange} />} />
        <Route path="/clients" element={<Clients clients={clients} bookings={bookings} loading={clientsLoading} error={clientsError} />} />
        <Route path="/blocked-slots" element={
          <BlockedSlots
            slots={blockedSlots}
            loading={blocksLoading}
            onCreate={createBlockedSlot}
            onDelete={deleteBlockedSlot}
            onUpdate={updateBlockedSlot}
          />
        } />
        <Route path="/clip-recorder" element={<ClipRecorder />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AdminLayout>

    {/* Toast notification */}
    {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

    {/* Service worker update prompt */}
    {updater}
  </>);
}