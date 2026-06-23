import { useState, useEffect } from 'react';
import { subscribeToUserBookings, canCancelBooking } from '@/hooks/useFirestoreBookings';
import type { BookingRecord } from '@/types/booking';
import { cancelBooking } from '@/hooks/useFirestoreBookings';
import { deleteRemindersForBooking } from '@/hooks/useNotifications';
import { sendCancellationEmail, cancelScheduledEmailsForBooking } from '@/lib/emailService';
import { CalendarDays, Clock, MapPin, X, Check, AlertTriangle } from 'lucide-react';

interface Props {
  userEmail: string;
  onClose: () => void;
}

export function MyBookings({ userEmail, onClose }: Props) {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [emailToast, setEmailToast] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToUserBookings(userEmail, (data) => {
      const now = new Date();
      // Only show confirmed, upcoming bookings
      const upcoming = data.filter(b => {
        // Must be confirmed (not cancelled)
        if (b.status === 'cancelled') return false;
        // Must be in the future (not past)
        const bookingDateTime = new Date(`${b.date}T${b.endTime}`);
        if (bookingDateTime < now) return false;
        return true;
      }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.startTime.localeCompare(b.startTime));
      setBookings(upcoming);
    });
    return () => unsubscribe();
  }, [userEmail]);

  const handleCancel = async (booking: BookingRecord) => {
    if (!canCancelBooking(booking.date, booking.startTime)) return;
    setCancellingId(booking.id);
    try {
      await cancelBooking(booking.id);
      // Remove any scheduled reminders
      await deleteRemindersForBooking(booking.id);
      // Cancel any pending scheduled reminder emails
      await cancelScheduledEmailsForBooking(booking.id);
      // Send cancellation email to the client
      await sendCancellationEmail({
        toEmail: booking.userEmail,
        clientName: booking.clientDetails?.fullName || 'Valued Client',
        bookingRef: booking.id,
        courtName: booking.courtName,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        duration: booking.duration,
        totalPrice: booking.totalPrice,
        reason: 'Cancelled by client',
      }).catch((err) => console.warn('Cancellation email failed:', err));
      setEmailToast(`Cancellation email sent to ${booking.userEmail}`);
      setTimeout(() => setEmailToast(null), 4000);
    } catch (e) {
      console.error('Cancel failed', e);
    } finally {
      setCancellingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] pt-14">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Cancellation email toast */}
        {emailToast && (
          <div className="mb-4 bg-[#1B7A40] rounded-xl px-4 py-3 flex items-center gap-2 text-white text-sm font-semibold animate-fade-in">
            <Check className="w-4 h-4 shrink-0" />
            {emailToast}
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-black text-[#0A0A0A] tracking-tight">My Bookings</h1>
          <button onClick={onClose}
            className="h-10 px-4 rounded-xl bg-[#1B7A40] text-white text-sm font-bold hover:bg-[#145C32] transition-colors flex items-center gap-1.5">
            <Check className="w-4 h-4" /> Done
          </button>
        </div>

        {bookings.length === 0 ? (
          <div className="text-center py-16">
            <CalendarDays className="w-12 h-12 text-[#E0E0D8] mx-auto mb-4" />
            <p className="text-lg font-bold text-[#8A8A8A]">No bookings yet</p>
            <p className="text-sm text-[#8A8A8A] mt-1">Your bookings will appear here once you make them</p>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((b) => {
              const canCancel = canCancelBooking(b.date, b.startTime);

              return (
                <div key={b.id}
                  className="bg-white rounded-2xl border border-[#E0E0D8] p-5 transition-all hover:shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#E8F5EC] text-[#1B7A40]">
                          CONFIRMED
                        </span>
                        <span className="text-xs text-[#8A8A8A] font-mono">{b.id}</span>
                      </div>

                      <h3 className="text-lg font-bold text-[#0A0A0A]">{b.courtName}</h3>

                      <div className="flex flex-wrap gap-3 text-sm text-[#8A8A8A]">
                        <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {formatDate(b.date)}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {b.startTime} — {b.endTime}</span>
                        <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {b.duration}h</span>
                      </div>

                      <p className="text-xl font-extrabold text-[#1B7A40] tab-nums">R{b.totalPrice}</p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {canCancel ? (
                        <button onClick={() => handleCancel(b)}
                          disabled={cancellingId === b.id}
                          className="h-9 px-4 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 text-sm font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50">
                          {cancellingId === b.id ? (
                            <span className="w-3 h-3 border border-red-300 border-t-red-500 rounded-full animate-spin" />
                          ) : (
                            <><X className="w-3.5 h-3.5" /> Cancel</>
                          )}
                        </button>
                      ) : (
                        <span className="text-xs text-[#8A8A8A] flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          Cancellation closed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
