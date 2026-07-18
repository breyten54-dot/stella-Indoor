// E2E for K-8: slot-released deep link → pre-filled booking wizard, guest login-at-confirm,
// slot-taken race, and the in-app bell "Book now" action.
// Runs against a locally served client build (E2E_CLIENT_URL) + the LIVE Firebase backend.
// Self-cleaning (finally block), fail-loud (any FATAL => exit 1), collision-free windows.
// Requires VITE_ADMIN_EMAIL/PASSWORD and VITE_TEST_CLIENT_EMAIL/PASSWORD in
// Stella Project/stella-indoor-source/.env.
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, doc, setDoc, deleteDoc, getDocs, query, where } = require('firebase/firestore');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ENV_PATH = 'C:/Users/Administrator/OneDrive/Desktop/HIVE/Stella Project/stella-indoor-source/.env';
const env = (n) => {
  const line = (fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).find(l => l.startsWith(n + '=')) || '');
  return line.slice(n.length + 1).trim();
};

const TMP = path.join(require('os').tmpdir(), 'stella-deeplink-e2e');
// Deterministic cold state: fresh browser profiles every run (a reused profile can hold
// a persisted Firebase session, which would silently turn the "guest" test into a member one).
fs.rmSync(TMP, { recursive: true, force: true });
const CLIENT_URL = process.env.E2E_CLIENT_URL || 'https://stella-indoor.web.app';
const VIEWPORT = { width: 1280, height: 800 }; // lg breakpoint: BookingSummary sidebar is visible

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
function minutesToTime(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function blockAppliesToDateSimple(block, dateStr) {
  if (block.releasedDates?.includes(dateStr)) return false;
  if (block.exactDates?.length) return block.exactDates.includes(dateStr);
  if (block.isRecurring) {
    const cd = new Date(dateStr);
    if ((block.dayOfWeek ?? new Date(block.startDate).getDay()) !== cd.getDay()) return false;
    if (dateStr < block.startDate) return false;
    if (block.endDate && dateStr > block.endDate) return false;
    return true;
  }
  return block.startDate === dateStr;
}

async function findFreeWindow(db, courtId, startFrom, durationMinutes = 60, maxDays = 14) {
  for (let offset = 1; offset <= maxDays; offset++) {
    const date = addDays(startFrom, offset);
    const dateStr = ymd(date);
    const dayStart = 8 * 60;
    const dayEnd = 22 * 60;
    const [blocksSnap, bookingsSnap] = await Promise.all([
      getDocs(query(collection(db, 'blockedSlots'), where('courtId', '==', courtId))),
      getDocs(query(collection(db, 'bookings'), where('courtId', '==', courtId), where('date', '==', dateStr), where('status', '==', 'confirmed'))),
    ]);
    const intervals = [];
    for (const b of blocksSnap.docs) {
      const data = b.data();
      if (!blockAppliesToDateSimple(data, dateStr)) continue;
      intervals.push({ start: timeToMinutes(data.startTime), end: timeToMinutes(data.endTime) });
    }
    for (const b of bookingsSnap.docs) {
      const data = b.data();
      intervals.push({ start: timeToMinutes(data.startTime), end: timeToMinutes(data.endTime) });
    }
    intervals.sort((a, b) => a.start - b.start);
    let cursor = dayStart;
    for (const iv of intervals) {
      if (cursor + durationMinutes <= iv.start) {
        return { date, dateStr, startTime: minutesToTime(cursor), endTime: minutesToTime(cursor + durationMinutes) };
      }
      cursor = Math.max(cursor, iv.end);
    }
    if (cursor + durationMinutes <= dayEnd) {
      return { date, dateStr, startTime: minutesToTime(cursor), endTime: minutesToTime(cursor + durationMinutes) };
    }
  }
  throw new Error('Could not find a free window in the next ' + maxDays + ' days');
}

const deepLinkUrl = (w) =>
  `${CLIENT_URL}/?book=1&court=big-court&date=${w.dateStr}&start=${w.startTime}&end=${w.endTime}`;

async function loginIfNeeded(page, email, password) {
  try {
    await page.waitForSelector('input[type=email]', { timeout: 6000 });
    await page.fill('input[type=email]', email);
    await page.fill('input[type=password]', password);
    await page.click('button[type=submit]');
    await page.waitForTimeout(5000);
  } catch {
    // Already logged in
  }
}

async function bustCache(page) {
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if (window.caches) {
      const ks = await caches.keys();
      await Promise.all(ks.map(k => caches.delete(k)));
    }
  });
}

