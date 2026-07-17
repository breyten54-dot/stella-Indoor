// E2E: block-booking day release + client Web Push subscription + release blast.
// Self-cleaning. Uses the LIVE Firebase project and deployed apps.
// Requires VITE_ADMIN_EMAIL/PASSWORD and VITE_TEST_CLIENT_EMAIL/PASSWORD in
// Stella Project/stella-indoor-source/.env.
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, doc, setDoc, deleteDoc, getDoc, query, where, getDocs } = require('firebase/firestore');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ENV_PATH = 'C:/Users/Administrator/OneDrive/Desktop/HIVE/Stella Project/stella-indoor-source/.env';
const env = (n) => {
  const line = (fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).find(l => l.startsWith(n + '=')) || '');
  return line.slice(n.length + 1).trim();
};

const TMP = path.join(require('os').tmpdir(), 'stella-dayrelease-e2e');
const ADMIN_URL = (process.env.E2E_ADMIN_URL || 'https://stella-indoor-admin.web.app/#/calendar') + (process.env.E2E_ADMIN_URL ? '' : '');
const CLIENT_URL = process.env.E2E_CLIENT_URL || 'https://stella-indoor.web.app';
const ADMIN_PROFILE = path.join(TMP, 'admin-profile');
const CLIENT_PROFILE = path.join(TMP, 'client-profile');

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

