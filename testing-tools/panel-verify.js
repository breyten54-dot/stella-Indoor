// Verifies the LIVE push-diagnostics panel end-to-end: login -> Settings ->
// click "Run Diagnostics" -> read the rendered report -> clean up the
// subscription the diagnostic run stored on the server.
const { chromium } = require('playwright');
const fs = require('fs');

const ORIGIN = 'https://stella-indoor-admin.web.app';
const ENV_PATH = 'C:/Users/Administrator/OneDrive/Desktop/HIVE/Stella Project/stella-indoor-source/.env';

function envVal(name) {
  const line = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).find(l => l.startsWith(name + '='));
  return line ? line.slice(name.length + 1).trim() : '';
}

(async () => {
  const userDataDir = __dirname + '/profile-panel';
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, { headless: true, channel: 'chrome' });
  } catch {
    context = await chromium.launchPersistentContext(userDataDir, { headless: true });
  }
  await context.grantPermissions(['notifications'], { origin: ORIGIN });
  const page = context.pages()[0] || await context.newPage();

  console.log('[verify] loading admin app...');
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Persistent profile may already hold a session — only log in if the form shows.
  try {
    await page.waitForSelector('input[type="email"]', { timeout: 8000 });
    await page.fill('input[type="email"]', envVal('VITE_ADMIN_EMAIL'));
    await page.fill('input[type="password"]', envVal('VITE_ADMIN_PASSWORD'));
    await page.click('button[type="submit"]');
    await page.waitForTimeout(6000);
  } catch {
    console.log('[verify] already logged in (persistent profile)');
  }

  console.log('[verify] opening Settings...');
  await page.goto(ORIGIN + '/#/settings', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('[data-testid="run-diagnostics"]', { timeout: 20000 });
  console.log('[verify] panel found; running diagnostics...');
  await page.click('[data-testid="run-diagnostics"]');
  await page.waitForSelector('[data-testid="diagnostics-report"]', { timeout: 30000 });
  await page.waitForTimeout(2000); // let the subscribe attempt line render

  const report = await page.locator('[data-testid="diagnostics-report"]').innerText();
  const attempt = await page.locator('[data-testid="subscribe-attempt"]').innerText().catch(() => 'not rendered');

  console.log('\n===== PANEL REPORT (as rendered) =====');
  console.log(report);
  console.log('\n===== SUBSCRIBE ATTEMPT =====');
  console.log(attempt);

  // Clean up: the diagnostic stored a real subscription for this headless profile.
  const cleanup = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration('/sw-admin.js');
    const sub = reg && await reg.pushManager.getSubscription();
    if (!sub) return 'no subscription to clean';
    await fetch('https://europe-west1-stella-indoor.cloudfunctions.net/unsubscribeAdmin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
    return 'cleaned';
  });
  console.log(`\n[verify] cleanup: ${cleanup}`);
  await context.close();
})().catch(err => { console.error('[verify] FATAL:', err.message); process.exit(1); });
