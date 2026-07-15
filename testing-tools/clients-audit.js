// Audits the Stella `users` collection (the admin Clients-menu source).
// READ-ONLY by default: enumerates users, flags likely-test/bot accounts, and
// reports the strict bot-signature count — the check to run after any cleanup
// (expect "strict-signature bots: 0").
//
//   node clients-audit.js            # read-only report
//   node clients-audit.js --delete   # ALSO delete strict-signature bot docs
//
// Deletion is guarded by an exact signature so a real account can never match:
//   stella.(audit|debug|timing).<digits>@mailinator.com
// It removes only the Firestore user doc (which is what shows in the Clients
// menu). Note: Kimi's cleanup-bot.mjs teardown now removes these at the end of
// each audit run, so --delete should rarely be needed.
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, getDocs, deleteDoc, doc } = require('firebase/firestore');
const fs = require('fs');

const ENV = 'C:/Users/Administrator/OneDrive/Desktop/HIVE/Stella Project/stella-indoor-source/.env';
const env = (n) => (fs.readFileSync(ENV, 'utf8').split(/\r?\n/).find((l) => l.startsWith(n + '=')) || '').slice(n.length + 1).trim();

// Broad heuristic (surfaces candidates for a human to eyeball).
const TEST_PATTERNS = [
  /\btest\b/i, /e2e/i, /playwright/i, /\bbot\b/i, /audit/i, /verification/i, /auto[- ]?cancel/i,
  /reminder-check/i, /anchortest/i, /expirytest/i, /\bdemo\b/i, /\bsample\b/i, /qa[-_ ]/i,
  /asdf|qwerty|lorem|dummy|fake|placeholder|xxx|zzz/i, /@example\.(com|org)/i, /@test\./i,
  /mailinator|tempmail|10minutemail/i, /noreply/i, /\+test/i,
];
const looksTest = (u) => TEST_PATTERNS.some((re) => re.test(`${u.name} ${u.email} ${u.phone}`));

// Hard guard — the ONLY docs eligible for --delete.
const BOT_RE = /^stella\.(audit|debug|timing)\.\d+@mailinator\.com$/i;

(async () => {
  const doDelete = process.argv.includes('--delete');
  const app = initializeApp({ apiKey: env('VITE_FIREBASE_API_KEY'), authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'), projectId: env('VITE_FIREBASE_PROJECT_ID') });
  await signInWithEmailAndPassword(getAuth(app), env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD'));
  const db = getFirestore(app);
  const snap = await getDocs(collection(db, 'users'));

  const users = snap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, name: x.name || '(no name)', email: x.email || d.id, phone: x.phone || '-' };
  });
  const heuristic = users.filter(looksTest);
  const real = users.filter((u) => !looksTest(u));
  const strictBots = users.filter((u) => BOT_RE.test((u.email || u.id || '').toString()));

  console.log(`TOTAL users: ${users.length}`);
  console.log(`strict-signature bots (deletable): ${strictBots.length}`);
  console.log(`\n=== LIKELY TEST / BOT by heuristic (${heuristic.length}) ===`);
  heuristic.forEach((u) => console.log(`  ${BOT_RE.test(u.email) ? '[STRICT] ' : '         '}name="${u.name}"  email="${u.email}"  phone="${u.phone}"`));
  console.log(`\n=== LIKELY REAL — KEEP (${real.length}) ===`);
  real.forEach((u) => console.log(`  name="${u.name}"  email="${u.email}"`));

  if (doDelete) {
    console.log(`\n--delete: removing ${strictBots.length} strict-signature bot doc(s)...`);
    let deleted = 0;
    for (const u of strictBots) { await deleteDoc(doc(db, 'users', u.id)); deleted++; }
    const after = await getDocs(collection(db, 'users'));
    const surviving = after.docs.filter((d) => BOT_RE.test((d.data().email || d.id || '').toString())).length;
    console.log(`deleted ${deleted} | users remaining: ${after.size} | surviving strict bots: ${surviving}`);
    process.exit(surviving === 0 ? 0 : 1);
  }
  process.exit(strictBots.length === 0 ? 0 : 2); // exit 2 = strict bots present (read-only)
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
