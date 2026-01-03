const puppeteer = require('puppeteer');
const path = require('path');

async function takeEntryListScreenshots() {
  const browser = await puppeteer.launch({
    headless: false, // Show browser for debugging
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    console.log('Navigating to EntryList page for analysis...');
    
    // Set mobile viewport first
    await page.setViewport({ width: 375, height: 812 });
    
    // Navigate to EntryList page - adjust URL based on your routing
    await page.goto('http://localhost:5173/class/340/entries', { 
      waitUntil: 'networkidle2', 
      timeout: 15000 
    });
    
    // Wait for page to load completely
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Take mobile light mode screenshot
    const mobileScreenshotPath = path.join(__dirname, '..', 'screenshots', 'entrylist-current-mobile-light.png');
    await page.screenshot({ path: mobileScreenshotPath, fullPage: true });
    console.log(`Mobile light mode screenshot saved: ${mobileScreenshotPath}`);
    
    // Switch to dark mode if possible
    try {
      // Look for a theme toggle button or implement dark mode switch
      const themeToggle = await page.$('[data-theme-toggle]'); // Adjust selector as needed
      if (themeToggle) {
        await themeToggle.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const mobileDarkScreenshotPath = path.join(__dirname, '..', 'screenshots', 'entrylist-current-mobile-dark.png');
        await page.screenshot({ path: mobileDarkScreenshotPath, fullPage: true });
        console.log(`Mobile dark mode screenshot saved: ${mobileDarkScreenshotPath}`);
      }
    } catch (error) {
      console.log('Dark mode toggle not found, skipping dark mode screenshots');
    }
    
    // Switch to desktop viewport
    await page.setViewport({ width: 1440, height: 900 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Take desktop light mode screenshot
    const desktopScreenshotPath = path.join(__dirname, '..', 'screenshots', 'entrylist-current-desktop-light.png');
    await page.screenshot({ path: desktopScreenshotPath, fullPage: true });
    console.log(`Desktop light mode screenshot saved: ${desktopScreenshotPath}`);
    
    // Take tablet viewport screenshot
    await page.setViewport({ width: 768, height: 1024 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const tabletScreenshotPath = path.join(__dirname, '..', 'screenshots', 'entrylist-current-tablet-light.png');
    await page.screenshot({ path: tabletScreenshotPath, fullPage: true });
    console.log(`Tablet screenshot saved: ${tabletScreenshotPath}`);
    
    // Try to interact with the page to show different states
    console.log('Attempting to capture different states...');
    
    // Try clicking on a tab if tabs exist
    try {
      const completedTab = await page.$('button[contains(text(), "Completed")]') || 
                          await page.$('button:contains("Completed")') ||
                          await page.$('.status-tab:last-child');
      
      if (completedTab) {
        await completedTab.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const completedTabScreenshotPath = path.join(__dirname, '..', 'screenshots', 'entrylist-completed-tab.png');
        await page.screenshot({ path: completedTabScreenshotPath, fullPage: true });
        console.log(`Completed tab screenshot saved: ${completedTabScreenshotPath}`);
      }
    } catch (error) {
      console.log('Could not interact with tabs:', error.message);
    }
    
  } catch (error) {
    console.error('Error taking EntryList screenshots:', error);
    
    // Try fallback URLs in case routing is different
    console.log('Trying fallback routes...');
    try {
      await page.goto('http://localhost:5173/entries', { waitUntil: 'networkidle2', timeout: 5000 });
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const fallbackScreenshotPath = path.join(__dirname, '..', 'screenshots', 'entrylist-fallback.png');
      await page.screenshot({ path: fallbackScreenshotPath, fullPage: true });
      console.log(`Fallback screenshot saved: ${fallbackScreenshotPath}`);
    } catch (fallbackError) {
      console.error('Fallback route also failed:', fallbackError);
    }
    
  } finally {
    await browser.close();
  }
}

takeEntryListScreenshots().catch(console.error);