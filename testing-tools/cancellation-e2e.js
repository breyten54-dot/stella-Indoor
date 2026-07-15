// Stella cancellation fan-out E2E — drives the REAL Firebase project via the
// client SDK (signed in as the admin account) and verifies every server-side
// side effect of onBookingCreated / onBookingCancelled. No UI, no user needed.
//
// Side effects on the live system (intentional, reported to user):
//   - 2 "Court booked" + 1 "Court cancelled" admin pushes (real devices get them)
//   - 2 cancellation emails to the admin account's inbox
//   - 2 cancelled bookings created then deleted at the end
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore, collection, addDoc, doc, updateDoc, getDoc, getDocs,
  query, where, deleteDoc,
} = require('firebase/firestore');
const fs = require('fs');

const ENV_PATH = 'C:/Users/Administrator/OneDrive/Desktop/HIVE/Stella Project/stella-indoor-source/.env';
function envVal(name) {
  const line = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).find(l => l.startsWith(name + '='));
  return line ? line.slice(name.length + 1).trim() : '';
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
}

(async () => {
  const app = initializeApp({
    apiKey: envVal('VITE_FIREBASE_API_KEY'),
    authDomain: envVal('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: envVal('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: envVal('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: envVal('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: envVal('VITE_FIREBASE_APP_ID'),
  });
  const auth = getAuth(app);
  const db = getFirestore(app);

  const email = envVal('VITE_ADMIN_EMAIL');
  await signInWithEmailAndPassword(auth, email, envVal('VITE_ADMIN_PASSWORD'));
  console.log(`[e2e] signed in as ${email}`);

  const mkBooking = (startTime, endTime) => ({
    courtId: 'court-1',
    courtName: 'Court 1',
    date: '2026-07-25',
    startTime,
    endTime,
    duration: 60,
    totalPrice: 0,
    status: 'confirmed',
    userEmail: email,
    members: [],
    clientDetails: { fullName: 'E2E-VERIFICATION (auto-cancelled)', phone: '0000000000' },
    addons: { soccerBall: 0, bibs: 0 },
    createdAt: Date.now(),
  });

  const remindersOf = async (id) =>
    (await getDocs(query(collection(db, 'notifications'), where('bookingId', '==', id)))).docs;
  const emailsOf = async (id) =>
    (await getDocs(query(collection(db, 'scheduledEmails'), where('bookingId', '==', id)))).docs;

  // ---------- TEST A: client cancels -> admins pushed, no client notification ----------
  console.log('\n[e2e] TEST A: create booking (client-cancel path)');
  const refA = await addDoc(collection(db, 'bookings'), mkBooking('06:00', '07:00'));
  console.log(`[e2e] booking A = ${refA.id}; waiting 25s for onBookingCreated...`);
  await sleep(25000);

  const remA = await remindersOf(refA.id);
  const emA = await emailsOf(refA.id);
  check('A1: onBookingCreated made 3 reminder notifications', remA.length === 3, `got ${remA.length}`);
  check('A2: onBookingCreated made 3 scheduled emails', emA.length === 3, `got ${emA.length}`);

  await updateDoc(doc(db, 'bookings', refA.id), {
    status: 'cancelled', cancelledBy: 'client', cancelledAt: Date.now(),
  });
  console.log('[e2e] booking A cancelled as CLIENT; waiting 25s for onBookingCancelled...');
  await sleep(25000);

  const remA2 = await remindersOf(refA.id);
  const emA2 = await emailsOf(refA.id);
  const cancelNotifA = await getDoc(doc(db, 'notifications', `cancel-${refA.id}`));
  check('A3: reminders cleaned up', remA2.length === 0, `left ${remA2.length}`);
  check('A4: scheduled emails cleaned up', emA2.length === 0, `left ${emA2.length}`);
  check('A5: NO client cancel-notification (client cancelled themselves)', !cancelNotifA.exists());

  // ---------- TEST B: admin cancels -> client notified in-app, NO admin echo ----------
  console.log('\n[e2e] TEST B: create booking (admin-cancel path)');
  const refB = await addDoc(collection(db, 'bookings'), mkBooking('07:00', '08:00'));
  console.log(`[e2e] booking B = ${refB.id}; waiting 25s for onBookingCreated...`);
  await sleep(25000);

  check('B1: onBookingCreated made 3 reminder notifications', (await remindersOf(refB.id)).length === 3);

  await updateDoc(doc(db, 'bookings', refB.id), {
    status: 'cancelled', cancelledBy: 'admin', cancelledAt: Date.now(),
  });
  console.log('[e2e] booking B cancelled as ADMIN; waiting 25s for onBookingCancelled...');
  await sleep(25000);

  const cancelNotifB = await getDoc(doc(db, 'notifications', `cancel-${refB.id}`));
  const remB2 = await remindersOf(refB.id);
  check('B2: client cancel-notification created', cancelNotifB.exists(),
    cancelNotifB.exists() ? `type=${cancelNotifB.data().type}` : 'missing');
  check('B3: notification is admin-cancelled type for the right user',
    cancelNotifB.exists() && cancelNotifB.data().type === 'admin-cancelled'
      && cancelNotifB.data().userEmail === email.toLowerCase());
  check('B4: reminders cleaned, cancel-notice kept',
    remB2.length === 1 && remB2[0].id === `cancel-${refB.id}`, `docs left: ${remB2.map(d => d.id).join(',')}`);

  // ---------- Cleanup ----------
  console.log('\n[e2e] cleanup: deleting test bookings + the test cancel notification');
  await deleteDoc(doc(db, 'notifications', `cancel-${refB.id}`));
  await deleteDoc(doc(db, 'bookings', refA.id));
  await deleteDoc(doc(db, 'bookings', refB.id));

  const failed = results.filter(r => !r.ok);
  console.log(`\n===== E2E RESULT: ${results.length - failed.length}/${results.length} passed =====`);
  process.exit(failed.length ? 1 : 0);
})().catch(err => { console.error('[e2e] FATAL:', err.message); process.exit(2); });
