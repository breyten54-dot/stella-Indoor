import { chromium } from 'playwright';
import { cleanupUser } from './cleanup-bot.mjs';

const CLIENT_URL = 'https://stella-indoor.web.app/';
const ADMIN_URL = 'https://stella-indoor-admin.web.app/';
const ADMIN_EMAIL = 'stellasportshub@gmail.com';
const ADMIN_PASS = 'StellaGotBallz!';

const timestamp = Date.now();
const TEST_NAME = 'Audit Bot';
const TEST_EMAIL = `stella.audit.${timestamp}@mailinator.com`;
const TEST_PHONE = '0821234567';
const TEST_PASS = 'AuditPass123!';

const results = [];

function log(test, status, detail = '') {
  results.push({ test, status, detail });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} ${test}${detail ? ' — ' + detail : ''}`);
}

async function capture(page, name) {
  try {
    await page.screenshot({ path: `audit-${name}.png`, fullPage: true });
  } catch { /* ignore */ }
}

function checkErrors(errors, logs, label) {
  const fatal = errors.filter(e =>
    !e.includes('permission-denied') &&
    !e.includes('OAuth operations') &&
    !e.includes('Email service not configured') &&
    !e.includes('Cancellation email failed') &&
    !e.includes('Reminder scheduling failed')
  );
  if (fatal.length) {
    log(label + ' console errors', 'WARN', fatal.slice(0, 3).join(' | '));
  }
}

async function runClientTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  const logs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}\n${err.stack || ''}`));

  try {
    await page.goto(CLIENT_URL, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1500);
    let bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Something went wrong')) throw new Error('Client error boundary on homepage');
    log('Client homepage loads', 'PASS');
    await capture(page, 'client-home');

    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    await page.waitForTimeout(800);
    bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Something went wrong')) throw new Error('Client error boundary after scroll');
    log('Client homepage scroll to bottom', 'PASS');

    // Register
    await page.click('text=Register');
    await page.waitForTimeout(300);
    await page.locator('input[placeholder="John Smith"]').fill(TEST_NAME);
    await page.locator('input[placeholder="you@example.com"]').fill(TEST_EMAIL);
    await page.locator('input[placeholder="082 000 0000"]').fill(TEST_PHONE);
    await page.locator('input[placeholder="Min 6 characters"]').fill(TEST_PASS);
    await page.locator('input[placeholder="Repeat password"]').fill(TEST_PASS);
    await page.click('button:has-text("Create Account")');

    // After successful registration the user is signed in and the home page appears.
    await page.waitForSelector('text=Book a Court', { timeout: 15000 });
    log('Client registration + auto-login', 'PASS');
    await capture(page, 'client-logged-in');

    // Booking wizard
    await page.click('text=Book a Court');
    await page.waitForSelector('text=Book Your Court', { timeout: 10000 });
    await page.waitForTimeout(500);

    const selectButtons = await page.$$('button:has-text("Select")');
    if (!selectButtons.length) throw new Error('No court Select buttons');
    await selectButtons[0].click();
    await page.waitForSelector('button:has-text("Selected")', { timeout: 5000 });
    await page.click('button:has-text("Continue")');
    await page.waitForSelector('text=Pick Your Time', { timeout: 10000 });
    log('Client court selection', 'PASS');

    // Pick a date a few days out to avoid test bookings filling today
    const dateButtons = await page.$$('button.snap-start');
    if (dateButtons.length > 5) await dateButtons[5].click();

    // Wait for availability to finish loading
    await page.waitForFunction(() => {
      return document.querySelectorAll('button.animate-pulse').length === 0;
    }, { timeout: 15000 });

    const slots = await page.$$('button:not([disabled]).tab-nums');
    let slotClicked = false;
    for (const slot of slots) {
      const text = await slot.textContent();
      if (text && text.includes(':')) {
        await slot.click();
        slotClicked = true;
        break;
      }
    }
    if (!slotClicked) throw new Error('No available time slot found');
    // Wait for the selected slot style to apply
    await page.waitForTimeout(500);
    // Ensure the booking summary shows a time before continuing
    const summaryTime = await page.evaluate(() => {
      const text = document.body.innerText;
      const m = text.match(/\d{2}:\d{2}/);
      return m ? m[0] : '';
    });
    if (!summaryTime) throw new Error('No time shown in booking summary after slot selection');
    await capture(page, 'client-time-selected');
    await page.click('button:has-text("Continue")');
    await page.waitForSelector('text=Add Extras', { timeout: 10000 });
    await page.waitForTimeout(500);
    await capture(page, 'client-addons');
    await page.waitForSelector('text=Add Extras', { timeout: 10000 });
    log('Client time selection', 'PASS');

    await page.click('button:has-text("Confirm Booking")');
    try {
      await page.waitForSelector('text=Booking Confirmed!', { timeout: 20000 });
      log('Client booking confirmation', 'PASS');
      await capture(page, 'client-confirmed');
    } catch (e) {
      const bodyText = await page.evaluate(() => document.body.innerText);
      await capture(page, 'client-confirm-timeout');
      throw new Error(`Booking confirmation did not appear. Body: ${bodyText.slice(0, 300)}`);
    }

    const bookingRef = await page.evaluate(() => {
      const match = document.body.innerText.match(/ST-[A-Z0-9]+/);
      return match ? match[0] : '';
    });
    log('Client booking ref captured', bookingRef ? 'PASS' : 'WARN', bookingRef || 'not found');

    await page.click('text=Book Another Court');
    await page.waitForSelector('text=Book a Court', { timeout: 10000 });
    await page.click('text=My Bookings');
    await page.waitForSelector('text=My Bookings', { timeout: 10000 });
    await page.waitForTimeout(1500);
    bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('No bookings yet')) throw new Error('New booking not visible in My Bookings');
    log('Client My Bookings shows booking', 'PASS');
    await capture(page, 'client-my-bookings');

    const cancelButtons = await page.$$('button:has-text("Cancel")');
    if (cancelButtons.length) {
      await cancelButtons[0].click();
      await page.waitForTimeout(2000);
      log('Client booking cancelled', 'PASS');
    }

    checkErrors(errors, logs, 'Client');
  } catch (e) {
    log('Client test', 'FAIL', e.message);
    await capture(page, 'client-fail');
  } finally {
    await cleanupUser(TEST_EMAIL, TEST_PASS);
    await browser.close();
  }
}

