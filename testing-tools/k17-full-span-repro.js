// K-17 full-span release verifier (PERMANENT — keep in testing-tools):
// Create a 14:00–16:00 Sunday block (same shape as the UI writes), release NEXT
// Sunday via the admin UI, and verify every layer of the "release must open the
// full span" requirement:
//   - admin calendar ghost markers on BOTH hour cells (14:00 and 15:00)
//   - notification announces the full 14:00–16:00 span (+ deep link)
//   - client: BOTH 14:00 and 15:00 slots bookable on the released date
//   - Undo re-blocks the whole span; re-release does NOT re-notify (marker dedupe)
// Self-cleaning (block, marker, tagged notification docs).
// Run: serve dist-admin on :3301 and dist on :3302 (local-static-server.js), then
//   node testing-tools/k17-full-span-repro.js
// Requires VITE_ADMIN_EMAIL/PASSWORD and VITE_TEST_CLIENT_EMAIL/PASSWORD in
// Stella Project/stella-indoor-source/.env.
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, doc, setDoc, deleteDoc, getDoc, getDocs, query, where } = require('firebase/firestore');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ENV_PATH = 'C:/Users/Administrator/OneDrive/Desktop/HIVE/Stella Project/stella-indoor-source/.env';
const env = (n) => (fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).find(l => l.startsWith(n + '=')) || '').slice(n.length + 1).trim();
const ADMIN_URL = process.env.E2E_ADMIN_URL || 'http://localhost:3301/#/calendar';
const CLIENT_URL = process.env.E2E_CLIENT_URL || 'http://localhost:3302';
const TMP = path.join(require('os').tmpdir(), 'stella-k17-repro');
fs.rmSync(TMP, { recursive: true, force: true });

