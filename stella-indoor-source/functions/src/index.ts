import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import * as webpush from 'web-push';

admin.initializeApp();
const db = admin.firestore();

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// VAPID keys should be set as Firebase Functions environment variables.
// Add them to functions/.env (gitignored) or via Google Cloud Console.
const vapidPublic = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivate = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:stellasportshub@gmail.com';

if (!vapidPublic || !vapidPrivate) {
  console.error('[VAPID] VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set in the Functions runtime environment.');
}

try {
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
} catch (err) {
  console.error('VAPID config failed:', getErrorMessage(err));
}

async function sendPushToAllAdmins(payload: Record<string, string>) {
  const subsSnapshot = await db.collection('adminSubscriptions').get();
  if (subsSnapshot.empty) { console.log('No subscriptions'); return; }
  const failed: string[] = [];
  await Promise.allSettled(
    subsSnapshot.docs.map((doc) =>
      webpush
        .sendNotification({ endpoint: doc.data().endpoint, keys: doc.data().keys }, JSON.stringify(payload))
        .catch((err: unknown) => {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) failed.push(doc.id);
        })
    )
  );
  if (failed.length) {
    const batch = db.batch();
    for (const id of failed) batch.delete(db.collection('adminSubscriptions').doc(id));
    await batch.commit();
  }
}

export const subscribeAdmin = onRequest({ region: 'europe-west1', cors: true }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
  const { endpoint, keys, deviceInfo } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) { res.status(400).json({ error: 'Invalid data' }); return; }
  const subId = Buffer.from(endpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
  await db.collection('adminSubscriptions').doc(subId).set({
    endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth },
    adminId: 'admin', deviceInfo: deviceInfo || 'Unknown',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  res.status(200).json({ success: true, message: 'Subscribed' });
});

export const unsubscribeAdmin = onRequest({ region: 'europe-west1', cors: true }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
  const { endpoint } = req.body;
  if (!endpoint) { res.status(400).json({ error: 'Endpoint required' }); return; }
  const subId = Buffer.from(endpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
  await db.collection('adminSubscriptions').doc(subId).delete();
  res.status(200).json({ success: true, message: 'Unsubscribed' });
});

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export const onBookingCreated = onDocumentCreated({ region: 'europe-west1', minInstances: 1, document: 'bookings/{bookingId}' }, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const booking = snap.data();
  if (booking.status !== 'confirmed') return;
  await sendPushToAllAdmins({
    title: 'Court booked',
    body: `Court booked at ${booking.startTime || ''} on ${booking.date || ''}.`,
    tag: `booking-${snap.id}`, url: 'https://stella-indoor-admin.web.app/#/calendar', icon: '/logo-admin.png',
  });
});

export const onBookingCancelled = onDocumentUpdated({ region: 'europe-west1', minInstances: 1, document: 'bookings/{bookingId}' }, async (event) => {
  const data = event.data;
  const before = data?.before?.data();
  const after = data?.after?.data();
  if (!data || !before || !after) return;
  if (before.status === 'cancelled' || after.status !== 'cancelled') return;
  await sendPushToAllAdmins({
    title: 'Court cancelled',
    body: `Court cancelled at ${after.startTime || ''} on ${after.date || ''}.`,
    tag: `cancel-${data.after.id}`, url: 'https://stella-indoor-admin.web.app/#/calendar', icon: '/logo-admin.png',
  });
});

// ============================================================================
// Email function — replaces the previous Netlify Function
// Sends transactional emails via Brevo (Sendinblue).
// Set BREVO_API_KEY as a Functions environment variable.
// ============================================================================

interface EmailPayload {
  toEmail: string;
  toName?: string;
  subject: string;
  message: string;
}

