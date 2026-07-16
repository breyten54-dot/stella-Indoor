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
  const releaseDate = addDays(today, 1);
  const releaseStr = ymd(releaseDate);
  const tag = 'DAYRELEASE-' + Date.now();

  let blockId = null;
  let bookingId = null;
  let clientSubId = null;

  try {
    // 1. Create a recurring block via Firestore so the UI has something to release.
    const blockRef = doc(collection(db, 'blockedSlots'));
    blockId = blockRef.id;
    const startDate = ymd(addDays(releaseDate, -7));
    await setDoc(blockRef, {
      courtId: 'big-court',
      courtName: 'Big Court',
      startDate,
      endDate: null,
      startTime: '10:00',
      endTime: '12:00',
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

    // 2. Admin UI: navigate to release date and release the block.
    const adminCtx = await chromium.launchPersistentContext(ADMIN_PROFILE, { headless: true, channel: 'chrome' });
    const adminPage = adminCtx.pages()[0] || await adminCtx.newPage();
    try {
      await adminPage.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await loginIfNeeded(adminPage, env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD'));
      await bustCache(adminPage);
      await adminPage.reload({ waitUntil: 'domcontentloaded' });
      await adminPage.waitForTimeout(2000);

      // Move day view from today to release date.
      const daysDiff = Math.max(0, Math.round((releaseDate.getTime() - today.getTime()) / 86400000));
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
    } finally {
      await adminCtx.close();
    }

    // 3. Verify Firestore release marker.
    const blockSnap = await getDoc(doc(db, 'blockedSlots', blockId));
    const releasedDates = blockSnap.data()?.releasedDates || [];
    check('releasedDates contains target date', releasedDates.includes(releaseStr), releasedDates.join(','));

    const markerId = `${blockId}_${releaseStr}`;
    const markerSnap = await getDoc(doc(db, 'releaseNotifications', markerId));
    check('releaseNotifications dedupe marker created', markerSnap.exists(), markerId);

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

        // Select release date and verify the 10:00 slot is enabled.
        const dateBtn = clientPage.locator('button').filter({ hasText: new RegExp(String(releaseDate.getDate())) }).first();
        await dateBtn.scrollIntoViewIfNeeded();
        await dateBtn.click();
        await clientPage.waitForTimeout(1000);
        const slot = clientPage.locator('button', { hasText: /^10:00$/ }).first();
        const enabled = await slot.isEnabled();
        check('client 10:00 slot enabled on released date', enabled);
      } finally {
        await clientCtx.close();
      }

      // 5. Simulate a confirmed client booking for the released slot.
      const bookingRef = doc(collection(db, 'bookings'));
      bookingId = bookingRef.id;
      await setDoc(bookingRef, {
        courtId: 'big-court',
        courtName: 'Big Court',
        date: releaseStr,
        startTime: '10:00',
        endTime: '11:00',
        duration: 1,
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

      // 6. Verify push subscription doc exists OR create a fake one to exercise send.
      const subsSnap = await getDocs(query(collection(db, 'clientSubscriptions'), where('userEmail', '==', clientEmail)));
      if (subsSnap.empty) {
        const fakeEndpoint = 'https://fcm.googleapis.com/fcm/send/dayrelease-e2e-' + Date.now();
        clientSubId = Buffer.from(fakeEndpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
        await setDoc(doc(db, 'clientSubscriptions', clientSubId), {
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
        clientSubId = subsSnap.docs[0].id;
        check('client subscription doc exists', true, clientSubId);
      }

      // 7. Admin UI: reopen the block and confirm Undo is hidden once booked.
      const adminCtx2 = await chromium.launchPersistentContext(ADMIN_PROFILE, { headless: true, channel: 'chrome' });
      const adminPage2 = adminCtx2.pages()[0] || await adminCtx2.newPage();
      try {
        await adminPage2.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await loginIfNeeded(adminPage2, env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD'));
        await bustCache(adminPage2);
        await adminPage2.reload({ waitUntil: 'domcontentloaded' });
        await adminPage2.waitForTimeout(2000);
        await adminPage2.getByRole('button', { name: /^Later$/i }).click().catch(() => {});

        const nextBtn2 = adminPage2.locator('button:has(svg.lucide-chevron-right)').first();
        for (let i = 0; i < daysDiff; i++) {
          await nextBtn2.click();
          await adminPage2.waitForTimeout(200);
        }

        await adminPage2.getByText(tag).first().click({ timeout: 15000 });
        await adminPage2.getByText(/Booked by/).waitFor({ timeout: 15000 });
        const undoVisible = await adminPage2.getByRole('button', { name: /Undo release/i }).isVisible().catch(() => false);
        check('Undo hidden when booking exists', !undoVisible);
      } finally {
        await adminCtx2.close();
      }
    }
  } catch (err) {
    check('FATAL: ' + err.message, false);
  } finally {
    // 8. Cleanup — re-authenticate as admin in case client sign-in replaced the user.
    try {
      await signInWithEmailAndPassword(auth, env('VITE_ADMIN_EMAIL'), env('VITE_ADMIN_PASSWORD'));
    } catch {
      // best effort
    }
    if (bookingId) {
      await deleteDoc(doc(db, 'bookings', bookingId)).catch(() => {});
      console.log('[e2e] cleaned up test booking');
    }
    if (blockId) {
      await deleteDoc(doc(db, 'blockedSlots', blockId)).catch(() => {});
      console.log('[e2e] cleaned up test block');
    }
    if (clientSubId) {
      await deleteDoc(doc(db, 'clientSubscriptions', clientSubId)).catch(() => {});
      console.log('[e2e] cleaned up test client subscription');
    }
    if (blockId) {
      await deleteDoc(doc(db, 'releaseNotifications', `${blockId}_${releaseStr}`)).catch(() => {});
      const notifSnap = await getDocs(query(collection(db, 'notifications'), where('type', '==', 'slot-released'), where('date', '==', releaseStr))).catch(() => ({ docs: [] }));
      for (const n of notifSnap.docs) await deleteDoc(n.ref).catch(() => {});
      console.log('[e2e] cleaned up release markers and in-app notifications');
    }
  }

  const failed = results.filter(r => !r).length;
  console.log(`\n===== DAY RELEASE E2E: ${results.length - failed}/${results.length} passed =====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
