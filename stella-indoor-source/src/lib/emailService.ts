/**
 * Email Service — Stella Indoor Sports Hub
 *
 * Sends transactional emails via a configurable HTTP endpoint.
 * Previously this used a Netlify Function; Netlify has been removed from the project.
 * To re-enable emails, set VITE_EMAIL_FUNCTION_URL to your own email function endpoint
 * (e.g., a Firebase Cloud Function) at build time.
 *
 * Example endpoint: https://us-central1-stella-indoor.cloudfunctions.net/sendEmail
 */

import {
  collection, doc, setDoc, deleteDoc, getDocs, getDoc, query, where, updateDoc, Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const EMAIL_FUNCTION_URL = import.meta.env.VITE_EMAIL_FUNCTION_URL;
const SCHEDULED_EMAILS_COLLECTION = 'scheduledEmails';

type ReminderType = 'reminder-1h' | 'reminder-30m' | 'reminder-at-time';

// ============================================================================
// Low-level sender via Netlify Function
// ============================================================================

async function postEmail(data: {
  toEmail: string;
  toName?: string;
  subject: string;
  message: string;
  bookingRef?: string;
  courtName?: string;
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  duration?: string;
  totalPrice?: string;
  clientName?: string;
  clientPhone?: string;
  teamName?: string;
  soccerBall?: string;
  bibs?: string;
  addonsList?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!EMAIL_FUNCTION_URL) {
    console.warn('[EmailService] VITE_EMAIL_FUNCTION_URL is not set. Email not sent.');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    console.log(`[EmailService] POSTing to ${EMAIL_FUNCTION_URL} for ${data.toEmail}`);

    const response = await fetch(EMAIL_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`[EmailService] HTTP ${response.status}:`, result.error);
      return { success: false, error: result.error || `HTTP ${response.status}` };
    }

    console.log(`[EmailService] Email sent to ${data.toEmail}, messageId: ${result.messageId}`);
    return { success: true };
  } catch (err: any) {
    console.error('[EmailService] Fetch error:', err);
    return { success: false, error: err?.message || 'Network error - function may not be deployed' };
  }
}

// ============================================================================
// 1. INSTANT confirmation email
// ============================================================================

export async function sendBookingConfirmationEmail(data: {
  toEmail: string; clientName: string; bookingRef: string; courtName: string;
  date: string; startTime: string; endTime: string; duration: number; totalPrice: number;
  clientPhone?: string; soccerBall?: number; bibs?: number; teamName?: string;
}): Promise<{ success: boolean; error?: string }> {
  console.log(`[EmailService] ====== CONFIRMATION EMAIL for ${data.bookingRef} ======`);

  const addons: string[] = [];
  if ((data.soccerBall ?? 0) > 0) addons.push(`Soccer Balls x${data.soccerBall}`);
  if ((data.bibs ?? 0) > 0) addons.push(`Bibs x${data.bibs}`);

  const fmtDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-ZA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  };

  const message = `Thank you for your booking at Stella Indoor Sports Hub. Your ${data.courtName} court has been reserved for ${fmtDate(data.date)} at ${data.startTime}. Please present this email as proof of your booking upon arrival.`;

  const result = await postEmail({
    toEmail: data.toEmail,
    toName: data.clientName,
    subject: `Booking Confirmed - ${data.bookingRef}`,
    message,
    bookingRef: data.bookingRef,
    courtName: data.courtName,
    bookingDate: fmtDate(data.date),
    startTime: data.startTime,
    endTime: data.endTime,
    duration: `${data.duration} hour${data.duration > 1 ? 's' : ''}`,
    totalPrice: `R${data.totalPrice.toFixed(2)}`,
    clientName: data.clientName,
    clientPhone: data.clientPhone,
    teamName: data.teamName,
    soccerBall: (data.soccerBall ?? 0) > 0 ? `Yes (${data.soccerBall})` : 'No',
    bibs: (data.bibs ?? 0) > 0 ? `Yes (${data.bibs})` : 'No',
    addonsList: addons.length > 0 ? addons.join(', ') : 'None',
  });

  console.log(`[EmailService] Result:`, result);
  return result;
}

// ============================================================================
// 2. Cancellation email
// ============================================================================