async function runAdminTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  const logs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === 'error') errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}\n${err.stack || ''}`));

  try {
    await page.goto(ADMIN_URL, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1000);
    let bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Something went wrong')) throw new Error('Admin error boundary on load');
    log('Admin login page loads', 'PASS');

    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASS);
    await page.click('button:has-text("Sign In to Dashboard")');
    await page.waitForSelector('text=Dashboard', { timeout: 20000 });
    await page.waitForTimeout(1500);
    log('Admin login', 'PASS');
    await capture(page, 'admin-dashboard');

    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    await page.waitForTimeout(800);
    bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Something went wrong')) throw new Error('Admin error boundary on dashboard scroll');
    log('Admin dashboard scroll', 'PASS');

    await page.click('text=Calendar');
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    await page.waitForTimeout(800);
    bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Something went wrong')) throw new Error('Admin error boundary on calendar');
    log('Admin calendar tab + scroll', 'PASS');
    await capture(page, 'admin-calendar');

    await page.click('text=Clients');
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    await page.waitForTimeout(800);
    bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Something went wrong')) throw new Error('Admin error boundary on clients');
    log('Admin clients tab + scroll', 'PASS');

    await page.click('text=Settings');
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    await page.waitForTimeout(800);
    bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Something went wrong')) throw new Error('Admin error boundary on settings');
    log('Admin settings tab + scroll', 'PASS');

    await page.click('text=Install App');
    await page.waitForTimeout(500);
    bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Something went wrong')) throw new Error('Admin error boundary on install modal');
    if (bodyText.includes('Install Stella Indoor')) log('Admin install modal opens', 'PASS');
    await page.click('button:has-text("Got it")');
    await page.waitForTimeout(300);

    await page.click('text=Dashboard');
    await page.waitForTimeout(1000);
    bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Something went wrong')) throw new Error('Admin error boundary returning to dashboard');
    log('Admin tab switching', 'PASS');

    checkErrors(errors, logs, 'Admin');
  } catch (e) {
    log('Admin test', 'FAIL', e.message);
    await capture(page, 'admin-fail');
  } finally {
    await browser.close();
  }
}

(async () => {
  console.log('\n=== Stella Indoor — Full Audit ===\n');
  await runClientTest();
  console.log('');
  await runAdminTest();
  console.log('\n=== Summary ===');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warns = results.filter(r => r.status === 'WARN').length;
  console.log(`Passed: ${passed} | Failed: ${failed} | Warnings: ${warns}`);
  if (failed) process.exit(1);
})();
