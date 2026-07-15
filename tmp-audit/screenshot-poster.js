const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const htmlPath = 'file:///c:/Users/Administrator/OneDrive/Desktop/Stella Project/stella-poster.html';
  const outPath = path.resolve(__dirname, '..', 'stella-launch-poster.png');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1080, height: 1350 } });
  const page = await context.newPage();
  await page.goto(htmlPath);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: outPath });

  await context.close();
  await browser.close();
  console.log('Poster saved to:', outPath);
})();
