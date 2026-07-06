import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = 'C:/Users/VICTUS/.gemini/antigravity/brain/58627c73-a6c9-462c-a9ae-ccbb9906f78a/scratch/screenshots';
fs.mkdirSync(outDir, { recursive: true });

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  
  const baseUrl = 'http://localhost:5174';

  // 1. Desktop Admin Viewport
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktopContext.newPage();
  
  console.log('--- Desktop Admin Navigation ---');
  
  // Dashboard
  console.log('Navigating to Dashboard...');
  await page.goto(`${baseUrl}/?demo&role=admin&screen=dashboard`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '01_desktop_dashboard.png'), fullPage: true });

  // Leads
  console.log('Navigating to Leads...');
  await page.goto(`${baseUrl}/?demo&role=admin&screen=leads`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '02_desktop_leads.png'), fullPage: true });

  // Properties
  console.log('Navigating to Properties...');
  await page.goto(`${baseUrl}/?demo&role=admin&screen=properties`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '03_desktop_properties.png'), fullPage: true });

  // Clients
  console.log('Navigating to Clients...');
  await page.goto(`${baseUrl}/?demo&role=admin&screen=clients`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '04_desktop_clients.png'), fullPage: true });

  // Calendar
  console.log('Navigating to Calendar...');
  await page.goto(`${baseUrl}/?demo&role=admin&screen=calendar`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '05_desktop_calendar.png'), fullPage: true });

  // Team
  console.log('Navigating to Team...');
  await page.goto(`${baseUrl}/?demo&role=admin&screen=team`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '06_desktop_team.png'), fullPage: true });

  // Settings
  console.log('Navigating to Settings...');
  await page.goto(`${baseUrl}/?demo&role=admin&screen=settings`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '07_desktop_settings.png'), fullPage: true });

  // Integrations
  console.log('Navigating to Integrations...');
  await page.goto(`${baseUrl}/?demo&role=admin&screen=integrations`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '08_desktop_integrations.png'), fullPage: true });

  // Desktop WA Modal: Click "Share" on a property from Properties tab
  console.log('Opening WA Modal on Desktop...');
  await page.goto(`${baseUrl}/?demo&role=admin&screen=properties`);
  await page.waitForTimeout(1000);
  const shareBtn = await page.$('button:has-text("Share")');
  if (shareBtn) {
    await shareBtn.click();
    await page.waitForTimeout(2000); // wait for 1800ms AI typing simulation!
    await page.screenshot({ path: path.join(outDir, '09_desktop_wa_modal.png') });
    console.log('Saved 09_desktop_wa_modal.png');
  }

  await desktopContext.close();

  // 2. Mobile Field Agent Viewport
  console.log('--- Mobile Field Agent Navigation ---');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true
  });
  const mPage = await mobileContext.newPage();

  // Mobile Today
  console.log('Navigating to Mobile Today...');
  await mPage.goto(`${baseUrl}/?demo&role=agent&screen=today`);
  await mPage.waitForTimeout(1000);
  await mPage.screenshot({ path: path.join(outDir, '10_mobile_today.png') });

  // Mobile Leads
  console.log('Navigating to Mobile Leads...');
  await mPage.goto(`${baseUrl}/?demo&role=agent&screen=leads`);
  await mPage.waitForTimeout(1000);
  await mPage.screenshot({ path: path.join(outDir, '11_mobile_leads.png') });

  // Click on a Lead Card to open Lead Detail
  console.log('Opening Lead Detail on mobile...');
  const leadCard = await mPage.$('.m-card');
  if (leadCard) {
    await leadCard.click();
    await mPage.waitForTimeout(1000);
    await mPage.screenshot({ path: path.join(outDir, '12_mobile_lead_detail.png') });

    // Click "Share" button on Megapolis Sunway or property card
    console.log('Opening WhatsApp Modal on mobile via Share button...');
    const shareBtnMobile = await mPage.$('button:has-text("Share")');
    if (shareBtnMobile) {
      await shareBtnMobile.click();
      await mPage.waitForTimeout(2200); // wait for 1800ms AI typing simulation!
      await mPage.screenshot({ path: path.join(outDir, '13_mobile_wa_modal.png') });
      console.log('Saved 13_mobile_wa_modal.png');
    }
  }

  await mobileContext.close();
  await browser.close();
  console.log('All inspections and screenshots completed successfully!');
}

run().catch(err => {
  console.error('Error during inspection:', err);
  process.exit(1);
});