export const sendEmail = onRequest({ region: 'europe-west1', cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const { toEmail, toName, subject, message } = req.body as EmailPayload;
  if (!toEmail || !subject || !message) {
    res.status(400).json({ success: false, error: 'Missing required fields: toEmail, subject, message' });
    return;
  }

  const brevoApiKey = process.env.BREVO_API_KEY;
  if (!brevoApiKey) {
    console.error('[sendEmail] BREVO_API_KEY is not set');
    res.status(500).json({ success: false, error: 'Email service not configured' });
    return;
  }

  const senderEmail = process.env.FROM_EMAIL || 'stellasportshub@gmail.com';
  const senderName = process.env.FROM_NAME || 'Stella Indoor Sports Hub';

  const htmlContent = `<p>${message.replace(/\n/g, '<br>')}</p>`;

  try {
    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: toEmail, name: toName || toEmail }],
        subject,
        htmlContent,
        textContent: message,
      }),
    });

    if (!brevoRes.ok) {
      const errorText = await brevoRes.text();
      console.error('[sendEmail] Brevo error:', errorText);
      res.status(502).json({ success: false, error: `Brevo error: ${errorText}` });
      return;
    }

    const result = await brevoRes.json() as { messageId?: string };
    console.log('[sendEmail] Sent to', toEmail, 'messageId:', result.messageId);
    res.status(200).json({ success: true, messageId: result.messageId });
  } catch (err: unknown) {
    console.error('[sendEmail] Fetch error:', getErrorMessage(err));
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

// ============================================================================
// Court availability helper
// Returns the booked and blocked time intervals for a court/date so the client
// can check slot availability without reading other users' bookings.
// ============================================================================

function timeToDecimal(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h + (m || 0) / 60;
}

async function getBookedAndBlockedIntervals(courtId: string, date: string): Promise<{
  bookings: { startTime: string; endTime: string }[];
  blocked: { startTime: string; endTime: string }[];
}> {
  const bookingsSnap = await db.collection('bookings')
    .where('courtId', '==', courtId)
    .where('date', '==', date)
    .where('status', '==', 'confirmed')
    .get();

  const bookings = bookingsSnap.docs.map((doc) => {
    const data = doc.data();
    return { startTime: data.startTime as string, endTime: data.endTime as string };
  });

  const blockedSnap = await db.collection('blockedSlots')
    .where('courtId', '==', courtId)
    .get();

  const checkDate = new Date(date);
  const checkDay = checkDate.getDay();

  const blocked = blockedSnap.docs.map((doc) => doc.data()).filter((block) => {
    if (block.isRecurring) {
      const blockStart = new Date(block.startDate);
      const weekDiff = Math.floor((checkDate.getTime() - blockStart.getTime()) / (7 * 86400000));
      if (weekDiff < 0) return false;
      if (block.endDate && checkDate > new Date(block.endDate)) return false;
      return (block.dayOfWeek ?? blockStart.getDay()) === checkDay;
    }
    return block.startDate === date;
  }).map((b) => ({ startTime: b.startTime as string, endTime: b.endTime as string }));

  return { bookings, blocked };
}

async function isSlotAvailableServer(
  courtId: string,
  date: string,
  startTime: string,
  duration: number
): Promise<boolean> {
  const startDecimal = timeToDecimal(startTime);
  const endDecimal = startDecimal + duration;
  const { bookings, blocked } = await getBookedAndBlockedIntervals(courtId, date);
  const intervals = [...bookings, ...blocked];
  for (const interval of intervals) {
    const bStart = timeToDecimal(interval.startTime);
    const bEnd = timeToDecimal(interval.endTime);
    if (startDecimal < bEnd && bStart < endDecimal) return false;
  }
  return true;
}

export const getCourtBookedIntervals = onRequest({ region: 'europe-west1', cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const { courtId, date } = req.body as { courtId?: string; date?: string };
  if (!courtId || !date) {
    res.status(400).json({ success: false, error: 'Missing courtId or date' });
    return;
  }

  try {
    const { bookings, blocked } = await getBookedAndBlockedIntervals(courtId, date);
    res.status(200).json({ success: true, bookings, blocked });
  } catch (err: unknown) {
    console.error('[getCourtBookedIntervals] Error:', getErrorMessage(err));
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

// ============================================================================
// Create booking (server-side)
// Replaces the client-side Firestore write to avoid device/network-specific
// hangs and enforces slot availability server-side.
// ============================================================================

export const createBooking = onRequest({ region: 'europe-west1', minInstances: 1, cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const body = req.body as {
    idToken?: string;
    id?: string;
    courtId?: string;
    courtName?: string;
    date?: string;
    startTime?: string;
    duration?: number;
    clientDetails?: Record<string, unknown>;
    addons?: { soccerBall?: number; bibs?: number };
    totalPrice?: number;
    userEmail?: string;
    userId?: string;
  };

  if (!body.idToken || !body.courtId || !body.courtName || !body.date || !body.startTime ||
      typeof body.duration !== 'number' || !body.clientDetails || !body.userEmail) {
    res.status(400).json({ success: false, error: 'Missing required booking fields' });
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(body.idToken);
    if (decoded.email?.toLowerCase() !== body.userEmail.toLowerCase()) {
      res.status(403).json({ success: false, error: 'Email mismatch' });
      return;
    }

    const [h, m] = body.startTime.split(':').map(Number);
    const totalMinutes = h * 60 + m + body.duration * 60;
    const endH = Math.floor(totalMinutes / 60);
    const endM = totalMinutes % 60;
    const endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

    const available = await isSlotAvailableServer(body.courtId, body.date, body.startTime, body.duration);
    if (!available) {
      res.status(409).json({ success: false, error: 'Slot no longer available' });
      return;
    }

    const now = Date.now();
    const id = body.id || `ST-${now.toString(36).toUpperCase()}`;

    await db.collection('bookings').doc(id).set({
      id,
      courtId: body.courtId,
      courtName: body.courtName,
      date: body.date,
      startTime: body.startTime,
      endTime,
      duration: body.duration,
      status: 'confirmed',
      attendance: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      clientDetails: body.clientDetails,
      addons: body.addons || { soccerBall: 0, bibs: 0 },
      totalPrice: body.totalPrice || 0,
      userEmail: body.userEmail.toLowerCase(),
      userId: body.userId || null,
    });

    res.status(200).json({ success: true, bookingId: id });
  } catch (err: unknown) {
    console.error('[createBooking] Error:', getErrorMessage(err));
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