export async function sendCancellationEmail(data: {
  toEmail: string; clientName: string; bookingRef: string; courtName: string;
  date: string; startTime: string; endTime: string; duration: number; totalPrice: number;
  reason?: string;
}): Promise<{ success: boolean; error?: string }> {
  console.log(`[EmailService] ====== CANCELLATION EMAIL for ${data.bookingRef} ======`);

  const fmtDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-ZA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  };

  const message = `Your booking at Stella Indoor Sports Hub has been cancelled.${data.reason ? ` Reason: ${data.reason}` : ''}`;

  const result = await postEmail({
    toEmail: data.toEmail,
    toName: data.clientName,
    subject: `Booking Cancelled - ${data.bookingRef}`,
    message,
    bookingRef: data.bookingRef,
    courtName: data.courtName,
    bookingDate: fmtDate(data.date),
    startTime: data.startTime,
    endTime: data.endTime,
    duration: `${data.duration} hour${data.duration > 1 ? 's' : ''}`,
    totalPrice: `R${data.totalPrice.toFixed(2)}`,
    clientName: data.clientName,
  });

  console.log(`[EmailService] Result:`, result);
  return result;
}

// ============================================================================
// 2b. Password reset code email
// ============================================================================

export async function sendPasswordResetEmail(data: {
  toEmail: string;
  resetCode: string;
}): Promise<{ success: boolean; error?: string }> {
  console.log(`[EmailService] ====== PASSWORD RESET CODE for ${data.toEmail} ======`);

  const result = await postEmail({
    toEmail: data.toEmail,
    toName: 'Stella Indoor Client',
    subject: 'Password Reset Code - Stella Indoor Sports Hub',
    message: `You requested a password reset for your Stella Indoor Sports Hub account. Your reset code is: ${data.resetCode}. This code expires in 60 minutes. If you didn't request this, please ignore this email.`,
    clientName: 'Valued Client',
  });

  console.log(`[EmailService] Result:`, result);
  return result;
}

// ============================================================================
// 3. Schedule 3 reminder emails in Firestore (for background poller)
// ============================================================================

export async function scheduleReminderEmails(data: {
  userEmail: string; clientName: string; bookingId: string; courtName: string;
  date: string; startTime: string; endTime: string; duration: number; totalPrice: number;
  clientPhone?: string; soccerBall?: number; bibs?: number; teamName?: string;
}): Promise<void> {
  const [h, m] = data.startTime.split(':').map(Number);
  const bookingDateTime = new Date(`${data.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
  const bookingTimestamp = bookingDateTime.getTime();
  const now = Date.now();

  const schedules: { type: ReminderType; sendAt: number }[] = [
    { type: 'reminder-1h', sendAt: bookingTimestamp - 60 * 60 * 1000 },
    { type: 'reminder-30m', sendAt: bookingTimestamp - 30 * 60 * 1000 },
    { type: 'reminder-at-time', sendAt: bookingTimestamp },
  ];

  for (const s of schedules) {
    if (s.sendAt <= now) {
      console.log(`[EmailService] Skipping ${s.type} — already past`);
      continue;
    }

    const id = `email-${data.bookingId}-${s.type}`;
    await setDoc(doc(db, SCHEDULED_EMAILS_COLLECTION, id), {
      id,
      bookingId: data.bookingId,
      userEmail: data.userEmail.toLowerCase().trim(),
      type: s.type,
      sendAt: Timestamp.fromMillis(s.sendAt),
      sent: false,
      courtName: data.courtName,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      duration: data.duration,
      totalPrice: data.totalPrice,
      clientName: data.clientName,
      clientPhone: data.clientPhone ?? null,
      teamName: data.teamName ?? null,
      soccerBall: data.soccerBall ?? 0,
      bibs: data.bibs ?? 0,
      createdAt: Timestamp.fromMillis(now),
    });

    console.log(`[EmailService] Scheduled ${s.type} email at ${new Date(s.sendAt).toLocaleString('en-ZA')}`);
  }
}

// ============================================================================
// 4. Background poller — processes due scheduled emails
// ============================================================================

export async function processScheduledEmails(): Promise<number> {
  try {
    const now = Date.now();
    const q = query(collection(db, SCHEDULED_EMAILS_COLLECTION), where('sent', '==', false));
    const snapshot = await getDocs(q);

    const due = snapshot.docs
      .map(s => {
        const d = s.data();
        return {
          id: s.id,
          userEmail: d.userEmail as string,
          type: d.type as ReminderType,
          sendAt: d.sendAt instanceof Timestamp ? d.sendAt.toMillis() : (d.sendAt as number),
          courtName: d.courtName as string,
          date: d.date as string,
          startTime: d.startTime as string,
          endTime: d.endTime as string,
          duration: d.duration as number,
          totalPrice: d.totalPrice as number,
          clientName: d.clientName as string,
          clientPhone: (d.clientPhone as string) || undefined,
          teamName: (d.teamName as string) || undefined,
          soccerBall: (d.soccerBall as number) || 0,
          bibs: (d.bibs as number) || 0,
          bookingId: d.bookingId as string,
          cancelled: d.cancelled === true,
        };
      })
      // Skip cancelled emails and emails whose send time hasn't arrived yet
      .filter(e => !e.cancelled && e.sendAt <= now);

    if (due.length === 0) return 0;

    const fmtDate = (dateStr: string) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-ZA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
    };

    let sent = 0;
    for (const e of due) {
      // CRITICAL: Verify booking is still confirmed before sending
      try {
        const bookingRef = doc(db, 'bookings', e.bookingId);
        const bookingSnap = await getDoc(bookingRef);
        if (!bookingSnap.exists() || bookingSnap.data().status === 'cancelled') {
          console.log(`[EmailService] Skipping ${e.type} for ${e.bookingId} — booking cancelled or deleted`);
          await updateDoc(doc(db, SCHEDULED_EMAILS_COLLECTION, e.id), { cancelled: true });
          continue;
        }
      } catch (err: any) {
        console.warn(`[EmailService] Booking check failed for ${e.bookingId}: ${err.message}`);
        // If we can't verify, mark as cancelled to be safe (prevents spam)
        await updateDoc(doc(db, SCHEDULED_EMAILS_COLLECTION, e.id), { cancelled: true });
        continue;
      }

      let subject: string;
      let message: string;

      switch (e.type) {
        case 'reminder-1h':
          subject = `Reminder: Your booking is in 1 hour - ${e.bookingId}`;
          message = `This is a friendly reminder that your booking for ${e.courtName} is in 1 hour. Date: ${fmtDate(e.date)} at ${e.startTime}. Venue: Stella Indoor Sports Hub, Durban.`;
          break;
        case 'reminder-30m':
          subject = `Reminder: Your booking is in 30 minutes - ${e.bookingId}`;
          message = `Your booking for ${e.courtName} is in 30 minutes! Date: ${fmtDate(e.date)} at ${e.startTime}. Please arrive at Stella Indoor Sports Hub, Durban, in good time.`;
          break;
        case 'reminder-at-time':
          subject = `Your booking is now - ${e.bookingId}`;
          message = `It's time! Your booking for ${e.courtName} is now. Date: ${fmtDate(e.date)} at ${e.startTime}. Enjoy your session at Stella Indoor Sports Hub, Durban!`;
          break;
      }

      const r = await postEmail({
        toEmail: e.userEmail,
        toName: e.clientName,
        subject,
        message,
        bookingRef: e.bookingId,
        courtName: e.courtName,
        bookingDate: fmtDate(e.date),
        startTime: e.startTime,
        endTime: e.endTime,
        duration: `${e.duration} hour${e.duration > 1 ? 's' : ''}`,
        totalPrice: `R${e.totalPrice.toFixed(2)}`,
        clientName: e.clientName,
      });

      if (r.success) {
        await updateDoc(doc(db, SCHEDULED_EMAILS_COLLECTION, e.id), { sent: true });
        sent++;
      } else {
        console.warn(`[EmailService] Will retry ${e.type} for ${e.bookingId} later: ${r.error}`);
      }
    }

    return sent;
  } catch (err) {
    console.error('[EmailService] processScheduledEmails error:', err);
    return 0;
  }
}

