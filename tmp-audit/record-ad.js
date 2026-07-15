const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const htmlPath = 'file:///c:/Users/Administrator/OneDrive/Desktop/Stella Project/stella-launch-ad.html';
  const outDir = path.resolve(__dirname, 'ad-recordings');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: outDir,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();
  await page.goto(htmlPath);
  // Wait for the ad to signal completion
  await page.waitForSelector('body[data-ad-finished="true"]', { timeout: 30000 });
  // Give a tiny buffer so the final frame isn't cut off
  await page.waitForTimeout(500);

  await context.close();
  await browser.close();

  const files = fs.readdirSync(outDir).filter(f => f.endsWith('.webm'));
  if (!files.length) {
    console.error('No video file was produced.');
    process.exit(1);
  }
  const latest = files
    .map(f => ({ name: f, mtime: fs.statSync(path.join(outDir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime)[0].name;
  const finalPath = path.resolve(__dirname, '..', 'stella-launch-ad.webm');
  fs.renameSync(path.join(outDir, latest), finalPath);
  console.log('Video saved to:', finalPath);
})();
