import puppeteer from 'puppeteer';
const url = process.argv[2];
const out = process.argv[3];
const scrollY = parseInt(process.argv[4] || '0', 10);

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1200));
await page.evaluate((y) => window.scrollTo(0, y), scrollY);
await new Promise(r => setTimeout(r, 1500));
const dim = await page.evaluate(() => ({ ph: document.documentElement.scrollHeight, vh: window.innerHeight }));
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log(`Saved: ${out} | page height: ${dim.ph}px | viewport: ${dim.vh}px`);
