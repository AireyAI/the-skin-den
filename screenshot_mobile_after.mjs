import puppeteer from 'puppeteer';
const url = process.argv[2];
const out = process.argv[3];
const scrollY = parseInt(process.argv[4] || '0', 10);

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
// Wait past the 3s anti-Aria polling window
await new Promise(r => setTimeout(r, 3500));
// Wheel to defeat any remaining auto-scroll defence
await page.mouse.wheel({ deltaY: 100 });
await new Promise(r => setTimeout(r, 300));
await page.evaluate((y) => window.scrollTo(0, y), scrollY);
await new Promise(r => setTimeout(r, 1000));
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log('mobile:', out);
