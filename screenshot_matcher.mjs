import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
await page.goto('http://localhost:3000/studio.html', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1200));
// Click through the 3 quiz steps
await page.evaluate(() => document.getElementById('matcher').scrollIntoView());
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => document.querySelector('.matcher__opt[data-value="acne"]').click());
await new Promise(r => setTimeout(r, 600));
await page.evaluate(() => document.querySelector('.matcher__opt[data-value="bold"]').click());
await new Promise(r => setTimeout(r, 600));
await page.evaluate(() => document.querySelector('.matcher__opt[data-value="longterm"]').click());
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: './temporary screenshots/v10-matcher-result.png', fullPage: false });
await browser.close();
console.log('saved');
