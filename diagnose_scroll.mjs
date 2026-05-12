import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
// Log console errors
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text()); });

await page.goto('http://localhost:3000/studio.html', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 2500));
const scrollY = await page.evaluate(() => window.scrollY);
const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
const vh = await page.evaluate(() => window.innerHeight);
console.log('Scroll Y:', scrollY, '/ Doc height:', docHeight, '/ Viewport:', vh);
console.log('At bottom?', (scrollY + vh) >= docHeight - 10);
await page.screenshot({ path: './temporary screenshots/diagnose-scroll.png', fullPage: false });
await browser.close();
