import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
await page.goto('http://localhost:3000/studio.html', { waitUntil: 'networkidle2', timeout: 30000 });
// Wait past the 3s anti-Aria polling window
await new Promise(r => setTimeout(r, 4000));
// Simulate user wheel to defeat any remaining auto-scroll defence
await page.mouse.wheel({ deltaY: 100 });
await new Promise(r => setTimeout(r, 300));
// Now scroll deep into the page
await page.evaluate(() => window.scrollTo(0, 5000));
await new Promise(r => setTimeout(r, 1000));
const result = await page.evaluate(() => {
  const wa = document.querySelector('.wa-fab');
  const waRect = wa?.getBoundingClientRect();
  return {
    scrollY: window.scrollY,
    waVisible: wa && waRect.bottom > 0 && waRect.top < window.innerHeight,
    waRect: waRect ? { top: waRect.top, bottom: waRect.bottom, right: waRect.right } : null,
  };
});
console.log(JSON.stringify(result, null, 2));
await page.screenshot({ path: './temporary screenshots/v12-fab-midscroll.png', fullPage: false });
await browser.close();
