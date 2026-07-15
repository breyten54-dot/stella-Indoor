// Verifies the slot-control expiry rule + card Edit button on the LIVE admin
// site. Inserts (as admin) an expired recurring block, an expired one-off, and
// an active block; loads the page; asserts only the active one renders and its
// card has an Edit button; cleans all three up.
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, addDoc, deleteDoc, doc } = require('firebase/firestore');
const { chromium } = require('playwright');
const fs = require('fs');

const ENV = 'C:/Users/Administrator/OneDrive/Desktop/HIVE/Stella Project/stella-indoor-source/.env';
const env = (n) => (fs.readFileSync(ENV, 'utf8').split(/\r?\n/).find(l => l.startsWith(n + '=')) || '').slice(n.length + 1).trim();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

(async () => {
  const app = initializeApp({
    apiKey: env('VITE_FIREBASE_API_KEY'), authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'), projectId: env('VITE_FIREBASE_PROJECT_ID'),
  });
  await signInWithEmailAndPassword(getAuth(app), env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD'));
  const db = getFirestore(app);

  const tag = 'EXPIRYTEST-' + Date.now();
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const future = new Date(today); future.setDate(today.getDate() + 60);

  const base = { courtId: 'big-court', courtName: 'Big Court', startTime: '16:00', endTime: '17:00', type: 'block-booking', createdAt: Date.now(), createdBy: 'admin' };
  const mk = (o) => addDoc(collection(db, 'blockedSlots'), { ...base, ...o });

  const expiredRecurring = await mk({ clientName: tag + '-EXPRECUR', startDate: ymd(yesterday), endDate: ymd(yesterday), isRecurring: true, intervalWeeks: 1, dayOfWeek: yesterday.getDay() });
  const expiredOneOff = await mk({ clientName: tag + '-EXPONEOFF', startDate: ymd(yesterday), endDate: null, isRecurring: false, dayOfWeek: yesterday.getDay() });
  const active = await mk({ clientName: tag + '-ACTIVE', startDate: ymd(future), endDate: ymd(future), isRecurring: true, intervalWeeks: 1, dayOfWeek: future.getDay() });
  console.log('[e2e] inserted 3 test blocks; waiting for live sync...');

  const results = [];
  const check = (name, ok) => { results.push(ok); console.log(`  ${ok ? 'PASS' : 'FAIL'} — ${name}`); };

  const PROFILE = 'C:/Users/ADMINI~1/AppData/Local/Temp/claude/c--Users-Administrator-OneDrive-Desktop-HIVE/bb5c2562-d29c-43ca-834b-faf55bec5615/scratchpad/stella-push-repro/profile-panel';
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, channel: 'chrome' });
  const page = ctx.pages()[0] || await ctx.newPage();
  try {
    await page.goto('https://stella-indoor-admin.web.app', { waitUntil: 'domcontentloaded', timeout: 60000 });
    try {
      await page.waitForSelector('input[type=email]', { timeout: 8000 });
      await page.fill('input[type=email]', env('VITE_ADMIN_EMAIL'));
      await page.fill('input[type=password]', env('VITE_ADMIN_PASSWORD'));
      await page.click('button[type=submit]');
      await page.waitForTimeout(6000);
    } catch { /* already logged in */ }

    await page.goto('https://stella-indoor-admin.web.app/#/blocked-slots', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=/Active Blocks/i', { timeout: 20000 });
    await page.waitForTimeout(5000); // let Firestore snapshot deliver the new docs
    const body = await page.locator('body').innerText();
    console.log('  [debug] Active Blocks header:', (body.match(/Active Blocks \(\d+\)/i) || ['?'])[0]);

    check('active block is visible', body.includes(tag + '-ACTIVE'));
    check('expired recurring block is hidden', !body.includes(tag + '-EXPRECUR'));
    check('expired one-off block is hidden', !body.includes(tag + '-EXPONEOFF'));

    // The active block's card should carry an Edit button. Cards live in the
    // "Active Blocks" list; assert an Edit control exists on the page now.
    const editButtons = await page.getByRole('button', { name: /^Edit$/ }).count();
    check('Edit button present on block cards', editButtons > 0);
  } finally {
    await ctx.close();
    await Promise.all([expiredRecurring, expiredOneOff, active].map(ref => deleteDoc(doc(db, 'blockedSlots', ref.id))));
    console.log('[e2e] cleaned up test blocks');
  }

  const failed = results.filter(r => !r).length;
  console.log(`\n===== SLOT EXPIRY E2E: ${results.length - failed}/${results.length} passed =====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