const results = [];
const check = (n, ok, d) => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} — ${n}${d ? ' (' + d + ')' : ''}`);
};

// Next Sunday from a fixed base (written 2026-07-19, a Sunday → target 2026-07-26).
const TARGET = '2026-07-26';
const TAG = 'K17-REPRO-TEST';
let blockId = null;

async function login(page, email, password) {
  await page.waitForSelector('input[type=email]', { timeout: 15000 });
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.click('button[type=submit]');
}

(async () => {
  const app = initializeApp({
    apiKey: env('VITE_FIREBASE_API_KEY'),
    authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: env('VITE_FIREBASE_PROJECT_ID'),
  });
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD'));

  const ctxs = [];
  try {
    // 1. Create the 2h Sunday block (same doc shape as the UI writes).
    blockId = doc(collection(db, 'blockedSlots')).id;
    await setDoc(doc(db, 'blockedSlots', blockId), {
      courtId: 'big-court', courtName: 'Big Court',
      startDate: '2026-07-05', endDate: null,
      startTime: '14:00', endTime: '16:00',
      type: 'block-booking', clientName: TAG,
      isRecurring: true, intervalWeeks: 1, dayOfWeek: 0,
      releasedDates: [], createdAt: Date.now(), createdBy: env('VITE_ADMIN_EMAIL'),
    });
    console.log(`[repro] created 14:00–16:00 Sunday block ${blockId} (ONE doc)`);

    // 2. Admin UI: navigate to TARGET Sunday, click the block, release it.
    const adminCtx = await chromium.launchPersistentContext(path.join(TMP, 'admin'), { headless: true, channel: 'chrome' });
    ctxs.push(adminCtx);
    const adminPage = adminCtx.pages()[0] || await adminCtx.newPage();
    await adminPage.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await login(adminPage, env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD'));
    await adminPage.waitForTimeout(5000);
    // Day view starts today (2026-07-19, Sunday) → +7 days to TARGET.
    const nextBtn = adminPage.locator('button:has(svg.lucide-chevron-right)').first();
    for (let i = 0; i < 7; i++) { await nextBtn.click(); await adminPage.waitForTimeout(250); }
    await adminPage.getByText(TAG).first().click({ timeout: 15000 });
    await adminPage.getByRole('button', { name: /Release for (today|this day)/i }).click();
    await adminPage.getByRole('button', { name: 'Confirm release' }).click();
    await adminPage.getByText(/Released for this day/).waitFor({ timeout: 15000 });
    check('admin UI released the 14:00–16:00 block for ' + TARGET, true);

    // 3. Ghost markers on BOTH covered hour cells (close modal first to see the grid).
    await adminPage.locator('h3:has-text("Details") + button').first().click().catch(() => {});
    await adminPage.waitForTimeout(1500);
    const ghostCount = await adminPage.locator('[data-testid="released-ghost"]').count();
    check('ghost markers render on BOTH hour cells (14:00 + 15:00)', ghostCount >= 2, `ghosts=${ghostCount}`);

    // 4. Firestore: releasedDates + dedupe marker (bounded poll for cold-start function).
    const blockSnap = await getDoc(doc(db, 'blockedSlots', blockId));
    check('releasedDates contains target', (blockSnap.data()?.releasedDates || []).includes(TARGET));
    let marker = false;
    const markerDeadline = Date.now() + 40000;
    while (Date.now() < markerDeadline) {
      const m = await getDoc(doc(db, 'releaseNotifications', `${blockId}_${TARGET}`));
      if (m.exists()) { marker = true; break; }
      await new Promise(r => setTimeout(r, 2000));
    }
    check('releaseNotifications dedupe marker created', marker, `${blockId}_${TARGET}`);

    // 5. Notification announces the FULL span + deep link (poll; blast to all users).
    let notif = null;
    const notifDeadline = Date.now() + 40000;
    while (Date.now() < notifDeadline) {
      const snap = await getDocs(query(collection(db, 'notifications'), where('type', '==', 'slot-released'), where('date', '==', TARGET)));
      const found = snap.docs.map(d => d.data()).find(n => n.message && n.message.includes('14:00'));
      if (found) { notif = found; break; }
      await new Promise(r => setTimeout(r, 2000));
    }
    check('notification announces the FULL 14:00–16:00 span', !!notif && /14:00–16:00/.test(notif.message), notif?.message || 'none');
    check('deep link carries start=14:00 end=16:00', !!notif && /start=14%3A00&end=16%3A00/.test(notif.url || ''), notif?.url || 'none');

    // 6. Client UI: BOTH 14:00 and 15:00 slots bookable on TARGET (the user's core complaint).
    const clientCtx = await chromium.launchPersistentContext(path.join(TMP, 'client'), { headless: true, channel: 'chrome' });
    ctxs.push(clientCtx);
    const clientPage = clientCtx.pages()[0] || await clientCtx.newPage();
    await clientPage.goto(CLIENT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await login(clientPage, env('VITE_TEST_CLIENT_EMAIL'), env('VITE_TEST_CLIENT_PASSWORD'));
    await clientPage.waitForTimeout(5000);
    await clientPage.getByRole('button', { name: /^Later$/i }).click().catch(() => {});
    await clientPage.getByText('Book a Court').first().click();
    await clientPage.waitForTimeout(500);
    await clientPage.getByRole('button', { name: /^Select$/ }).first().click(); // Big Court
    await clientPage.waitForTimeout(500);
    await clientPage.getByRole('button', { name: /^Continue$/i }).click();
    await clientPage.waitForTimeout(500);
    // Pick TARGET date in the date scroller (26 = next Sunday).
    const dateBtn = clientPage.locator('span.text-xl.font-bold.tab-nums').filter({ hasText: /^26$/ }).first();
    await dateBtn.scrollIntoViewIfNeeded();
    await dateBtn.click();
    await clientPage.waitForTimeout(2000);
    const slot1400 = clientPage.locator('button').filter({ hasText: /^14:00$/ }).first();
    const slot1500 = clientPage.locator('button').filter({ hasText: /^15:00$/ }).first();
    // Settle-wait: slots render disabled while availability loads (#18).
    const settle = Date.now() + 30000;
    while (Date.now() < settle) {
      const anyEnabled = await clientPage.locator('button').filter({ hasText: /^[0-9]{2}:[0-9]{2}$/ }).first().isEnabled().catch(() => false);
      if (anyEnabled) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    const s14 = await slot1400.isEnabled().catch(() => false);
    const s15 = await slot1500.isEnabled().catch(() => false);
    check('client: 14:00 slot bookable on released date', s14);
    check('client: 15:00 slot ALSO bookable (the full span opened, not one hour)', s15);

    // 7. Undo via admin UI → the whole span re-blocks. A released block no longer
    // renders its client name — click the ghost LABEL (the only pointer-events-auto
    // part of the ghost; the container testid is pointer-events-none).
    await adminPage.getByText(/Released · open/i).first().click({ timeout: 15000 });
    await adminPage.getByRole('button', { name: /Undo release/i }).click();
    await adminPage.getByRole('button', { name: /Confirm/i }).click().catch(() => {});
    await adminPage.waitForTimeout(2500);
    const afterUndo = await getDoc(doc(db, 'blockedSlots', blockId));
    check('undo removes the released date (whole span re-blocked)', !(afterUndo.data()?.releasedDates || []).includes(TARGET));

    // 8. Re-release → NO second notification (marker dedupe holds). Close the undo
    // modal first so the solid block (client name back) is clickable again.
    await adminPage.locator('h3:has-text("Details") + button').first().click().catch(() => {});
    await adminPage.waitForTimeout(1500);
    await adminPage.getByText(TAG).first().click({ timeout: 15000 });
    await adminPage.getByRole('button', { name: /Release for (today|this day)/i }).click();
    await adminPage.getByRole('button', { name: 'Confirm release' }).click();
    await adminPage.waitForTimeout(6000);
    const notifCountSnap = await getDocs(query(collection(db, 'notifications'), where('type', '==', 'slot-released'), where('date', '==', TARGET)));
    const perUser = new Map();
    notifCountSnap.docs.forEach(d => { const n = d.data(); perUser.set(n.userEmail, (perUser.get(n.userEmail) || 0) + 1); });
    const dupes = [...perUser.values()].filter(c => c > 1).length;
    check('re-release after undo does NOT duplicate notifications (dedupe holds)', dupes === 0, `${perUser.size} users, max ${Math.max(0, ...perUser.values())} notif/user`);
  } catch (err) {
    check('FATAL: ' + err.message.split('\n')[0], false);
  } finally {
    // Cleanup: block, marker, and the tagged notification docs for TARGET.
    try { await signInWithEmailAndPassword(auth, env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD')); } catch {}
    if (blockId) {
      await deleteDoc(doc(db, 'blockedSlots', blockId)).catch(() => {});
      await deleteDoc(doc(db, 'releaseNotifications', `${blockId}_${TARGET}`)).catch(() => {});
      const snap = await getDocs(query(collection(db, 'notifications'), where('type', '==', 'slot-released'), where('date', '==', TARGET)));
      for (const d of snap.docs) {
        if (d.id.includes(blockId)) await deleteDoc(d.ref).catch(() => {});
      }
      console.log('[repro] cleaned up block, marker, tagged notifications');
    }
    for (const c of ctxs) await c.close().catch(() => {});
  }

  const failed = results.filter(r => !r).length;
  console.log(`\n===== K-17 FULL-SPAN REPRO: ${results.length - failed}/${results.length} passed =====`);
  process.exit(failed ? 1 : 0);
})();
