const puppeteer = require('puppeteer');
const path = require('path');

async function takeDemo() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  try {
    const filePath = path.join(__dirname, '..', 'demo-class-card.html');
    const fileUrl = `file://${filePath}`;
    
    console.log('Loading demo file:', fileUrl);
    await page.goto(fileUrl, { waitUntil: 'networkidle2' });
    
    // Mobile viewport
    await page.setViewport({ width: 375, height: 600 });
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const screenshotPath = path.join(__dirname, '..', 'screenshots', 'header-layout-fix-demo.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Demo screenshot saved to: ${screenshotPath}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

takeDemo().catch(console.error);