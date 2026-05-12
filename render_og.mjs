import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.goto('http://localhost:3000/brand_assets/og-template.html', { waitUntil: 'networkidle2', timeout: 30000 });
// Wait for web fonts to load
await page.evaluate(() => document.fonts.ready);
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: './brand_assets/og-image.jpg', type: 'jpeg', quality: 92, fullPage: false });
await browser.close();
console.log('OG image rendered: ./brand_assets/og-image.jpg');
