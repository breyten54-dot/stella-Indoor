// Claude probe: does the deployed getCourtBookedIntervals honor releasedDates?
// block on tomorrow → blocked interval present; release tomorrow → absent. Self-cleans.
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, doc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const fs = require('fs');
const ENV = 'C:/Users/Administrator/OneDrive/Desktop/HIVE/Stella Project/stella-indoor-source/.env';
const env = (n) => ((fs.readFileSync(ENV, 'utf8').split(/\r?\n/).find(l => l.startsWith(n + '=')) || '').slice(n.length + 1).trim());
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

(async () => {
  const app = initializeApp({ apiKey: env('VITE_FIREBASE_API_KEY'), authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'), projectId: env('VITE_FIREBASE_PROJECT_ID') });
  await signInWithEmailAndPassword(getAuth(app), env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD'));
  const db = getFirestore(app);
  const results = [];
  const check = (n, ok, d) => { results.push(ok); console.log(`  ${ok ? 'PASS' : 'FAIL'} — ${n}${d ? ' (' + d + ')' : ''}`); };

  const t = new Date(); t.setDate(t.getDate() + 1);
  const dateStr = ymd(t);
  const blockRef = doc(collection(db, 'blockedSlots'));
  const call = async () => {
    const r = await fetch('https://europe-west1-stella-indoor.cloudfunctions.net/getCourtBookedIntervals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courtId: 'big-court', date: dateStr }),
    });
    return r.json();
  };

  try {
    await setDoc(blockRef, {
      courtId: 'big-court', courtName: 'Big Court', startDate: dateStr, endDate: null,
      startTime: '10:00', endTime: '12:00', type: 'block-booking', clientName: 'CLAVAIL' + Date.now(),
      isRecurring: true, intervalWeeks: 1, dayOfWeek: t.getDay(), releasedDates: [],
      createdAt: Date.now(), createdBy: env('VITE_ADMIN_EMAIL'),
    });
    const before = await call();
    const blockedBefore = (before.blocked || []).some(b => b.startTime === '10:00' || (b.start || '').includes('10:00'));
    check('server reports block BEFORE release', blockedBefore, JSON.stringify(before.blocked));

    await updateDoc(blockRef, { releasedDates: [dateStr] });
    await new Promise(r => setTimeout(r, 1500));
    const after = await call();
    const blockedAfter = (after.blocked || []).some(b => b.startTime === '10:00' || (b.start || '').includes('10:00'));
    check('server drops block AFTER release', !blockedAfter, JSON.stringify(after.blocked));
  } finally {
    await deleteDoc(blockRef).catch(() => {});
    await deleteDoc(doc(db, 'releaseNotifications', `${blockRef.id}_${dateStr}`)).catch(() => {});
    console.log('[probe] cleaned up');
  }
  const failed = results.filter(r => !r).length;
  console.log(`\n===== AVAILABILITY PROBE: ${results.length - failed}/${results.length} passed =====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
