import puppeteer from 'puppeteer';
import fs from 'fs';

// Chromium's page.pdf() has a known bug where the PDF text layer drops
// characters for custom web fonts (visual rendering is correct, only the
// invisible ToUnicode text layer is corrupted). Screenshotting each page
// as an image and assembling those into a PDF sidesteps it entirely.

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 }); // A4 @ 96dpi, 2x for crispness
await page.goto('http://localhost:3262/brand_assets/fresha-setup-guide.html', { waitUntil: 'networkidle2', timeout: 30000 });
await page.evaluate(() => document.fonts.ready);
await new Promise(r => setTimeout(r, 500));

const pageEls = await page.$$('.page');
console.log(`Found ${pageEls.length} pages`);

fs.mkdirSync('./.fresha-guide-tmp', { recursive: true });
const shots = [];
for (let i = 0; i < pageEls.length; i++) {
  const shotPath = `./.fresha-guide-tmp/page-${i + 1}.png`;
  await pageEls[i].screenshot({ path: shotPath });
  shots.push(shotPath);
}
await browser.close();
console.log('Screenshots done:', shots);