// Simple recurrence check (released dates are treated as not blocking).
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
    const dayOfWeek = date.getDay();
    const isSunday = dayOfWeek === 0;
    const hours = isSunday ? { start: 8, end: 22 } : { start: 8, end: 22 };
    const dayStart = hours.start * 60;
    const dayEnd = hours.end * 60;

    const [blocksSnap, bookingsSnap] = await Promise.all([
      getDocs(query(collection(db, 'blockedSlots'), where('courtId', '==', courtId))),
      getDocs(query(
        collection(db, 'bookings'),
        where('courtId', '==', courtId),
        where('date', '==', dateStr),
        where('status', '==', 'confirmed')
      )),
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

async function ensureAdminAuth(auth) {
  try {
    await signInWithEmailAndPassword(auth, env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD'));
    await auth.authStateReady();
  } catch (err) {
    console.log('  WARN — admin re-auth failed:', err.message);
  }
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

  const today = new Date();
  const courtId = 'big-court';
  const courtName = 'Big Court';
  const probeDuration = 60; // minutes
  const { date: releaseDate, dateStr: releaseStr, startTime: probeStart, endTime: probeEnd } =
    await findFreeWindow(db, courtId, today, probeDuration);
  console.log(`[e2e] probe window: ${courtName} ${releaseStr} ${probeStart}–${probeEnd}`);
  const daysDiff = Math.max(0, Math.round((releaseDate.getTime() - today.getTime()) / 86400000));
  const tag = 'DAYRELEASE-' + Date.now();

  let blockId = null;
  let bookingId = null;
  let fakeSubId = null;
  let adminCtx = null;

  try {
    // 1. Create a recurring block via Firestore so the UI has something to release.
    const blockRef = doc(collection(db, 'blockedSlots'));
    blockId = blockRef.id;
    const startDate = ymd(addDays(releaseDate, -7));
    await setDoc(blockRef, {
      courtId,
      courtName,
      startDate,
      endDate: null,
      startTime: probeStart,
      endTime: probeEnd,
      type: 'block-booking',
      clientName: tag,
      isRecurring: true,
      intervalWeeks: 1,
      dayOfWeek: releaseDate.getDay(),
      releasedDates: [],
      createdAt: Date.now(),
      createdBy: env('VITE_ADMIN_EMAIL'),
    });
    check('created recurring block in Firestore', true, `id=${blockId}`);

    // 2. Admin UI: navigate to release date, open the block, and release it.
    //    Keep this context open so the same modal can later be observed after a
    //    simulated client booking is created.
    adminCtx = await chromium.launchPersistentContext(ADMIN_PROFILE, { headless: true, channel: 'chrome' });
    const adminPage = adminCtx.pages()[0] || await adminCtx.newPage();
    try {
      await adminPage.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await loginIfNeeded(adminPage, env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD'));
      await bustCache(adminPage);
      await adminPage.reload({ waitUntil: 'domcontentloaded' });
      await adminPage.waitForTimeout(2000);

      // Move day view from today to release date.
      const nextBtn = adminPage.locator('button:has(svg.lucide-chevron-right)').first();
      for (let i = 0; i < daysDiff; i++) {
        await nextBtn.click();
        await adminPage.waitForTimeout(200);
      }

      // Click the block cell by its unique client tag and release it.
      await adminPage.getByText(tag).first().click({ timeout: 15000 });
      await adminPage.getByRole('button', { name: /Release for (today|this day)/i }).click();
      await adminPage.getByRole('button', { name: 'Confirm release' }).click();
      await adminPage.waitForTimeout(2000);
      await adminPage.getByText(/Released for this day/).waitFor({ timeout: 15000 });
      check('admin UI released the slot', true);

      // 2b. Close the modal, then verify the released cell shows a ghost marker
      //    that can be tapped to reopen the block card with the Undo button.
      await adminPage.locator('h3:has-text("Details") + button').first().click();
      await adminPage.getByRole('button', { name: /Undo release/i }).waitFor({ state: 'detached', timeout: 5000 });
      const ghostOpen = adminPage.locator('[data-testid="released-ghost"]').first();
      await ghostOpen.waitFor({ timeout: 15000 });
      await adminPage.getByText(/Released · open/i).waitFor({ timeout: 15000 });
      check('released ghost marker visible (open)', true);
      await adminPage.getByText(/Released · open/i).first().click();
      await adminPage.getByRole('button', { name: /Undo release/i }).waitFor({ timeout: 15000 });
      check('ghost tap reopens block card with Undo', true);
      // Close modal again to continue the release/booking flow.
      await adminPage.locator('h3:has-text("Details") + button').first().click();
      await adminPage.getByRole('button', { name: /Undo release/i }).waitFor({ state: 'detached', timeout: 5000 });
    } catch (err) {
      check('admin UI release flow', false, err.message);
      throw err;
    }

    // 3. Verify Firestore release marker.
    const blockSnap = await getDoc(doc(db, 'blockedSlots', blockId));
    const releasedDates = blockSnap.data()?.releasedDates || [];
    check('releasedDates contains target date', releasedDates.includes(releaseStr), releasedDates.join(','));

    const markerId = `${blockId}_${releaseStr}`;
    let markerFound = false;
    const markerDeadline = Date.now() + 30000;
    while (Date.now() < markerDeadline) {
      const markerSnap = await getDoc(doc(db, 'releaseNotifications', markerId));
      if (markerSnap.exists()) { markerFound = true; break; }
      await new Promise(r => setTimeout(r, 2000));
    }
    check('releaseNotifications dedupe marker created', markerFound, markerId);

    // 4. Client-side tests.
    const clientEmailRaw = env('VITE_TEST_CLIENT_EMAIL');
    const clientPassword = env('VITE_TEST_CLIENT_PASSWORD');
    if (!clientEmailRaw || !clientPassword) {
      console.log('  SKIP — VITE_TEST_CLIENT_EMAIL/PASSWORD not set; client/push tests skipped');
    } else {
      const clientEmail = clientEmailRaw.toLowerCase().trim();

      // Ensure a test client auth account exists.
      try {
        await createUserWithEmailAndPassword(auth, clientEmail, clientPassword);
        console.log('  INFO — created test client auth account');
      } catch (e) {
        if (!e.message?.includes('email-already-in-use')) throw e;
      }

      const clientCtx = await chromium.launchPersistentContext(CLIENT_PROFILE, { headless: true, channel: 'chrome' });
      await clientCtx.grantPermissions(['notifications']);
      const clientPage = clientCtx.pages()[0] || await clientCtx.newPage();
      try {
        await clientPage.goto(CLIENT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await loginIfNeeded(clientPage, clientEmail, clientPassword);
        await bustCache(clientPage);
        await clientPage.reload({ waitUntil: 'domcontentloaded' });
        await clientPage.waitForTimeout(3000);
        await clientPage.getByRole('button', { name: /^Later$/i }).click().catch(() => {});

        // BookingApp effect should have attempted push subscription after login.
        // The browser may not yield a real subscription in headless Playwright, so we
        // also create a fake one below to exercise the Cloud Function send path.
        await clientPage.getByText('Book a Court').first().click();
        await clientPage.waitForTimeout(500);

        // Select Big Court (first card in the list) and continue.
        await clientPage.getByRole('button', { name: /^Select$/ }).first().click();
        await clientPage.waitForTimeout(500);
        await clientPage.getByRole('button', { name: /^Continue$/i }).click();
        await clientPage.waitForTimeout(500);

        // Select release date and verify the chosen slot is enabled.
        const dateBtn = clientPage.locator('span.text-xl.font-bold.tab-nums').filter({ hasText: new RegExp(`^${releaseDate.getDate()}$`) }).first();
        await dateBtn.scrollIntoViewIfNeeded();
        await dateBtn.click();
        await clientPage.waitForTimeout(1000);

        // Precondition: the time-selection header must show the target date.
        const headerText = await clientPage.locator('span', { hasText: /Available Slots/ }).textContent();
        const datePattern = new RegExp(`${releaseDate.getDate()}.*${releaseDate.toLocaleDateString('en-ZA', { month: 'short' })}`);
        check('date header shows target date', datePattern.test(headerText || ''), headerText || '');

        const slot = clientPage.locator('button', { hasText: new RegExp(`^${probeStart}$`) }).first();

        // Settle-wait: the client availability check renders slots as disabled while
        // Firestore data loads. Poll until at least one time slot is enabled (signals
        // the check resolved), then assert the target slot.
        let slotEnabled = false;
        const slotDeadline = Date.now() + 30000;
        while (Date.now() < slotDeadline) {
          const anyEnabled = await clientPage.locator('button').filter({ hasText: /^[0-9]{2}:[0-9]{2}$/ }).first().isEnabled().catch(() => false);
          if (anyEnabled) {
            slotEnabled = await slot.isEnabled();
            break;
          }
          await new Promise(r => setTimeout(r, 1000));
        }
        check(`client ${probeStart} slot enabled on released date`, slotEnabled);
      } finally {
        await clientCtx.close();
      }

      // 5. Sign in as the client so any client-attributed Firestore writes use the right actor.
      await signInWithEmailAndPassword(auth, clientEmail, clientPassword);

      // 6. Verify push subscription doc exists OR create a fake one to exercise send.
      const subsSnap = await getDocs(query(collection(db, 'clientSubscriptions'), where('userEmail', '==', clientEmail)));
      const existingFake = subsSnap.docs.find(d => d.data().deviceInfo === 'day-release-e2e-fake');
      if (existingFake) {
        fakeSubId = existingFake.id;
        console.log('  INFO — reusing existing fake client subscription');
      } else if (subsSnap.empty) {
        const fakeEndpoint = 'https://fcm.googleapis.com/fcm/send/dayrelease-e2e-' + Date.now();
        fakeSubId = Buffer.from(fakeEndpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
        await setDoc(doc(db, 'clientSubscriptions', fakeSubId), {
          endpoint: fakeEndpoint,
          keys: { p256dh: 'dummy', auth: 'dummy' },
          userEmail: clientEmail,
          deviceInfo: 'day-release-e2e-fake',
          failures: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        console.log('  INFO — no real client subscription; created fake endpoint to exercise send path');
      } else {
        check('client subscription doc exists', true, subsSnap.docs[0].id);
      }

      // 7. Simulate a confirmed client booking for the released slot.
      // The booking rules require request.resource.data.userEmail == auth.token.email,
      // so this write must run as the client, not as admin.
      const bookingRef = doc(collection(db, 'bookings'));
      bookingId = bookingRef.id;
      const bookingEndMin = timeToMinutes(probeStart) + probeDuration;
      await setDoc(bookingRef, {
        courtId,
        courtName,
        date: releaseStr,
        startTime: probeStart,
        endTime: minutesToTime(bookingEndMin),
        duration: probeDuration / 60,
        status: 'confirmed',
        userEmail: clientEmail,
        clientDetails: {
          fullName: 'E2E Client',
          email: clientEmail,
          phone: '000 000 0000',
          teamName: '',
          specialRequests: '',
        },
        addons: { soccerBall: 0, bibs: 0 },
        totalPrice: 0,
        createdAt: Date.now(),
      });

      // 8. Clean up the fake subscription while still signed in as the client
      //    (clientSubscriptions are owner-scoped and cannot be deleted by admin).
      if (fakeSubId) {
        await deleteDoc(doc(db, 'clientSubscriptions', fakeSubId));
        console.log('  INFO — deleted fake client subscription');
        fakeSubId = null;
      }

      // 9. Sign back in as admin for any remaining server-side steps and cleanup.
      await ensureAdminAuth(auth);

      // 10. Admin UI: after the client booking, the released cell shows a ghost
      //    marker with "Released · booked". Tapping it reopens the block card
      //    showing "Booked by …" with the Undo button hidden.
      try {
        const ghostBooked = adminPage.locator('[data-testid="released-ghost"]').first();
        await ghostBooked.waitFor({ timeout: 15000 });
        await adminPage.getByText(/Released · booked/i).waitFor({ timeout: 15000 });
        check('released ghost marker visible (booked)', true);
        await adminPage.getByText(/Released · booked/i).first().click();
        await adminPage.getByText(/Booked by/).waitFor({ timeout: 15000 });
        const undoVisible = await adminPage.getByRole('button', { name: /Undo release/i }).isVisible({ timeout: 5000 }).catch(() => false);
        check('Undo hidden when booking exists', !undoVisible);
        check('ghost tap on booked day reopens block card', true);
      } catch (err) {
        check('admin UI reflects booking and hides Undo', false, err.message);
      }
    }
  } catch (err) {
    check('FATAL: ' + err.message, false);
  } finally {
    // 10. Cleanup — make sure we are authenticated as admin before deleting test data.
    await ensureAdminAuth(auth);

    if (bookingId) {
      await deleteDoc(doc(db, 'bookings', bookingId)).catch((e) => console.log('  WARN — booking cleanup:', e.message));
      console.log('[e2e] cleaned up test booking');
    }
    if (blockId) {
      await deleteDoc(doc(db, 'blockedSlots', blockId)).catch((e) => console.log('  WARN — block cleanup:', e.message));
      console.log('[e2e] cleaned up test block');
    }
    if (fakeSubId) {
      // If we are still holding a fake sub id, attempt to delete it as the client owner.
      try {
        await signInWithEmailAndPassword(auth, env('VITE_TEST_CLIENT_EMAIL'), env('VITE_TEST_CLIENT_PASSWORD'));
        await deleteDoc(doc(db, 'clientSubscriptions', fakeSubId));
        console.log('[e2e] cleaned up test client subscription (as client)');
      } catch (e) {
        console.log('  WARN — fake subscription cleanup:', e.message);
      }
    }
    if (blockId) {
      await deleteDoc(doc(db, 'releaseNotifications', `${blockId}_${releaseStr}`)).catch(() => {});
      const notifSnap = await getDocs(query(collection(db, 'notifications'), where('type', '==', 'slot-released'), where('date', '==', releaseStr))).catch(() => ({ docs: [] }));
      for (const n of notifSnap.docs) await deleteDoc(n.ref).catch(() => {});
      console.log('[e2e] cleaned up release markers and in-app notifications');
    }

    if (adminCtx) {
      await adminCtx.close().catch(() => {});
      console.log('[e2e] closed admin browser context');
    }
  }

  const failed = results.filter(r => !r).length;
  console.log(`\n===== DAY RELEASE E2E: ${results.length - failed}/${results.length} passed =====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
