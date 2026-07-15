// Verifies a recurring block created through the LIVE admin form anchors to the
// closest PAST/today occurrence of the chosen weekday (not the next one).
// Fills the real create form, then reads the stored doc from Firestore.
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, query, where, getDocs, deleteDoc, doc } = require('firebase/firestore');
const { chromium } = require('playwright');
const fs = require('fs');

const ENV = 'C:/Users/Administrator/OneDrive/Desktop/HIVE/Stella Project/stella-indoor-source/.env';
const env = (n) => (fs.readFileSync(ENV, 'utf8').split(/\r?\n/).find(l => l.startsWith(n + '=')) || '').slice(n.length + 1).trim();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const PROFILE = 'C:/Users/ADMINI~1/AppData/Local/Temp/claude/c--Users-Administrator-OneDrive-Desktop-HIVE/bb5c2562-d29c-43ca-834b-faf55bec5615/scratchpad/stella-push-repro/profile-panel';

(async () => {
  const app = initializeApp({ apiKey: env('VITE_FIREBASE_API_KEY'), authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'), projectId: env('VITE_FIREBASE_PROJECT_ID') });
  await signInWithEmailAndPassword(getAuth(app), env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD'));
  const db = getFirestore(app);

  const tag = 'ANCHORTEST-' + Date.now();
  const todayStr = ymd(new Date());
  const results = [];
  const check = (n, ok, d) => { results.push(ok); console.log(`  ${ok ? 'PASS' : 'FAIL'} — ${n}${d ? ' (' + d + ')' : ''}`); };

  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, channel: 'chrome' });
  const page = ctx.pages()[0] || await ctx.newPage();
  let createdId = null;
  try {
    await page.goto('https://stella-indoor-admin.web.app/#/blocked-slots', { waitUntil: 'domcontentloaded', timeout: 60000 });
    try {
      await page.waitForSelector('input[type=email]', { timeout: 8000 });
      await page.fill('input[type=email]', env('VITE_ADMIN_EMAIL'));
      await page.fill('input[type=password]', env('VITE_ADMIN_PASSWORD'));
      await page.click('button[type=submit]'); await page.waitForTimeout(6000);
      await page.goto('https://stella-indoor-admin.web.app/#/blocked-slots', { waitUntil: 'domcontentloaded' });
    } catch { /* already logged in */ }
    // Bust the admin SW cache so we exercise the just-deployed bundle, not a
    // stale-while-revalidate cached copy.
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await page.waitForSelector('text=/Add Block/i', { timeout: 20000 });

    await page.getByText('Add Block', { exact: false }).first().click();
    await page.waitForTimeout(1200);
    // Default type is block-booking (needs a client name). Pick a weekday whose
    // occurrence is guaranteed in the PAST this week: choose yesterday's weekday.
    const jsToUi = (js) => (js === 0 ? 6 : js - 1);
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    const targetUi = jsToUi(yest.getDay());
    const short = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][targetUi];
    await page.getByRole('button', { name: new RegExp('^' + short + '$') }).first().click();
    await page.waitForTimeout(300);
    // Client name (unique tag) so we can find the doc
    await page.getByPlaceholder(/John Smith/i).fill(tag);
    await page.waitForTimeout(200);
    // Submit (the form's submit button, label like "Block Monday 10:00")
    await page.locator('form button[type=submit]').click();
    await page.waitForTimeout(6000);

    // Read the created doc from Firestore by clientName
    const snap = await getDocs(query(collection(db, 'blockedSlots'), where('clientName', '==', tag)));
    check('block was created', snap.size === 1, `found ${snap.size}`);
    if (snap.size >= 1) {
      const d = snap.docs[0]; createdId = d.id; const data = d.data();
      check('startDate is on/before today (anchors to past, not future)', data.startDate <= todayStr, `startDate=${data.startDate} today=${todayStr}`);
      const jsDay = new Date(data.startDate + 'T00:00:00').getDay();
      check('startDate weekday matches selected day', jsToUi(jsDay) === targetUi, `${short} vs stored ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][jsToUi(jsDay)]}`);
      check('isRecurring true', data.isRecurring === true);
    }
  } finally {
    await ctx.close();
    if (createdId) { await deleteDoc(doc(db, 'blockedSlots', createdId)); console.log('[e2e] cleaned up test block'); }
  }
  const failed = results.filter(r => !r).length;
  console.log(`\n===== SLOT ANCHOR E2E: ${results.length - failed}/${results.length} passed =====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
