import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import * as webpush from 'web-push';

admin.initializeApp();
const db = admin.firestore();

// VAPID keys should be set as Firebase Functions environment variables:
// firebase functions:config:set vapid.public="..." vapid.private="..." vapid.subject="mailto:admin@stellasports.co.za"
// For Functions v2 you can also use Google Cloud Secret Manager or set runtime env vars in firebase.json.
const vapidPublic = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivate = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@stellasports.co.za';

if (!vapidPublic || !vapidPrivate) {
  console.error('[VAPID] VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set in the Functions runtime environment.');
}

try {
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
} catch (err) {
  console.error('VAPID config failed:', err);
}

async function sendPushToAllAdmins(payload: any) {
  const subsSnapshot = await db.collection('adminSubscriptions').get();
  if (subsSnapshot.empty) { console.log('No subscriptions'); return; }
  const failed: string[] = [];
  for (const doc of subsSnapshot.docs) {
    const sub = doc.data();
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload));
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) failed.push(doc.id);
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

export const onBookingCreated = onDocumentCreated({ region: 'us-central1', document: 'bookings/{bookingId}' }, async (event: any) => {
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

export const onBookingCancelled = onDocumentUpdated({ region: 'us-central1', document: 'bookings/{bookingId}' }, async (event: any) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  if (before.status === 'cancelled' || after.status !== 'cancelled') return;
  await sendPushToAllAdmins({
    title: 'Booking Cancelled',
    body: `${after.clientDetails?.fullName || 'A client'} cancelled ${after.courtName || 'a court'} for ${after.date || ''} at ${after.startTime || ''}`,
    tag: `cancel-${event.data.after.id}`, url: '/admin/bookings', icon: '/logo-admin.png',
  });
});
