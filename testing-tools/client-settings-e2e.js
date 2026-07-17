// E2E: client Settings menu — notifications enable + password change.
// Self-cleaning. Runs against the client app (local build or deployed).
// Requires VITE_TEST_CLIENT_EMAIL/PASSWORD in Stella Project/stella-indoor-source/.env.
const { initializeApp } = require('firebase/app');
const {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} = require('firebase/auth');
const { getFirestore, collection, query, where, getDocs, deleteDoc, doc } = require('firebase/firestore');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ENV_PATH = 'C:/Users/Administrator/OneDrive/Desktop/HIVE/Stella Project/stella-indoor-source/.env';
const env = (n) => {
  const line = (fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).find((l) => l.startsWith(n + '=')) || '');
  return line.slice(n.length + 1).trim();
};

const TMP = path.join(require('os').tmpdir(), 'stella-client-settings-e2e');
const CLIENT_URL = process.env.E2E_CLIENT_URL || 'https://stella-indoor.web.app';
const CLIENT_PROFILE = path.join(TMP, 'client-profile');

async function loginIfNeeded(page, email, password) {
  try {
    await page.waitForSelector('input[type=email]', { timeout: 6000 });
    await page.fill('input[type=email]', email);
    await page.fill('input[type=password]', password);
    await page.click('button[type=submit]');
    await page.waitForTimeout(4000);
  } catch {
    // Already logged in
  }
}

async function bustCache(page) {
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const ks = await caches.keys();
      await Promise.all(ks.map((k) => caches.delete(k)));
    }
  });
}

async function installFakePushSubscription(page, endpoint) {
  await page.evaluate(
    ([ep]) => {
      const fakeSub = {
        endpoint: ep,
        toJSON: () => ({ endpoint: ep, keys: { p256dh: 'e2ep256dh', auth: 'e2eauth' } }),
        unsubscribe: async () => {},
        options: { applicationServerKey: new Uint8Array(0) },
      };
      const fakeReg = {
        pushManager: {
          getSubscription: async () => fakeSub,
          subscribe: async () => fakeSub,
        },
        showNotification: async () => {},
      };
      Object.defineProperty(navigator.serviceWorker, 'ready', {
        get: () => Promise.resolve(fakeReg),
      });
      navigator.serviceWorker.getRegistration = async () => fakeReg;
      Notification.requestPermission = async () => 'granted';
    },
    [endpoint],
  );
}

