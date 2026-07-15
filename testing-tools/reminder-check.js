// Reminder-system verification — asserts the exact reminder schedule created
// for a booking (in-app notifications + scheduled emails) and that BOTH
// cancellation paths (client and admin) stop every pending reminder.
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore, collection, addDoc, doc, updateDoc, getDocs, query, where, deleteDoc,
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
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
}

(async () => {
  const app = initializeApp({
    apiKey: envVal('VITE_FIREBASE_API_KEY'),
    authDomain: envVal('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: envVal('VITE_FIREBASE_PROJECT_ID'),
  });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const email = envVal('VITE_ADMIN_EMAIL');
  await signInWithEmailAndPassword(auth, email, envVal('VITE_ADMIN_PASSWORD'));

  // Booking ~3 days out at 10:00 SA time so every reminder is in the future.
  const start = new Date(Date.now() + 3 * 24 * 3600 * 1000);
  const date = start.toISOString().slice(0, 10);
  const startTime = '10:00', endTime = '11:00';
  const startMs = new Date(`${date}T10:00:00+02:00`).getTime();

  const mkBooking = () => ({
    courtId: 'court-1', courtName: 'Court 1', date, startTime, endTime,
    duration: 60, totalPrice: 0, status: 'confirmed', userEmail: email, members: [],
    clientDetails: { fullName: 'REMINDER-CHECK (auto-cancelled)', phone: '0000000000' },
    addons: { soccerBall: 0, bibs: 0 }, createdAt: Date.now(),
  });

  const remindersOf = async (id) =>
    (await getDocs(query(collection(db, 'notifications'), where('bookingId', '==', id)))).docs;
  const emailsOf = async (id) =>
    (await getDocs(query(collection(db, 'scheduledEmails'), where('bookingId', '==', id)))).docs;
  const mins = (ms) => Math.round((startMs - ms) / 60000); // minutes BEFORE booking start

  async function runPath(cancelledBy) {
    console.log(`\n[check] --- ${cancelledBy.toUpperCase()}-cancel path ---`);
    const ref = await addDoc(collection(db, 'bookings'), mkBooking());
    console.log(`[check] booking ${ref.id} on ${date} ${startTime}; waiting 25s for onBookingCreated...`);
    await sleep(25000);

    const rem = await remindersOf(ref.id);
    const ems = await emailsOf(ref.id);

    const remSched = rem.map(d => ({ type: d.data().type, before: mins(d.data().scheduledFor) }))
      .sort((a, b) => b.before - a.before);
    const emSched = ems.map(d => ({ type: d.data().type, before: mins(d.data().sendAt.toMillis ? d.data().sendAt.toMillis() : d.data().sendAt) }))
      .sort((a, b) => b.before - a.before);

    console.log('  in-app reminders:', JSON.stringify(remSched));
    console.log('  reminder emails: ', JSON.stringify(emSched));

    check('3 in-app reminders created', rem.length === 3, `got ${rem.length}`);
    check('in-app offsets are 60 / 30 / 0 minutes before start',
      remSched.length === 3 && remSched[0].before === 60 && remSched[1].before === 30 && remSched[2].before === 0,
      remSched.map(r => r.before).join('/'));
    check('3 reminder emails created', ems.length === 3, `got ${ems.length}`);
    check('email offsets are 60 / 30 / 0 minutes before start',
      emSched.length === 3 && emSched[0].before === 60 && emSched[1].before === 30 && emSched[2].before === 0,
      emSched.map(r => r.before).join('/'));

    await updateDoc(doc(db, 'bookings', ref.id), {
      status: 'cancelled', cancelledBy, cancelledAt: Date.now(),
    });
    console.log(`[check] cancelled as ${cancelledBy}; waiting 25s for onBookingCancelled...`);
    await sleep(25000);

    const remAfter = (await remindersOf(ref.id)).filter(d => String(d.data().type || '').startsWith('reminder'));
    const emsAfter = await emailsOf(ref.id);
    check(`${cancelledBy}-cancel: ALL in-app reminders deleted`, remAfter.length === 0, `left ${remAfter.length}`);
    check(`${cancelledBy}-cancel: ALL unsent reminder emails deleted`, emsAfter.length === 0, `left ${emsAfter.length}`);

    // Cleanup: remove the test booking (+ the admin-cancel client notice if present)
    const notice = await getDocs(query(collection(db, 'notifications'), where('bookingId', '==', ref.id)));
    for (const d of notice.docs) await deleteDoc(d.ref);
    await deleteDoc(doc(db, 'bookings', ref.id));
  }

  await runPath('client');
  await runPath('admin');

  const failed = results.filter(r => !r).length;
  console.log(`\n===== REMINDER CHECK: ${results.length - failed}/${results.length} passed =====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
