const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const htmlPath = 'file:///c:/Users/Administrator/OneDrive/Desktop/Stella Project/stella-launch-ad.html';
  const outDir = path.resolve(__dirname, 'ad-screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.goto(htmlPath);
  await page.waitForLoadState('networkidle');

  for (const t of [0, 0.5, 1, 2, 3, 4, 4.5, 5, 6, 8, 12, 16, 20]) {
    await page.waitForTimeout(t === 0 ? 0 : 500);
    await page.screenshot({ path: path.join(outDir, `t-${Date.now()}.png`) });
  }

  await context.close();
  await browser.close();
  console.log('Screenshots saved to', outDir);
})();
