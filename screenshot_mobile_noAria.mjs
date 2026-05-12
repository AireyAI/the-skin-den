import puppeteer from 'puppeteer';
const url = process.argv[2];
const out = process.argv[3];
const scrollY = parseInt(process.argv[4] || '0', 10);

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
// Block Aria network entirely so it can never inject
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (/aria-chatbot/i.test(req.url())) { req.abort(); return; }
  req.continue();
});
await page.evaluateOnNewDocument(() => {
  try { window.localStorage.setItem('tsd-cookie-consent', 'accepted'); } catch {}
});
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 3500));
await page.evaluate((y) => window.scrollTo(0, y), scrollY);
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log('shot:', out);
