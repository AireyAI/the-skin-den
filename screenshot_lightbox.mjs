import puppeteer from 'puppeteer';
const url = process.argv[2];
const out = process.argv[3];

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1200));
// Click the first gallery item
await page.evaluate(() => {
  const items = document.querySelectorAll('.gallery__item');
  if (items.length) items[0].click();
});
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log('Lightbox screenshot:', out);
