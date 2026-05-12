import puppeteer from 'puppeteer';
const url = process.argv[2];
const out = process.argv[3] || './viewport.png';
const w = parseInt(process.argv[4] || '1280', 10);
const h = parseInt(process.argv[5] || '900', 10);

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log('viewport screenshot:', out);