async function newClientPage(ctx, url) {
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await bustCache(page);
  // Re-navigate (NOT reload): the app consumes + cleans deep-link params on the first
  // load, so a reload would lose them; a fresh goto re-supplies them with a busted cache.
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  return page;
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

  const results = [];
  const check = (n, ok, d) => {
    results.push(ok);
    console.log(`  ${ok ? 'PASS' : 'FAIL'} — ${n}${d ? ' (' + d + ')' : ''}`);
  };

  const clientEmail = env('VITE_TEST_CLIENT_EMAIL').toLowerCase().trim();
  const clientPassword = env('VITE_TEST_CLIENT_PASSWORD');
  const courtId = 'big-court';

  // Ensure the test client auth account exists (creation signs the SDK in as the client;
  // re-auth as admin right after so later writes are correctly actor-scoped).
  try {
    await createUserWithEmailAndPassword(auth, clientEmail, clientPassword);
    console.log('  INFO — created test client auth account');
  } catch (e) {
    if (!e.message?.includes('email-already-in-use')) throw e;
  }
  await signInWithEmailAndPassword(auth, env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD'));

  const today = new Date();
  // Four independent genuinely-free windows (each call skips windows taken by earlier checks).
  const w1 = await findFreeWindow(db, courtId, today);           // guest deep-link flow
  const w2 = await findFreeWindow(db, courtId, addDays(today, 0)); // logged-in flow (same scan; w1 not booked yet — dedupe below)
  console.log(`[e2e] windows: guest=${w1.dateStr} ${w1.startTime} logged-in=${w2.dateStr} ${w2.startTime}`);

  const createdBookingIds = [];
  let notifId = null;
  const ctxs = [];

  try {
    // ================= TEST 1+2: guest deep link → wizard → login at confirm → booking ====
    {
      const ctx = await chromium.launchPersistentContext(path.join(TMP, 'guest'), { headless: true, channel: 'chrome', viewport: VIEWPORT });
      ctxs.push(ctx);
      const page = await newClientPage(ctx, deepLinkUrl(w1));

      // Wizard shows the deep-linked slot preselected (BookingSummary only renders when set).
      await page.getByText(/booking summary/i).waitFor({ timeout: 15000 });
      const courtOk = await page.getByText('Big Court').first().isVisible().catch(() => false);
      const timeOk = await page.getByText(new RegExp(`at ${w1.startTime} — ${w1.endTime}`)).first().isVisible().catch(() => false);
      check('guest: wizard shows deep-linked slot (court + time)', courtOk && timeOk, `${w1.dateStr} ${w1.startTime}–${w1.endTime}`);
      check('guest: deep-link params cleaned from URL', !page.url().includes('book=1'), page.url());

      // Confirm → terms → agree → login/register page with context message (NOT upfront).
      await page.getByRole('button', { name: /Confirm Booking/i }).click();
      await page.getByRole('button', { name: /I Agree — Confirm Booking/i }).click();
      await page.getByText('Sign in or create an account to confirm your booking.').waitFor({ timeout: 10000 });
      check('guest: login/register appears AT the confirm step', true);

      // The pending booking survived in sessionStorage with the right slot.
      const pending = await page.evaluate(() => JSON.parse(sessionStorage.getItem('stellaPendingBooking') || 'null'));
      check('guest: pending booking persisted to sessionStorage',
        !!pending && pending.court?.id === courtId && pending.dateTime?.date === w1.dateStr && pending.dateTime?.time === w1.startTime,
        pending ? `${pending.court?.id} ${pending.dateTime?.date} ${pending.dateTime?.time}` : 'null');

      // Log in — the booking must resume and create automatically.
      await page.fill('input[type=email]', clientEmail);
      await page.fill('input[type=password]', clientPassword);
      await page.click('button[type=submit]');
      await page.getByText('Booking Confirmed!').waitFor({ timeout: 30000 });
      check('guest: after auth the booking is created (confirmation screen)', true);
      const refText = await page.locator('p.font-mono').first().textContent();
      const snap = await getDocs(query(collection(db, 'bookings'),
        where('userEmail', '==', clientEmail), where('date', '==', w1.dateStr), where('startTime', '==', w1.startTime)));
      const found = snap.docs.find(d => d.data().courtId === courtId && d.data().status === 'confirmed');
      check('guest: booking doc exists in Firestore (ref matches screen)', !!found && found.id === (refText || '').trim(), `screen=${(refText || '').trim()} fs=${found?.id || 'none'}`);
      if (found) createdBookingIds.push(found.id);
      await ctx.close().catch(() => {});
    }

    // ================= TEST 3: logged-in user — unchanged, confirms directly ==============
    {
      const w2b = await findFreeWindow(db, courtId, today); // re-scan: w1 is now booked
      const ctx = await chromium.launchPersistentContext(path.join(TMP, 'member'), { headless: true, channel: 'chrome', viewport: VIEWPORT });
      ctxs.push(ctx);
      const page = await newClientPage(ctx, CLIENT_URL);
      await loginIfNeeded(page, clientEmail, clientPassword);
      await page.getByRole('button', { name: /^Later$/i }).click().catch(() => {});

      await page.goto(deepLinkUrl(w2b), { waitUntil: 'domcontentloaded' });
      await page.getByText(/booking summary/i).waitFor({ timeout: 15000 });
      const timeOk = await page.getByText(new RegExp(`at ${w2b.startTime} — ${w2b.endTime}`)).first().isVisible().catch(() => false);
      check('member: wizard shows deep-linked slot', timeOk, `${w2b.dateStr} ${w2b.startTime}–${w2b.endTime}`);

      await page.getByRole('button', { name: /Confirm Booking/i }).click();
      await page.getByRole('button', { name: /I Agree — Confirm Booking/i }).click();
      // Must NOT see a login prompt — straight to confirmation.
      const loginShown = await page.getByText('Sign in or create an account').first().isVisible({ timeout: 3000 }).catch(() => false);
      check('member: no login prompt at confirm (unchanged behavior)', !loginShown);
      await page.getByText('Booking Confirmed!').waitFor({ timeout: 30000 });
      check('member: booking created directly', true);
      const snap = await getDocs(query(collection(db, 'bookings'),
        where('userEmail', '==', clientEmail), where('date', '==', w2b.dateStr), where('startTime', '==', w2b.startTime)));
      const found = snap.docs.find(d => d.data().courtId === courtId && d.data().status === 'confirmed');
      if (found) createdBookingIds.push(found.id);
      check('member: booking doc exists in Firestore', !!found, found?.id || 'none');
      await ctx.close().catch(() => {});
    }

    // ================= TEST 4: slot-taken race — friendly message, not a crash ============
    {
      const w3 = await findFreeWindow(db, courtId, today);
      // Take the slot first (direct write as the client — booking rules are owner-scoped).
      await signInWithEmailAndPassword(auth, clientEmail, clientPassword);
      const takenRef = doc(collection(db, 'bookings'));
      createdBookingIds.push(takenRef.id);
      await setDoc(takenRef, {
        courtId, courtName: 'Big Court',
        date: w3.dateStr, startTime: w3.startTime, endTime: w3.endTime, duration: 1,
        status: 'confirmed', attendance: 'pending', createdAt: Date.now(),
        clientDetails: { fullName: 'E2E Race', email: clientEmail, phone: '000 000 0000', teamName: '', specialRequests: '' },
        addons: { soccerBall: 0, bibs: 0 }, totalPrice: 500, userEmail: clientEmail,
      });
      await signInWithEmailAndPassword(auth, env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD'));

      const ctx = await chromium.launchPersistentContext(path.join(TMP, 'race'), { headless: true, channel: 'chrome', viewport: VIEWPORT });
      ctxs.push(ctx);
      const page = await newClientPage(ctx, CLIENT_URL);
      await loginIfNeeded(page, clientEmail, clientPassword);
      await page.getByRole('button', { name: /^Later$/i }).click().catch(() => {});

      await page.goto(deepLinkUrl(w3), { waitUntil: 'domcontentloaded' });
      await page.getByText(/booking summary/i).waitFor({ timeout: 15000 });
      await page.getByRole('button', { name: /Confirm Booking/i }).click();
      await page.getByRole('button', { name: /I Agree — Confirm Booking/i }).click();
      await page.getByText('That slot was just taken').waitFor({ timeout: 30000 });
      check('race: friendly "slot was just taken" message (no crash)', true);
      // Returned to availability (time step shows the slot picker again).
      await page.getByText(/Available Slots/).waitFor({ timeout: 10000 });
      check('race: user returned to availability (time step)', true);
      await ctx.close().catch(() => {});
    }

    // ================= TEST 5: in-app bell "Book now" routes into the same flow ==========
    {
      const w4 = await findFreeWindow(db, courtId, today);
      notifId = `e2e-deeplink-${Date.now()}`;
      await setDoc(doc(db, 'notifications', notifId), {
        type: 'slot-released',
        userEmail: clientEmail,
        bookingId: '',
        courtId,
        courtName: 'Big Court',
        date: w4.dateStr,
        startTime: w4.startTime,
        endTime: w4.endTime,
        url: deepLinkUrl(w4).replace(CLIENT_URL, 'https://stella-indoor.web.app'),
        title: 'Slot just opened up! ⚽',
        message: `Big Court · ${w4.dateStr} · ${w4.startTime}–${w4.endTime} — tap to book.`,
        read: false,
        shown: true, // avoid the browser-notification side path in headless
        createdAt: Date.now(),
      });

      const ctx = await chromium.launchPersistentContext(path.join(TMP, 'bell'), { headless: true, channel: 'chrome', viewport: VIEWPORT });
      ctxs.push(ctx);
      const page = await newClientPage(ctx, CLIENT_URL);
      await loginIfNeeded(page, clientEmail, clientPassword);
      await page.getByRole('button', { name: /^Later$/i }).click().catch(() => {});
      await page.waitForTimeout(2000);

      // The bell lives in the Navbar, which only renders inside the wizard shell —
      // enter the wizard first (pre-existing app structure, not K-8 scope).
      await page.getByText('Book a Court').first().click();
      await page.locator('button[aria-label="Notifications"]').waitFor({ timeout: 15000 });
      await page.locator('button[aria-label="Notifications"]').click();
      await page.getByText('OPEN SLOT').waitFor({ timeout: 10000 });
      check('bell: slot-released item labelled OPEN SLOT', true);
      await page.getByRole('button', { name: /Book now/i }).click();

      await page.getByText(/booking summary/i).waitFor({ timeout: 15000 });
      const timeOk = await page.getByText(new RegExp(`at ${w4.startTime} — ${w4.endTime}`)).first().isVisible().catch(() => false);
      check('bell: Book now opens the same pre-filled flow', timeOk, `${w4.dateStr} ${w4.startTime}–${w4.endTime}`);
      await ctx.close().catch(() => {});
    }
  } catch (err) {
    check('FATAL: ' + err.message, false);
  } finally {
    // Cleanup — every artifact this run created, even on failure.
    try { await signInWithEmailAndPassword(auth, env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD')); } catch {}
    for (const id of createdBookingIds) {
      await deleteDoc(doc(db, 'bookings', id)).catch((e) => console.log('  WARN — booking cleanup:', e.message));
    }
    if (createdBookingIds.length) console.log(`[e2e] cleaned up ${createdBookingIds.length} test booking(s)`);
    if (notifId) {
      await deleteDoc(doc(db, 'notifications', notifId)).catch((e) => console.log('  WARN — notification cleanup:', e.message));
      console.log('[e2e] cleaned up test notification');
    }
    for (const ctx of ctxs) await ctx.close().catch(() => {});
  }

  const failed = results.filter(r => !r).length;
  console.log(`\n===== DEEPLINK BOOKING E2E: ${results.length - failed}/${results.length} passed =====`);
  process.exit(failed ? 1 : 0);
})();