// ============================================================================
// 5. Cancel scheduled reminders
// ============================================================================

export async function cancelScheduledEmailsForBooking(bookingId: string): Promise<number> {
  console.log(`[EmailService] Cancelling scheduled emails for booking ${bookingId}`);
  let deletedCount = 0;

  // Approach 1: Query by bookingId field
  try {
    const q = query(
      collection(db, SCHEDULED_EMAILS_COLLECTION),
      where('bookingId', '==', bookingId)
    );
    const snapshot = await getDocs(q);
    console.log(`[EmailService] Found ${snapshot.docs.length} scheduled emails for ${bookingId}`);

    for (const snap of snapshot.docs) {
      try {
        await updateDoc(snap.ref, { cancelled: true });
        await deleteDoc(snap.ref);
        deletedCount++;
        console.log(`[EmailService] Deleted scheduled email: ${snap.id}`);
      } catch (err: any) {
        console.warn(`[EmailService] Could not delete ${snap.id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    console.error(`[EmailService] Query approach failed: ${err.message}`);
  }

  // Approach 2: Direct document deletion (fallback — known document IDs)
  if (deletedCount === 0) {
    const types: ReminderType[] = ['reminder-1h', 'reminder-30m', 'reminder-at-time'];
    for (const type of types) {
      const id = `email-${bookingId}-${type}`;
      try {
        await updateDoc(doc(db, SCHEDULED_EMAILS_COLLECTION, id), { cancelled: true });
        await deleteDoc(doc(db, SCHEDULED_EMAILS_COLLECTION, id));
        deletedCount++;
        console.log(`[EmailService] Direct-delete fallback: removed ${id}`);
      } catch {
        // Document may not exist — that's fine
      }
    }
  }

  console.log(`[EmailService] Cancelled ${deletedCount} scheduled emails for ${bookingId}`);
  return deletedCount;
}
