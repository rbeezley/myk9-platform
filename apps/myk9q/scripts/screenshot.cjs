const puppeteer = require('puppeteer');
const path = require('path');

async function takeScreenshot() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Set viewport size
  await page.setViewport({ width: 375, height: 812 }); // iPhone X size
  
  try {
    // Navigate to the app
    console.log('Navigating to app...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2', timeout: 10000 });
    
    // Try to navigate directly to a class list with demo data
    console.log('Trying to navigate to class list...');
    await page.goto('http://localhost:5173/trial/1/classes', { waitUntil: 'networkidle2', timeout: 5000 });
    
    // Wait a moment for any animations
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Take screenshot
    const screenshotPath = path.join(__dirname, '..', 'screenshots', 'class-list-header-fix-mobile.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Mobile screenshot saved to: ${screenshotPath}`);
    
    // Try larger viewport (desktop)
    await page.setViewport({ width: 1200, height: 800 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const desktopScreenshotPath = path.join(__dirname, '..', 'screenshots', 'class-list-header-fix-desktop.png');
    await page.screenshot({ path: desktopScreenshotPath, fullPage: true });
    console.log(`Desktop screenshot saved to: ${desktopScreenshotPath}`);
    
    // Also try the home page to see overall navigation
    console.log('Taking home page screenshot...');
    await page.goto('http://localhost:5173/home', { waitUntil: 'networkidle2', timeout: 5000 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const homeScreenshotPath = path.join(__dirname, '..', 'screenshots', 'home-page-current.png');
    await page.screenshot({ path: homeScreenshotPath, fullPage: true });
    console.log(`Home screenshot saved to: ${homeScreenshotPath}`);
    
  } catch (error) {
    console.error('Error taking screenshot:', error);
  } finally {
    await browser.close();
  }
}

takeScreenshot().catch(console.error);