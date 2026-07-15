import { chromium } from 'playwright';
import { cleanupUser } from './cleanup-bot.mjs';

const CLIENT_URL = 'https://stella-indoor.web.app/';
const timestamp = Date.now();
const TEST_EMAIL = `stella.debug.${timestamp}@mailinator.com`;
const TEST_PHONE = '0821234567';
const TEST_PASS = 'AuditPass123!';

async function run() {
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

try {

page.on('console', (msg) => console.log(`[console ${msg.type()}]`, msg.text()));
page.on('pageerror', (err) => console.log('[pageerror]', err.message, err.stack));

await page.goto(CLIENT_URL, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1500);

await page.click('text=Register');
await page.waitForTimeout(300);
await page.locator('input[placeholder="John Smith"]').fill('Debug Bot');
await page.locator('input[placeholder="you@example.com"]').fill(TEST_EMAIL);
await page.locator('input[placeholder="082 000 0000"]').fill(TEST_PHONE);
await page.locator('input[placeholder="Min 6 characters"]').fill(TEST_PASS);
await page.locator('input[placeholder="Repeat password"]').fill(TEST_PASS);
await page.click('button:has-text("Create Account")');
await page.waitForSelector('text=Book a Court', { timeout: 15000 });

await page.click('text=Book a Court');
await page.waitForSelector('text=Book Your Court', { timeout: 10000 });
await page.waitForTimeout(500);
const selectButtons = await page.$$('button:has-text("Select")');
await selectButtons[0].click();
await page.waitForSelector('button:has-text("Selected")', { timeout: 5000 });
await page.click('button:has-text("Continue")');
await page.waitForSelector('text=Pick Your Time', { timeout: 10000 });

// Pick a date a few days out to avoid test bookings filling today
const dateButtons = await page.$$('button.snap-start');
if (dateButtons.length > 5) await dateButtons[5].click();

await page.waitForFunction(() => document.querySelectorAll('button.animate-pulse').length === 0, { timeout: 15000 });
const slots = await page.$$('button:not([disabled]).tab-nums');
for (const slot of slots) {
  const text = await slot.textContent();
  if (text && text.includes(':')) {
    await slot.click();
    break;
  }
}
await page.waitForTimeout(500);
await page.click('button:has-text("Continue")');
await page.waitForSelector('text=Add Extras', { timeout: 10000 });

console.log('--- Clicking Confirm ---');
await page.click('button:has-text("Confirm Booking")');
await page.waitForTimeout(12000);
const bodyText = await page.evaluate(() => document.body.innerText);
console.log('--- Body after 12s ---');
console.log(bodyText.slice(0, 600));

  } finally {
    await cleanupUser(TEST_EMAIL, TEST_PASS);
    await browser.close();
  }
}

await run();
