import { chromium } from 'playwright';

async function check() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('http://localhost:5174/?role=admin&screen=dashboard');
  await page.waitForTimeout(2000);
  const title = await page.title();
  const html = await page.content();
  console.log('TITLE:', title);
  console.log('BODY TEXT:', await page.locator('body').innerText());
  console.log('HTML SNIPPET:', html.slice(0, 500));
  await browser.close();
}
check();
