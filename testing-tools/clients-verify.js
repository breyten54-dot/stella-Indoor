const { chromium } = require('playwright');
const fs = require('fs');
const env = (n) => (fs.readFileSync('C:/Users/Administrator/OneDrive/Desktop/HIVE/Stella Project/stella-indoor-source/.env', 'utf8').split(/\r?\n/).find(l => l.startsWith(n + '=')) || '').slice(n.length + 1).trim();

(async () => {
  const ctx = await chromium.launchPersistentContext(__dirname + '/profile-panel', { headless: true, channel: 'chrome' });
  const page = ctx.pages()[0] || await ctx.newPage();
  const results = [];
  const check = (n, ok, d) => { results.push(ok); console.log(`  ${ok ? 'PASS' : 'FAIL'} — ${n}${d ? ' (' + d + ')' : ''}`); };

  await page.goto('https://stella-indoor-admin.web.app', { waitUntil: 'domcontentloaded', timeout: 60000 });
  try {
    await page.waitForSelector('input[type=email]', { timeout: 8000 });
    await page.fill('input[type=email]', env('VITE_ADMIN_EMAIL'));
    await page.fill('input[type=password]', env('VITE_ADMIN_PASSWORD'));
    await page.click('button[type=submit]'); await page.waitForTimeout(6000);
  } catch { /* logged in */ }
  // bust SW cache so we test the fresh bundle
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) { const r = await navigator.serviceWorker.getRegistrations(); await Promise.all(r.map(x => x.unregister())); }
    if (window.caches) { const k = await caches.keys(); await Promise.all(k.map(x => caches.delete(x))); }
  });
  await page.goto('https://stella-indoor-admin.web.app/#/clients', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=/Registered Clients/i', { timeout: 20000 });
  await page.waitForTimeout(4000);

  const btn = (name) => page.getByRole('button', { name: new RegExp(name, 'i') });
  for (const label of ['All Clients', 'New Bookers', 'Recurring Bookers']) {
    check(`"${label}" button present`, await btn(label).count() > 0);
  }

  // Read the count shown on each button, then click and confirm the rendered
  // client rows match that count.
  const rowCount = async () => page.locator('.divide-y > div').count();
  const readBtnCount = async (label) => {
    const t = await btn(label).first().innerText();
    const m = t.match(/(\d+)\s*$/);
    return m ? parseInt(m[1]) : -1;
  };

  for (const label of ['Recurring Bookers', 'New Bookers', 'All Clients']) {
    const expected = await readBtnCount(label);
    await btn(label).first().click();
    await page.waitForTimeout(1200);
    const rows = await rowCount();
    check(`clicking "${label}" filters list to its count`, rows === expected, `button=${expected} rows=${rows}`);
  }

  await ctx.close();
  const failed = results.filter(r => !r).length;
  console.log(`\n===== CLIENTS FILTER: ${results.length - failed}/${results.length} passed =====`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