(async () => {
  const app = initializeApp({
    apiKey: env('VITE_FIREBASE_API_KEY'),
    authDomain: env('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: env('VITE_FIREBASE_PROJECT_ID'),
  });
  const auth = getAuth(app);
  const db = getFirestore(app);

  const clientEmailRaw = env('VITE_TEST_CLIENT_EMAIL');
  const originalPassword = env('VITE_TEST_CLIENT_PASSWORD');
  const newPassword = 'StellaTest#777';

  if (!clientEmailRaw || !originalPassword) {
    console.log('SKIP — VITE_TEST_CLIENT_EMAIL/PASSWORD not set');
    process.exit(0);
  }
  const clientEmail = clientEmailRaw.toLowerCase().trim();

  // Sign in as the test client so Firestore owner-scoped reads/writes succeed.
  // If a previous run left the password as newPassword, reset it first.
  async function ensureClientSignedInWithOriginalPassword() {
    try {
      await signInWithEmailAndPassword(auth, clientEmail, originalPassword);
      return;
    } catch (e) {
      if (!e.message?.includes('auth/invalid-credential') && !e.message?.includes('auth/wrong-password')) {
        if (e.message?.includes('auth/user-not-found')) {
          await createUserWithEmailAndPassword(auth, clientEmail, originalPassword);
          return;
        }
        throw e;
      }
    }
    try {
      await signInWithEmailAndPassword(auth, clientEmail, newPassword);
      await updatePassword(auth.currentUser, originalPassword);
      console.log('  INFO — reset test client password back to original before run');
    } catch (e2) {
      throw new Error('Could not sign in as test client with either known password: ' + e2.message);
    }
  }
  await ensureClientSignedInWithOriginalPassword();

  const results = [];
  const check = (n, ok, d) => {
    results.push(ok);
    console.log(`  ${ok ? 'PASS' : 'FAIL'} — ${n}${d ? ' (' + d + ')' : ''}`);
  };

  let ctx = null;
  let subIdToDelete = null;

  try {
    // Ensure a test client auth account exists.
    try {
      await createUserWithEmailAndPassword(auth, clientEmail, originalPassword);
      console.log('  INFO — created test client auth account');
    } catch (e) {
      if (!e.message?.includes('email-already-in-use')) throw e;
    }

    // Clean up any leftover subscription docs for this test email.
    const existingSubs = await getDocs(
      query(collection(db, 'clientSubscriptions'), where('userEmail', '==', clientEmail)),
    );
    for (const s of existingSubs.docs) {
      await deleteDoc(s.ref);
    }

    ctx = await chromium.launchPersistentContext(CLIENT_PROFILE, {
      headless: true,
      channel: 'chrome',
    });
    await ctx.grantPermissions(['notifications']);
    const page = ctx.pages()[0] || await ctx.newPage();

    await page.goto(CLIENT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await loginIfNeeded(page, clientEmail, originalPassword);
    await bustCache(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 1. Open Settings from the home page cog.
    await page.getByRole('button', { name: /^Settings$/i }).first().click();
    await page.getByRole('heading', { name: /^Settings$/i }).waitFor({ timeout: 10000 });
    check('home-page cog opens Settings', true);

    // 2. Enable notifications with a mocked push subscription.
    const fakeEndpoint = `https://fcm.googleapis.com/fcm/send/client-settings-e2e-${Date.now()}`;
    await installFakePushSubscription(page, fakeEndpoint);

    await page.getByRole('button', { name: /^Enable notifications$/i }).click();
    await page.getByRole('paragraph').filter({ hasText: /Notifications enabled/i }).waitFor({ timeout: 15000 });
    check('Enable notifications button reports success', true);

    // Verify the subscribeClient function created a doc.
    const subsSnap = await getDocs(
      query(collection(db, 'clientSubscriptions'), where('userEmail', '==', clientEmail)),
    );
    const subDoc = subsSnap.docs.find((d) => d.data().endpoint === fakeEndpoint);
    subIdToDelete = subDoc?.id || null;
    check('clientSubscriptions doc created after Enable', !!subDoc, subIdToDelete || 'none');

    // 3. Wrong current password shows a clear error.
    await page.getByPlaceholder('Current password').fill('wrong-password');
    await page.getByPlaceholder('New password').first().fill(newPassword);
    await page.getByPlaceholder('Confirm new password').fill(newPassword);
    await page.getByRole('button', { name: /^Update password$/i }).click();
    await page.getByText(/Current password is incorrect/i).waitFor({ timeout: 10000 });
    check('wrong current password shows clear error', true);

    // 4. Correct current password updates the password.
    await page.getByPlaceholder('Current password').fill(originalPassword);
    // New-password fields already filled; confirm matches.
    await page.getByRole('button', { name: /^Update password$/i }).click();
    await page.getByText(/Password updated successfully/i).waitFor({ timeout: 15000 });
    check('correct current password updates password', true);

    // 5. Close Settings, go to the booking wizard so the Navbar appears, log out,
    //    and log back in with the NEW password to prove it changed.
    await page.getByRole('button', { name: /^Close$/i }).click();
    await page.waitForTimeout(500);
    await page.getByText(/^Book a Court$/i).first().click();
    await page.getByRole('button', { name: /^Log out$/i }).click();
    await page.waitForTimeout(1500);
    await loginIfNeeded(page, clientEmail, newPassword);
    await page.getByRole('heading', { name: /^Book Your Court$/i }).waitFor({ timeout: 15000 });
    check('login with new password succeeds', true);

    // 6. Reset the password back to the original so the test account stays stable.
    await signInWithEmailAndPassword(auth, clientEmail, newPassword);
    await updatePassword(auth.currentUser, originalPassword);
    console.log('  INFO — reset test client password back to original');
  } catch (err) {
    check('FATAL: ' + err.message, false);
  } finally {
    if (subIdToDelete) {
      await deleteDoc(doc(db, 'clientSubscriptions', subIdToDelete)).catch((e) =>
        console.log('  WARN — subscription cleanup:', e.message),
      );
    }
    if (ctx) {
      await ctx.close().catch(() => {});
      console.log('[e2e] closed client browser context');
    }
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n===== CLIENT SETTINGS E2E: ${results.length - failed}/${results.length} passed =====`);
  process.exit(failed ? 1 : 0);
})();
