import { chromium } from 'playwright';

const CLIENT_URL = 'https://stella-indoor.web.app/';
const ADMIN_URL = 'https://stella-indoor-admin.web.app/';

async function checkClientInstall() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await page.goto(CLIENT_URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Service worker registration check
  const swRegistered = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration('/');
    return !!reg && !!reg.active;
  });
  console.log(`Client service worker registered: ${swRegistered ? '✅' : '❌'}`);

  // Login page has an Install App pill button
  const installButton = page.locator('button[title="Install App"], button:has-text("Install App")').first();
  const buttonVisible = await installButton.isVisible().catch(() => false);
  console.log(`Install button visible: ${buttonVisible ? '✅' : '❌'}`);

  if (buttonVisible) {
    await installButton.click();
    const modal = page.locator('text=Install Stella Indoor').first();
    const modalVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Install modal opens from button: ${modalVisible ? '✅' : '❌'}`);
  }

  await browser.close();
}

async function checkAdminPasswordToggle() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  await page.goto(ADMIN_URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1000);

  const passwordInput = page.locator('input[placeholder="Enter admin password"]');
  const toggleButton = page.locator('button[aria-label="Show password"], button[aria-label="Hide password"]').first();

  const hasPasswordInput = await passwordInput.isVisible().catch(() => false);
  const hasToggle = await toggleButton.isVisible().catch(() => false);
  console.log(`Admin password input visible: ${hasPasswordInput ? '✅' : '❌'}`);
  console.log(`Admin password toggle visible: ${hasToggle ? '✅' : '❌'}`);

  if (hasPasswordInput && hasToggle) {
    const typeBefore = await passwordInput.getAttribute('type');
    await toggleButton.click();
    const typeAfter = await passwordInput.getAttribute('type');
    console.log(`Password toggle changes type: ${typeBefore === 'password' && typeAfter === 'text' ? '✅' : '❌'} (${typeBefore} -> ${typeAfter})`);
  }

  await browser.close();
}

(async () => {
  console.log('\n=== Client Install Prompt Checks ===\n');
  await checkClientInstall();
  console.log('\n=== Admin Password Toggle Checks ===\n');
  await checkAdminPasswordToggle();
})();
