import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as webpush from 'web-push';
import * as crypto from 'crypto';

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

const PUSH_TTL_SECONDS = 28 * 24 * 60 * 60; // 28 days — max practical TTL for FCM/Apple push services
const MAX_PUSH_FAILURES = 5; // Remove a subscription after this many consecutive failures

async function sendPushToAllAdmins(payload: Record<string, string>, options: webpush.RequestOptions = {}) {
  const subsSnapshot = await db.collection('adminSubscriptions').get();
  if (subsSnapshot.empty) { console.log('[push] No subscriptions'); return; }
  console.log(`[push] Sending to ${subsSnapshot.size} subscription(s)`);

  const successIds: string[] = [];
  const failedDocs: { id: string; statusCode?: number; failures: number }[] = [];

  const results = await Promise.allSettled(
    subsSnapshot.docs.map(async (doc) => {
      try {
        await webpush.sendNotification(
          { endpoint: doc.data().endpoint, keys: doc.data().keys },
          JSON.stringify(payload),
          {
            TTL: PUSH_TTL_SECONDS,
            urgency: 'high',
            ...options,
          }
        );
        successIds.push(doc.id);
        return { ok: true, id: doc.id };
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        const message = (err as { message?: string }).message || String(err);
        console.warn(`[push] Failed for ${doc.id}: ${statusCode || 'unknown'} ${message}`);
        const priorFailures = (doc.data().failures || 0) as number;
        failedDocs.push({ id: doc.id, statusCode, failures: priorFailures + 1 });
        return { ok: false, id: doc.id, statusCode };
      }
    })
  );

  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const id of successIds) {
    batch.update(db.collection('adminSubscriptions').doc(id), {
      lastSuccess: now,
      failures: 0,
      updatedAt: now,
    });
  }

  for (const failed of failedDocs) {
    const permanentFailure = failed.statusCode === 410 || failed.statusCode === 404;
    if (permanentFailure || failed.failures >= MAX_PUSH_FAILURES) {
      batch.delete(db.collection('adminSubscriptions').doc(failed.id));
    } else {
      batch.update(db.collection('adminSubscriptions').doc(failed.id), {
        lastFailure: now,
        failures: failed.failures,
        updatedAt: now,
      });
    }
  }

  await batch.commit();

  const okCount = results.filter(r => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok).length;
  const removedCount = failedDocs.filter(f => {
    const permanentFailure = f.statusCode === 410 || f.statusCode === 404;
    return permanentFailure || f.failures >= MAX_PUSH_FAILURES;
  }).length;
  console.log(`[push] ${okCount} succeeded, ${failedDocs.length} failed, ${removedCount} removed`);
}

export const sendTestPush = onRequest({ region: 'europe-west1', cors: true }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
  await sendPushToAllAdmins({
    title: 'Stella Indoor Test',
    body: `Test push at ${new Date().toLocaleTimeString('en-ZA', { timeZone: 'Africa/Johannesburg' })}`,
    // Unique tag per test: a repeated tag makes Android REPLACE the existing
    // notification silently (no sound/pop-up) — which sabotages exactly the
    // heads-up behavior these test pushes exist to verify.
    tag: `test-${Date.now()}`, url: 'https://stella-indoor-admin.web.app', icon: '/logo-admin.png', badge: '/badge-admin.png',
    // Test pushes are allowed to auto-dismiss so we can tell whether
    // `requireInteraction` is what prevents the Samsung heads-up banner.
    requireInteraction: 'false',
  });
  res.status(200).json({ success: true, message: 'Test push sent' });
});

export const subscribeAdmin = onRequest({ region: 'europe-west1', cors: true }, async (req, res) => {
  console.log(`[subscribeAdmin] ${req.method} from ${req.headers.origin || 'unknown origin'}`);
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
  const { endpoint, keys, deviceInfo } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    console.warn(`[subscribeAdmin] REJECTED 400 — endpoint:${!!endpoint} p256dh:${!!keys?.p256dh} auth:${!!keys?.auth} device:${deviceInfo || '?'}`);
    res.status(400).json({ error: 'Invalid data' });
    return;
  }
  console.log(`[subscribeAdmin] storing subscription for device: ${deviceInfo || 'Unknown'}`);
  const subId = Buffer.from(endpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.collection('adminSubscriptions').doc(subId).set({
    endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth },
    adminId: 'admin', deviceInfo: deviceInfo || 'Unknown',
    failures: 0,
    createdAt: now,
    updatedAt: now,
  });
  res.status(200).json({ success: true, message: 'Subscribed' });
});

