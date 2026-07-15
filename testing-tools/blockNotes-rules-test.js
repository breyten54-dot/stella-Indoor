// Verifies Firestore rules for the blockNotes collection:
// - authenticated admins can read/write
// - non-admin clients are denied read access
// Requires VITE_ADMIN_EMAIL/PASSWORD and VITE_TEST_CLIENT_EMAIL/PASSWORD.
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } = require('firebase/auth');
const { getFirestore, doc, setDoc, getDoc, deleteDoc } = require('firebase/firestore');
const fs = require('fs');

const ENV_PATH = 'C:/Users/Administrator/OneDrive/Desktop/HIVE/Stella Project/stella-indoor-source/.env';
const env = (n) => {
  const line = (fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).find(l => l.startsWith(n + '=')) || '');
  return line.slice(n.length + 1).trim();
};

(async () => {
  const app = initializeApp({
    apiKey: env('VITE_FIREBASE_API_KEY'),
    authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: env('VITE_FIREBASE_PROJECT_ID'),
  });
  const auth = getAuth(app);
  const db = getFirestore(app);

  const results = [];
  const check = (n, ok, d) => {
    results.push(ok);
    console.log(`  ${ok ? 'PASS' : 'FAIL'} — ${n}${d ? ' (' + d + ')' : ''}`);
  };

  const noteId = 'rules-test-' + Date.now();

  try {
    // 1. Admin can create and read.
    await signInWithEmailAndPassword(auth, env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD'));
    await setDoc(doc(db, 'blockNotes', noteId), {
      paymentCadence: 'monthly',
      rate: 750,
      paidToDate: 4500,
      updatedBy: env('VITE_ADMIN_EMAIL'),
      updatedAt: Date.now(),
    });
    const adminRead = await getDoc(doc(db, 'blockNotes', noteId));
    check('admin can read blockNotes', adminRead.exists(), `rate=${adminRead.data()?.rate}`);

    // 2. Client cannot read.
    const clientEmailRaw = env('VITE_TEST_CLIENT_EMAIL');
    const clientPassword = env('VITE_TEST_CLIENT_PASSWORD');
    if (!clientEmailRaw || !clientPassword) {
      console.log('  SKIP — VITE_TEST_CLIENT_EMAIL/PASSWORD not set');
    } else {
      const clientEmail = clientEmailRaw.toLowerCase().trim();
      await signOut(auth);
      try {
        await createUserWithEmailAndPassword(auth, clientEmail, clientPassword);
      } catch (e) {
        if (!e.message?.includes('email-already-in-use')) throw e;
      }
      await signInWithEmailAndPassword(auth, clientEmail, clientPassword);

      let denied = false;
      let msg = '';
      try {
        await getDoc(doc(db, 'blockNotes', noteId));
      } catch (e) {
        denied = true;
        msg = e.message || String(e);
      }
      check('client read denied', denied, msg);
    }
  } finally {
    // Cleanup as admin.
    try {
      await signInWithEmailAndPassword(auth, env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD'));
    } catch {
      // ignore
    }
    await deleteDoc(doc(db, 'blockNotes', noteId)).catch(() => {});
    console.log('[rules-test] cleaned up test note');
  }

  const failed = results.filter(r => !r).length;
  console.log(`\n===== BLOCK NOTES RULES TEST: ${results.length - failed}/${results.length} passed =====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
