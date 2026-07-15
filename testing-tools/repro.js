// Stella admin push-subscribe reproduction — runs the EXACT client flow
// headlessly and reports where it breaks. No user device required.
const { chromium } = require('playwright');
const fs = require('fs');

const ORIGIN = 'https://stella-indoor-admin.web.app';
const ENV_PATH = 'C:/Users/Administrator/OneDrive/Desktop/HIVE/Stella Project/stella-indoor-source/.env';

function envVal(name) {
  const line = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).find(l => l.startsWith(name + '='));
  return line ? line.slice(name.length + 1).trim() : '';
}

(async () => {
  const email = envVal('VITE_ADMIN_EMAIL');
  const password = envVal('VITE_ADMIN_PASSWORD');
  const vapid = envVal('VITE_VAPID_PUBLIC_KEY');
  console.log(`[repro] creds loaded: email=${email ? 'yes' : 'NO'} pw=${password ? 'yes' : 'NO'} vapid=${vapid.slice(0, 10)}...`);

  // Push API is blocked in incognito, and a default Playwright context IS
  // incognito — so use a persistent profile. Prefer installed Chrome (channel)
  // because bare Chromium lacks the Google API keys FCM registration needs.
  const userDataDir = __dirname + '/profile';
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, { headless: true, channel: 'chrome' });
    console.log('[repro] using installed Chrome');
  } catch (err) {
    console.log(`[repro] chrome channel unavailable (${err.message.split('\n')[0]}), falling back to bundled Chromium`);
    context = await chromium.launchPersistentContext(userDataDir, { headless: true });
  }
  await context.grantPermissions(['notifications'], { origin: ORIGIN });
  const page = context.pages()[0] || await context.newPage();

  page.on('console', (msg) => console.log(`[page:${msg.type()}] ${msg.text()}`));
  page.on('requestfailed', (req) => console.log(`[net:FAILED] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`));
  page.on('response', (res) => {
    if (res.url().includes('subscribeAdmin')) {
      res.text().then(t => console.log(`[net] subscribeAdmin -> ${res.status()} ${t}`)).catch(() => {});
    }
  });

  console.log('[repro] loading admin app...');
  // networkidle never fires — the app keeps Firestore sockets open.
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });

  // Login
  console.log('[repro] logging in...');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);
  console.log(`[repro] post-login URL: ${page.url()}`);

  // Run the subscribe flow inline — mirrors src/admin/lib/pushNotifications.ts
  const result = await page.evaluate(async (VAPID_PUBLIC_KEY) => {
    const out = { steps: [] };
    const log = (s) => out.steps.push(s);
    try {
      log(`support: sw=${'serviceWorker' in navigator} push=${'PushManager' in window} notif=${'Notification' in window}`);
      log(`permission: ${Notification.permission}`);

      const existingReg = await navigator.serviceWorker.getRegistration('/sw-admin.js');
      const registration = existingReg || await navigator.serviceWorker.register('/sw-admin.js');
      await navigator.serviceWorker.ready;
      log(`sw: registered, scope=${registration.scope}, active=${!!registration.active}`);

      const existingSub = await registration.pushManager.getSubscription();
      log(`existing subscription: ${existingSub ? 'yes -> unsubscribing' : 'none'}`);
      if (existingSub) await existingSub.unsubscribe();

      const padding = '='.repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4);
      const b64 = (VAPID_PUBLIC_KEY + padding).replace(/-/g, '+').replace(/_/g, '/');
      const raw = atob(b64);
      const key = Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
      log(`vapid key decoded: ${key.byteLength} bytes`);

      let subscription;
      try {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        log(`subscribe: SUCCESS endpoint=${subscription.endpoint.slice(0, 60)}...`);
      } catch (err) {
        log(`subscribe: FAILED — ${err.name}: ${err.message}`);
        return out;
      }

      const subJson = subscription.toJSON();
      log(`sub keys present: p256dh=${!!subJson.keys?.p256dh} auth=${!!subJson.keys?.auth}`);

      const response = await fetch('https://europe-west1-stella-indoor.cloudfunctions.net/subscribeAdmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
          deviceInfo: 'PLAYWRIGHT-REPRO ' + navigator.userAgent.slice(0, 60),
        }),
      });
      const text = await response.text();
      log(`server: ${response.status} ${text}`);

      // Clean up: remove the repro subscription from the server so real
      // admin pushes don't try to reach a headless browser.
      await fetch('https://europe-west1-stella-indoor.cloudfunctions.net/unsubscribeAdmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
      log('cleanup: repro subscription removed');
    } catch (err) {
      log(`UNEXPECTED: ${err.name}: ${err.message}`);
    }
    return out;
  }, vapid);

  console.log('\n===== REPRO RESULT =====');
  result.steps.forEach(s => console.log('  ' + s));
  await context.close();
})();
