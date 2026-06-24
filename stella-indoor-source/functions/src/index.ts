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
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@stellasports.co.za';

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
  for (const doc of subsSnapshot.docs) {
    const sub = doc.data();
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload));
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) failed.push(doc.id);
    }
  }
  if (failed.length) {
    const batch = db.batch();
    for (const id of failed) batch.delete(db.collection('adminSubscriptions').doc(id));
    await batch.commit();
  }
}

export const subscribeAdmin = onRequest({ region: 'us-central1', cors: true }, async (req, res) => {
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

export const unsubscribeAdmin = onRequest({ region: 'us-central1', cors: true }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
  const { endpoint } = req.body;
  if (!endpoint) { res.status(400).json({ error: 'Endpoint required' }); return; }
  const subId = Buffer.from(endpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
  await db.collection('adminSubscriptions').doc(subId).delete();
  res.status(200).json({ success: true, message: 'Unsubscribed' });
});

export const onBookingCreated = onDocumentCreated({ region: 'us-central1', document: 'bookings/{bookingId}' }, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const booking = snap.data();
  if (booking.status !== 'confirmed') return;
  await sendPushToAllAdmins({
    title: 'New Booking',
    body: `${booking.clientDetails?.fullName || 'A client'} booked ${booking.courtName || 'a court'} for ${booking.date || ''} at ${booking.startTime || ''}`,
    tag: `booking-${snap.id}`, url: '/admin/bookings', icon: '/logo-admin.png',
  });
});

export const onBookingCancelled = onDocumentUpdated({ region: 'us-central1', document: 'bookings/{bookingId}' }, async (event) => {
  const data = event.data;
  const before = data?.before?.data();
  const after = data?.after?.data();
  if (!data || !before || !after) return;
  if (before.status === 'cancelled' || after.status !== 'cancelled') return;
  await sendPushToAllAdmins({
    title: 'Booking Cancelled',
    body: `${after.clientDetails?.fullName || 'A client'} cancelled ${after.courtName || 'a court'} for ${after.date || ''} at ${after.startTime || ''}`,
    tag: `cancel-${data.after.id}`, url: '/admin/bookings', icon: '/logo-admin.png',
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

export const sendEmail = onRequest({ region: 'us-central1', cors: true }, async (req, res) => {
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

  const senderEmail = process.env.FROM_EMAIL || 'admin@stellasports.co.za';
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
