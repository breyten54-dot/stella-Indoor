import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import { useAdminAuth } from './hooks/useAdminAuth';
import { useAdminBookings } from './hooks/useAdminBookings';
import { useAdminClients } from './hooks/useAdminClients';
import { useBlockedSlots } from './hooks/useBlockedSlots';
import { cancelBooking } from '@/hooks/useFirestoreBookings';
import { createCancellationNotification, deleteRemindersForBooking } from '@/hooks/useNotifications';
import { sendCancellationEmail, cancelScheduledEmailsForBooking } from '@/lib/emailService';
import { getErrorMessage } from '@/lib/error';
import { useScheduledEmails } from '@/hooks/useScheduledEmails';
import { markBookingPlayed, markBookingMissed } from '@/hooks/useFirestoreUsers';
import { db } from '@/lib/firebase';
import type { BookingRecord } from '@/types/booking';
import { AdminLogin } from './components/AdminLogin';
import { AdminLayout } from './components/AdminLayout';
import { ClipRecorder } from './components/ClipRecorder';
import { Dashboard } from './pages/Dashboard';
import { Calendar } from './pages/Calendar';
import { Clients } from './pages/Clients';
import { BlockedSlots } from './pages/BlockedSlots';
import { Settings } from './pages/Settings';
import { Toast } from './components/Toast';

export default function App() {
  // Start the background email poller — ensures emails are sent while admin is logged in
  useScheduledEmails();

  const { isAdmin, user, login, logout, loading: authLoading } = useAdminAuth();

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };
  const {
    bookings, stats, loading, dailyStats, courtStats,
    notifications, unreadCount, markAllRead, markRead, clearNotifications,
  } = useAdminBookings();
  const { clients, loading: clientsLoading } = useAdminClients();
  const {
    slots: blockedSlots,
    loading: blocksLoading,
    createBlockedSlot,
    deleteBlockedSlot,
    updateBlockedSlot,
  } = useBlockedSlots();

  const handleCancelBooking = async (booking: import('@/types/booking').BookingRecord) => {
    await cancelBooking(booking.id);
    // Notify the client their booking was cancelled
    await createCancellationNotification(
      booking.userEmail,
      booking.id,
      booking.courtName,
      booking.date,
      booking.startTime
    );
    // Send cancellation email to the client via configured email function
    try {
      const emailResult = await sendCancellationEmail({
        toEmail: booking.userEmail,
        clientName: booking.clientDetails.fullName,
        bookingRef: booking.id,
        courtName: booking.courtName,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        duration: booking.duration,
        totalPrice: booking.totalPrice,
      });
      if (emailResult.success) {
        showToast(`Cancellation email sent to ${booking.userEmail}`, 'success');
      } else {
        showToast(`Email failed: ${emailResult.error || 'Unknown error'}`, 'error');
      }
    } catch (err: unknown) {
      showToast(`Email error: ${getErrorMessage(err) || 'Failed to send'}`, 'error');
    }

    // Remove any scheduled reminders for this booking
    await deleteRemindersForBooking(booking.id);
    // Cancel all pending scheduled emails (confirmation + reminders)
    await cancelScheduledEmailsForBooking(booking.id);
  };

  // Mark booking as attended (Played)
  const handlePlayed = async (booking: BookingRecord) => {
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'bookings', booking.id), { attendance: 'played' });
    await markBookingPlayed(booking.userEmail);
    showToast('Marked as played', 'success');
  };

  // Mark booking as missed — 3 strikes = permanent ban
  const handleMissed = async (booking: BookingRecord) => {
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'bookings', booking.id), { attendance: 'missed' });
    const result = await markBookingMissed(booking.userEmail);
    if (result.banned) {
      showToast(`Client banned after ${result.missedCount} missed bookings`, 'error');
    } else {
      showToast(`Marked as missed (${result.missedCount}/3)`, 'error');
    }
    return result;
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
        <Route path="/" element={<Dashboard bookings={bookings} stats={stats} dailyStats={dailyStats} courtStats={courtStats} />} />
        <Route path="/calendar" element={<Calendar bookings={bookings} blockedSlots={blockedSlots} onCancelBooking={handleCancelBooking} onPlayed={handlePlayed} onMissed={handleMissed} />} />
        <Route path="/clients" element={<Clients clients={clients} bookings={bookings} loading={clientsLoading} />} />
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
  </>);
}