export const updatePushSubscription = onRequest({ region: 'europe-west1', cors: true }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
  const { oldEndpoint, newEndpoint, keys, deviceInfo } = req.body as {
    oldEndpoint?: string;
    newEndpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    deviceInfo?: string;
  };
  if (!oldEndpoint || !newEndpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ success: false, error: 'Invalid data' });
    return;
  }

  try {
    const oldSubId = Buffer.from(oldEndpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
    const newSubId = Buffer.from(newEndpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
    const now = admin.firestore.FieldValue.serverTimestamp();

    const batch = db.batch();
    batch.delete(db.collection('adminSubscriptions').doc(oldSubId));
    batch.set(db.collection('adminSubscriptions').doc(newSubId), {
      endpoint: newEndpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      adminId: 'admin',
      deviceInfo: deviceInfo || 'Unknown',
      failures: 0,
      createdAt: now,
      updatedAt: now,
    });
    await batch.commit();
    res.status(200).json({ success: true, message: 'Subscription updated' });
  } catch (err: unknown) {
    console.error('[updatePushSubscription] Error:', getErrorMessage(err));
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

export const unsubscribeAdmin = onRequest({ region: 'europe-west1', cors: true }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
  const { endpoint } = req.body;
  if (!endpoint) { res.status(400).json({ error: 'Endpoint required' }); return; }
  const subId = Buffer.from(endpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
  await db.collection('adminSubscriptions').doc(subId).delete();
  res.status(200).json({ success: true, message: 'Unsubscribed' });
});

// ============================================================================
// Client push notifications (mirror of the admin push stack)
// ============================================================================

async function sendPushToAllClients(payload: Record<string, string>, options: webpush.RequestOptions = {}) {
  const subsSnapshot = await db.collection('clientSubscriptions').get();
  if (subsSnapshot.empty) { console.log('[client-push] No subscriptions'); return; }
  console.log(`[client-push] Sending to ${subsSnapshot.size} subscription(s)`);

  const successIds: string[] = [];
  const failedDocs: { id: string; statusCode?: number; failures: number }[] = [];

  const results = await Promise.allSettled(
    subsSnapshot.docs.map(async (doc) => {
      try {
        await webpush.sendNotification(
          { endpoint: doc.data().endpoint, keys: doc.data().keys },
          JSON.stringify(payload),
          { TTL: PUSH_TTL_SECONDS, urgency: 'high', ...options }
        );
        successIds.push(doc.id);
        return { ok: true, id: doc.id };
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        const message = (err as { message?: string }).message || String(err);
        console.warn(`[client-push] Failed for ${doc.id}: ${statusCode || 'unknown'} ${message}`);
        const priorFailures = (doc.data().failures || 0) as number;
        failedDocs.push({ id: doc.id, statusCode, failures: priorFailures + 1 });
        return { ok: false, id: doc.id, statusCode };
      }
    })
  );

  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const id of successIds) {
    batch.update(db.collection('clientSubscriptions').doc(id), { lastSuccess: now, failures: 0, updatedAt: now });
  }
  for (const failed of failedDocs) {
    const permanentFailure = failed.statusCode === 410 || failed.statusCode === 404;
    if (permanentFailure || failed.failures >= MAX_PUSH_FAILURES) {
      batch.delete(db.collection('clientSubscriptions').doc(failed.id));
    } else {
      batch.update(db.collection('clientSubscriptions').doc(failed.id), { lastFailure: now, failures: failed.failures, updatedAt: now });
    }
  }
  await batch.commit();

  const okCount = results.filter(r => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok).length;
  const removedCount = failedDocs.filter(f => {
    const permanentFailure = f.statusCode === 410 || f.statusCode === 404;
    return permanentFailure || f.failures >= MAX_PUSH_FAILURES;
  }).length;
  console.log(`[client-push] ${okCount} succeeded, ${failedDocs.length} failed, ${removedCount} removed`);
}

export const subscribeClient = onRequest({ region: 'europe-west1', cors: true }, async (req, res) => {
  console.log(`[subscribeClient] ${req.method} from ${req.headers.origin || 'unknown origin'}`);
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
  const { endpoint, keys, userEmail, deviceInfo } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth || !userEmail) {
    console.warn(`[subscribeClient] REJECTED 400 — endpoint:${!!endpoint} p256dh:${!!keys?.p256dh} auth:${!!keys?.auth} userEmail:${!!userEmail}`);
    res.status(400).json({ error: 'Invalid data' });
    return;
  }
  const subId = Buffer.from(endpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
  const now = admin.firestore.FieldValue.serverTimestamp();
  await db.collection('clientSubscriptions').doc(subId).set({
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    userEmail: String(userEmail).toLowerCase().trim(),
    deviceInfo: deviceInfo || 'Unknown',
    failures: 0,
    createdAt: now,
    updatedAt: now,
  });
  res.status(200).json({ success: true, message: 'Subscribed' });
});

export const updateClientPushSubscription = onRequest({ region: 'europe-west1', cors: true }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
  const { oldEndpoint, newEndpoint, keys, userEmail, deviceInfo } = req.body;
  if (!oldEndpoint || !newEndpoint || !keys?.p256dh || !keys?.auth || !userEmail) {
    res.status(400).json({ success: false, error: 'Invalid data' });
    return;
  }
  try {
    const oldSubId = Buffer.from(oldEndpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
    const newSubId = Buffer.from(newEndpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.delete(db.collection('clientSubscriptions').doc(oldSubId));
    batch.set(db.collection('clientSubscriptions').doc(newSubId), {
      endpoint: newEndpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      userEmail: String(userEmail).toLowerCase().trim(),
      deviceInfo: deviceInfo || 'Unknown',
      failures: 0,
      createdAt: now,
      updatedAt: now,
    });
    await batch.commit();
    res.status(200).json({ success: true, message: 'Subscription updated' });
  } catch (err: unknown) {
    console.error('[updateClientPushSubscription] Error:', getErrorMessage(err));
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

export const unsubscribeClient = onRequest({ region: 'europe-west1', cors: true }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
  const { endpoint } = req.body;
  if (!endpoint) { res.status(400).json({ error: 'Endpoint required' }); return; }
  const subId = Buffer.from(endpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
  await db.collection('clientSubscriptions').doc(subId).delete();
  res.status(200).json({ success: true, message: 'Unsubscribed' });
});

// ============================================================================
// Notify clients when a single occurrence of a recurring block is released
// ============================================================================

export const notifySlotReleased = onDocumentUpdated({ region: 'europe-west1', minInstances: 0, document: 'blockedSlots/{blockId}' }, async (event) => {
  const data = event.data;
  const before = data?.before?.data();
  const after = data?.after?.data();
  if (!data || !before || !after) return;

  const beforeReleased: string[] = Array.isArray(before.releasedDates) ? before.releasedDates : [];
  const afterReleased: string[] = Array.isArray(after.releasedDates) ? after.releasedDates : [];
  const added = afterReleased.filter((d) => !beforeReleased.includes(d));
  if (added.length === 0) return;

  const blockId = data.after.id;
  const courtId = (after.courtId as string) || '';
  const courtName = (after.courtName as string) || 'Court';
  const startTime = (after.startTime as string) || '';
  const endTime = (after.endTime as string) || '';

  const formatReleaseDate = (dateStr: string): { weekday: string; dayMon: string } => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return {
      weekday: date.toLocaleDateString('en-ZA', { weekday: 'long' }),
      dayMon: date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }),
    };
  };

  for (const dateStr of added) {
    const markerId = `${blockId}_${dateStr}`;

    try {
      // Deduplicate via transaction
      const alreadySent = await db.runTransaction(async (tx) => {
        const markerRef = db.collection('releaseNotifications').doc(markerId);
        const marker = await tx.get(markerRef);
        if (marker.exists) return true;
        tx.set(markerRef, { blockId, date: dateStr, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        return false;
      });

      if (alreadySent) {
        console.log(`[notifySlotReleased] ${markerId} already notified`);
        continue;
      }

      const { weekday, dayMon } = formatReleaseDate(dateStr);
      const body = `${courtName} · ${weekday} ${dayMon} · ${startTime}–${endTime} — tap to book.`;

      // Deep link straight into a pre-filled booking for this slot (K-8). The client
      // parses ?book=1&court&date&start&end and jumps into the wizard at the slot.
      const deepLink = `https://stella-indoor.web.app/?book=1&court=${encodeURIComponent(courtId)}&date=${encodeURIComponent(dateStr)}&start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}`;

      // Push to all subscribed client devices
      await sendPushToAllClients({
        title: 'Slot just opened up! ⚽',
        body,
        tag: `release-${markerId}`,
        url: deepLink,
        courtId,
        date: dateStr,
        startTime,
        endTime,
        icon: '/logo-original.jpg',
        badge: '/badge-client-v2.png',
        requireInteraction: 'false',
      });

      // In-app notification docs for all known client users
      const usersSnap = await db.collection('users').select('email').get();
      const now = Date.now();
      const batch = db.batch();
      usersSnap.docs.forEach((u) => {
        const email = (u.data().email as string)?.toLowerCase().trim();
        if (!email) return;
        batch.set(db.collection('notifications').doc(`release-${markerId}-${email.replace(/[^a-zA-Z0-9]/g, '_')}`), {
          type: 'slot-released',
          userEmail: email,
          bookingId: '',
          courtId,
          courtName,
          date: dateStr,
          startTime,
          endTime,
          url: deepLink,
          title: 'Slot just opened up! ⚽',
          message: body,
          read: false,
          shown: false,
          createdAt: now,
        });
      });
      await batch.commit();

      console.log(`[notifySlotReleased] Notified for ${markerId}`);
    } catch (err) {
      console.error(`[notifySlotReleased] Error for ${markerId}:`, getErrorMessage(err));
    }
  }
});

// ============================================================================
// Server-side notification lifecycle.
// Firestore rules allow only admins to CREATE notification/scheduledEmail
// docs, so all creation happens here (Admin SDK bypasses rules). The client
// app only reads its notifications and updates read/shown flags.
// South Africa has no DST — booking wall-clock times are always UTC+2.
// ============================================================================

const SA_UTC_OFFSET = '+02:00';

function bookingTimestampMs(date: string, startTime: string): number {
  const [h, m] = startTime.split(':').map(Number);
  return new Date(
    `${date}T${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}:00${SA_UTC_OFFSET}`
  ).getTime();
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-ZA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

async function createReminderNotifications(booking: FirebaseFirestore.DocumentData, bookingId: string) {
  const userEmail = (booking.userEmail as string | undefined)?.toLowerCase().trim();
  if (!userEmail) return;
  const startMs = bookingTimestampMs(booking.date, booking.startTime);
  if (startMs <= Date.now()) return;

  // Spec (user, 2026-07-10): 1 hour before, 30 minutes before, at start time —
  // mirroring the scheduled-email track exactly.
  const reminders = [
    { type: 'reminder-1h', minutesBefore: 60, phrase: 'is in 1 hour' },
    { type: 'reminder-30m', minutesBefore: 30, phrase: 'is in 30 minutes' },
    { type: 'reminder-at-time', minutesBefore: 0, phrase: 'is starting now' },
  ];

  const batch = db.batch();
  for (const r of reminders) {
    const scheduledFor = startMs - r.minutesBefore * 60 * 1000;
    if (scheduledFor <= Date.now()) continue;
    // Field shapes/ids must match src/hooks/useNotifications.ts docFromSnapshot
    // (numbers for createdAt/scheduledFor, not Firestore Timestamps).
    batch.set(db.collection('notifications').doc(`reminder-${r.type}-${bookingId}`), {
      type: r.type,
      userEmail,
      bookingId,
      courtName: booking.courtName || '',
      date: booking.date || '',
      startTime: booking.startTime || '',
      title: 'Booking Reminder',
      message: `Your booking for ${booking.courtName} on ${booking.date} at ${booking.startTime} ${r.phrase}.`,
      read: false,
      createdAt: Date.now(),
      scheduledFor,
      shown: false,
    });
  }
  await batch.commit();
}

async function createScheduledReminderEmails(booking: FirebaseFirestore.DocumentData, bookingId: string) {
  const userEmail = (booking.userEmail as string | undefined)?.toLowerCase().trim();
  if (!userEmail) return;
  const startMs = bookingTimestampMs(booking.date, booking.startTime);
  const now = Date.now();

  // Shapes must match the scheduled email docs read by sendDueReminderEmails.
  const schedules = [
    { type: 'reminder-1h', sendAt: startMs - 60 * 60 * 1000 },
    { type: 'reminder-30m', sendAt: startMs - 30 * 60 * 1000 },
    { type: 'reminder-at-time', sendAt: startMs },
  ];

  const batch = db.batch();
  for (const s of schedules) {
    if (s.sendAt <= now) continue;
    const id = `email-${bookingId}-${s.type}`;
    batch.set(db.collection('scheduledEmails').doc(id), {
      id,
      bookingId,
      userEmail,
      type: s.type,
      sendAt: admin.firestore.Timestamp.fromMillis(s.sendAt),
      sent: false,
      courtName: booking.courtName || '',
      date: booking.date || '',
      startTime: booking.startTime || '',
      endTime: booking.endTime || '',
      duration: booking.duration || 0,
      totalPrice: booking.totalPrice || 0,
      clientName: booking.clientDetails?.fullName || 'Valued Client',
      clientPhone: booking.clientDetails?.phone ?? null,
      teamName: booking.clientDetails?.teamName ?? null,
      soccerBall: booking.addons?.soccerBall ?? 0,
      bibs: booking.addons?.bibs ?? 0,
      createdAt: admin.firestore.Timestamp.fromMillis(now),
    });
  }
  await batch.commit();
}

async function cleanupBookingSideEffects(bookingId: string) {
  // Delete reminder notifications and un-sent scheduled emails for the booking.
  const [notifSnap, emailSnap] = await Promise.all([
    db.collection('notifications').where('bookingId', '==', bookingId).get(),
    db.collection('scheduledEmails').where('bookingId', '==', bookingId).where('sent', '==', false).get(),
  ]);
  const batch = db.batch();
  // Keep cancellation notices; remove only reminders.
  notifSnap.docs.filter(d => String(d.data().type || '').startsWith('reminder')).forEach(d => batch.delete(d.ref));
  emailSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

async function sendBrevoEmail(toEmail: string, toName: string, subject: string, message: string): Promise<boolean> {
  const brevoApiKey = process.env.BREVO_API_KEY;
  if (!brevoApiKey) {
    console.error('[sendBrevoEmail] BREVO_API_KEY is not set');
    return false;
  }
  const senderEmail = process.env.FROM_EMAIL || 'stellasportshub@gmail.com';
  const senderName = process.env.FROM_NAME || 'Stella Indoor Sports Hub';
  try {
    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': brevoApiKey },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: toEmail, name: toName || toEmail }],
        subject,
        htmlContent: `<p>${message.replace(/\n/g, '<br>')}</p>`,
        textContent: message,
      }),
    });
    if (!brevoRes.ok) {
      console.error('[sendBrevoEmail] Brevo error:', await brevoRes.text());
      return false;
    }
    return true;
  } catch (err: unknown) {
    console.error('[sendBrevoEmail] Fetch error:', getErrorMessage(err));
    return false;
  }
}

// Server-side reminder email delivery. Previously emails were sent by a 30s
// poller inside the ADMIN web app — meaning no open admin dashboard = no reminder
// emails. This schedule makes delivery unconditional; the old client poller has
// been removed to avoid double-sends.
export const sendDueReminderEmails = onSchedule(
  { region: 'europe-west1', schedule: 'every 5 minutes' },
  async () => {
    const now = Date.now();
    const snap = await db.collection('scheduledEmails').where('sent', '==', false).get();
    if (snap.empty) return;

    const templates: Record<string, { subject: (id: string) => string; body: (e: FirebaseFirestore.DocumentData) => string }> = {
      'reminder-1h': {
        subject: (id) => `Reminder: Your booking is in 1 hour - ${id}`,
        body: (e) => `This is a friendly reminder that your booking for ${e.courtName} is in 1 hour. Date: ${formatDate(String(e.date))} at ${e.startTime}. Venue: Stella Indoor Sports Hub, Durban.`,
      },
      'reminder-30m': {
        subject: (id) => `Reminder: Your booking is in 30 minutes - ${id}`,
        body: (e) => `Your booking for ${e.courtName} is in 30 minutes! Date: ${formatDate(String(e.date))} at ${e.startTime}. Please arrive at Stella Indoor Sports Hub, Durban, in good time.`,
      },
      'reminder-at-time': {
        subject: (id) => `Your booking is now - ${id}`,
        body: (e) => `It's time! Your booking for ${e.courtName} is now. Date: ${formatDate(String(e.date))} at ${e.startTime}. Enjoy your session at Stella Indoor Sports Hub, Durban!`,
      },
    };

    let sent = 0, skipped = 0;
    for (const docSnap of snap.docs) {
      const e = docSnap.data();
      if (e.cancelled === true) continue;
      const sendAt = typeof e.sendAt?.toMillis === 'function' ? e.sendAt.toMillis() : Number(e.sendAt);
      if (!sendAt || sendAt > now) continue;

      // Staleness guard: a reminder arriving >30 min after the booking start
      // helps nobody (e.g. emails queued while the old client-poller had no
      // open admin app). Mark skipped rather than emailing late.
      const startMs = bookingTimestampMs(e.date, e.startTime);
      if (now > startMs + 30 * 60 * 1000) {
        await docSnap.ref.update({ sent: true, skipped: 'stale' });
        skipped++;
        continue;
      }

      // Belt over the delete-on-cancel braces: booking must still be confirmed.
      const booking = await db.collection('bookings').doc(String(e.bookingId)).get();
      if (!booking.exists || booking.data()?.status === 'cancelled') {
        await docSnap.ref.update({ sent: true, skipped: 'cancelled' });
        skipped++;
        continue;
      }

      const t = templates[String(e.type)];
      if (!t) continue;
      const ok = await sendBrevoEmail(String(e.userEmail), String(e.clientName || 'Valued Client'), t.subject(String(e.bookingId)), t.body(e));
      if (ok) {
        await docSnap.ref.update({ sent: true, sentBy: 'server', sentAt: admin.firestore.Timestamp.now() });
        sent++;
      } else {
        console.warn(`[sendDueReminderEmails] send failed for ${docSnap.id}; will retry next run`);
      }
    }
    if (sent || skipped) console.log(`[sendDueReminderEmails] sent=${sent} skipped=${skipped}`);
  }
);

export const onBookingCreated = onDocumentCreated({ region: 'europe-west1', minInstances: 1, document: 'bookings/{bookingId}' }, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const booking = snap.data();
  if (booking.status !== 'confirmed') return;

  await Promise.allSettled([
    sendPushToAllAdmins({
      title: 'Court booked',
      body: `Court booked at ${booking.startTime || ''} on ${booking.date || ''}.`,
      tag: `booking-${snap.id}`, url: 'https://stella-indoor-admin.web.app/#/calendar', icon: '/logo-admin.png', badge: '/badge-admin.png',
    }),
    // Client-side creation of these is blocked by Firestore rules by design —
    // the server is the single writer for reminders.
    createReminderNotifications(booking, snap.id),
    createScheduledReminderEmails(booking, snap.id),
  ]);
});

export const onBookingCancelled = onDocumentUpdated({ region: 'europe-west1', minInstances: 1, document: 'bookings/{bookingId}' }, async (event) => {
  const data = event.data;
  const before = data?.before?.data();
  const after = data?.after?.data();
  if (!data || !before || !after) return;
  if (before.status === 'cancelled' || after.status !== 'cancelled') return;

  const bookingId = data.after.id;
  const cancelledBy = (after.cancelledBy as string | undefined) || 'client';
  const userEmail = (after.userEmail as string | undefined)?.toLowerCase().trim();
  const clientName = after.clientDetails?.fullName || 'Valued Client';

  const work: Promise<unknown>[] = [cleanupBookingSideEffects(bookingId)];

  // Cancellation email to the client — server-side so it always fires,
  // regardless of which app performed the cancellation.
  if (userEmail) {
    const bySentence = cancelledBy === 'admin'
      ? 'Your booking has been cancelled by Stella Indoor.'
      : 'This confirms that you have cancelled your booking.';
    work.push(sendBrevoEmail(
      userEmail,
      clientName,
      `Booking Cancelled — ${after.courtName} on ${after.date}`,
      `Hi ${clientName},\n\n${bySentence}\n\nBooking reference: ${bookingId}\nCourt: ${after.courtName}\nDate: ${after.date}\nTime: ${after.startTime} - ${after.endTime}\n\nIf you have any questions, please contact us.\n\nStella Indoor Sports Hub`
    ));
  }

  if (cancelledBy === 'admin') {
    // Notify the client in-app (bell + browser notification when their app is open).
    if (userEmail) {
      work.push(db.collection('notifications').doc(`cancel-${bookingId}`).set({
        type: 'admin-cancelled',
        userEmail,
        bookingId,
        courtName: after.courtName || '',
        date: after.date || '',
        startTime: after.startTime || '',
        title: 'Booking Cancelled',
        message: `Your booking for ${after.courtName} on ${after.date} at ${after.startTime} has been cancelled by the admin.`,
        read: false,
        createdAt: Date.now(),
        shown: false,
      }));
    }
    // No admin push — admins should not be echoed their own action.
  } else {
    // Client cancelled — notify the admins.
    work.push(sendPushToAllAdmins({
      title: 'Court cancelled',
      body: `${clientName} cancelled ${after.courtName || 'a court'} at ${after.startTime || ''} on ${after.date || ''}.`,
      tag: `cancel-${bookingId}`, url: 'https://stella-indoor-admin.web.app/#/calendar', icon: '/logo-admin.png', badge: '/badge-admin.png',
    }));
  }

  const results = await Promise.allSettled(work);
  results.forEach((r) => {
    if (r.status === 'rejected') console.error('[onBookingCancelled] task failed:', r.reason);
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

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function blockAppliesToDate(
  block: {
    startDate: string;
    endDate?: string | null;
    isRecurring?: boolean;
    dayOfWeek?: number;
    intervalWeeks?: number;
    exactDates?: string[];
    overrides?: Record<string, boolean>;
    releasedDates?: string[];
  },
  date: string
): boolean {
  const overrides = block.overrides || {};
  if (overrides[date] !== undefined) return overrides[date];
  if (block.releasedDates?.includes(date)) return false;

  if (block.exactDates && block.exactDates.length > 0) {
    return block.exactDates.includes(date);
  }

  if (block.isRecurring) {
    const checkDate = new Date(date);
    const checkDay = checkDate.getDay();
    const blockDay = block.dayOfWeek ?? new Date(block.startDate).getDay();
    if (checkDay !== blockDay) return false;

    const blockStart = new Date(block.startDate);
    if (checkDate.getTime() < blockStart.getTime()) return false;

    if (block.endDate) {
      const blockEnd = new Date(block.endDate);
      if (checkDate.getTime() > blockEnd.getTime()) return false;
    }

    const weekDiff = Math.floor((checkDate.getTime() - blockStart.getTime()) / MS_PER_WEEK);
    const interval = block.intervalWeeks || 1;
    return weekDiff % interval === 0;
  }

  return block.startDate === date;
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

  const blocked = blockedSnap.docs.map((doc) => doc.data()).filter((block) =>
    blockAppliesToDate(block as Parameters<typeof blockAppliesToDate>[0], date)
  ).map((b) => ({ startTime: b.startTime as string, endTime: b.endTime as string }));

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

    // Reject a start time that has already passed (K-20). bookingTimestampMs is the
    // project's canonical slot→instant conversion (SAST, UTC+2 — see the reminder
    // scheduler at line ~406), so the comparison is timezone-correct.
    if (bookingTimestampMs(body.date, body.startTime) <= Date.now()) {
      res.status(400).json({ success: false, error: 'That time slot has already passed.' });
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
      members: [body.userEmail.toLowerCase()],
    });

    res.status(200).json({ success: true, bookingId: id });
  } catch (err: unknown) {
    console.error('[createBooking] Error:', getErrorMessage(err));
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

// ============================================================================
// Booking invite functions
// Generates a secure invite link token for a booking and lets recipients join.
// ============================================================================

function generateInviteToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

export const generateBookingInvite = onRequest({ region: 'europe-west1', minInstances: 1, cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const { idToken, bookingId } = req.body as { idToken?: string; bookingId?: string };
  if (!idToken || !bookingId) {
    res.status(400).json({ success: false, error: 'Missing idToken or bookingId' });
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const userEmail = decoded.email?.toLowerCase();
    if (!userEmail) {
      res.status(403).json({ success: false, error: 'No email in token' });
      return;
    }

    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) {
      res.status(404).json({ success: false, error: 'Booking not found' });
      return;
    }

    const booking = bookingSnap.data()!;
    if (booking.userEmail?.toLowerCase() !== userEmail) {
      res.status(403).json({ success: false, error: 'Only the booking owner can create invites' });
      return;
    }

    const token = generateInviteToken();
    await db.collection('bookingInvites').doc(token).set({
      bookingId,
      courtName: booking.courtName || '',
      date: booking.date || '',
      startTime: booking.startTime || '',
      endTime: booking.endTime || '',
      createdBy: userEmail,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      uses: 0,
      maxUses: 50,
      active: true,
    });

    res.status(200).json({ success: true, token });
  } catch (err: unknown) {
    console.error('[generateBookingInvite] Error:', getErrorMessage(err));
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
});

export const joinBookingByInvite = onRequest({ region: 'europe-west1', minInstances: 1, cors: true }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const { idToken, token } = req.body as { idToken?: string; token?: string };
  if (!idToken || !token) {
    res.status(400).json({ success: false, error: 'Missing idToken or token' });
    return;
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const userEmail = decoded.email?.toLowerCase();
    if (!userEmail) {
      res.status(403).json({ success: false, error: 'No email in token' });
      return;
    }

    const inviteRef = db.collection('bookingInvites').doc(token);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) {
      res.status(404).json({ success: false, error: 'Invite not found' });
      return;
    }

    const invite = inviteSnap.data()!;
    if (!invite.active) {
      res.status(410).json({ success: false, error: 'Invite is no longer active' });
      return;
    }
    if ((invite.uses || 0) >= (invite.maxUses || 0)) {
      res.status(410).json({ success: false, error: 'Invite has reached its usage limit' });
      return;
    }

    const bookingRef = db.collection('bookings').doc(invite.bookingId);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) {
      res.status(404).json({ success: false, error: 'Booking not found' });
      return;
    }

    const booking = bookingSnap.data()!;
    if (booking.status !== 'confirmed') {
      res.status(409).json({ success: false, error: 'Booking is not confirmed' });
      return;
    }

    const members: string[] = Array.isArray(booking.members) ? booking.members : [];
    if (members.map(m => m.toLowerCase()).includes(userEmail)) {
      res.status(200).json({ success: true, bookingId: invite.bookingId, alreadyJoined: true });
      return;
    }

    await db.runTransaction(async (transaction) => {
      const freshInvite = await transaction.get(inviteRef);
      const freshInviteData = freshInvite.data()!;
      if (!freshInviteData.active || (freshInviteData.uses || 0) >= (freshInviteData.maxUses || 0)) {
        throw new Error('Invite is no longer valid');
      }
      transaction.update(inviteRef, { uses: (freshInviteData.uses || 0) + 1 });
      transaction.update(bookingRef, {
        members: admin.firestore.FieldValue.arrayUnion(userEmail),
      });
    });

    res.status(200).json({ success: true, bookingId: invite.bookingId });
  } catch (err: unknown) {
    const msg = getErrorMessage(err);
    console.error('[joinBookingByInvite] Error:', msg);
    if (msg === 'Invite is no longer valid') {
      res.status(410).json({ success: false, error: msg });
      return;
    }
    res.status(500).json({ success: false, error: msg });
  }
});

