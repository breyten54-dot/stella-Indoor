/**
 * Email Service — Stella Indoor Sports Hub
 *
 * Sends transactional emails via a configurable HTTP endpoint.
 * Previously this used a Netlify Function; Netlify has been removed from the project.
 * To re-enable emails, set VITE_EMAIL_FUNCTION_URL to your own email function endpoint
 * (e.g., a Firebase Cloud Function) at build time.
 *
 * Example endpoint: https://europe-west1-stella-indoor.cloudfunctions.net/sendEmail
 */

const EMAIL_FUNCTION_URL = import.meta.env.VITE_EMAIL_FUNCTION_URL;

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

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
  } catch (err: unknown) {
    console.error('[EmailService] Fetch error:', err);
    return { success: false, error: getErrorMessage(err) || 'Network error - function may not be deployed' };
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
// 2. Password reset code email
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

// Scheduled reminder emails are now sent server-side by the sendDueReminderEmails
// Cloud Function (functions/src/index.ts). Cleanup on cancellation is handled by
// onBookingCancelled (cleanupBookingSideEffects).
