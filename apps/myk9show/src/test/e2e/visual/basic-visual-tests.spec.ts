import { test } from '@playwright/test';
import { VisualTestManager } from '../helpers/visualTestManager';

test.describe('Basic Visual Regression Tests', () => {
  let visualManager: VisualTestManager;

  test.beforeEach(async ({ page }) => {
    visualManager = new VisualTestManager(page);
    await visualManager.preparePage();
  });

  test.describe('Public Pages', () => {
    test('landing page', async ({ page }) => {
      await page.goto('/');
      await visualManager.compareScreenshot('landing-page');
    });

    test('sign in page', async ({ page }) => {
      await page.goto('/sign-in');
      await visualManager.compareScreenshot('sign-in-page');
    });

    test('sign up page', async ({ page }) => {
      await page.goto('/sign-up');
      await visualManager.compareScreenshot('sign-up-page');
    });

    test('forgot password page', async ({ page }) => {
      await page.goto('/forgot-password');
      await visualManager.compareScreenshot('forgot-password-page');
    });
  });

  test.describe('Responsive Views', () => {
    const viewports = [
      { width: 1440, height: 900, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 375, height: 667, name: 'mobile' }
    ];

    test('landing page - all viewports', async ({ page }) => {
      await page.goto('/');
      await visualManager.compareViewports('landing-page', viewports);
    });

    test('sign in page - all viewports', async ({ page }) => {
      await page.goto('/sign-in');
      await visualManager.compareViewports('sign-in-page', viewports);
    });
  });

  test.describe('Component States', () => {
    test('button states', async ({ page }) => {
      await page.goto('/');
      
      // Create a test page with button states
      await page.evaluate(() => {
        document.body.innerHTML = `
          <div style="padding: 20px; background: white;">
            <h2>Button States</h2>
            <div style="display: flex; gap: 20px; margin: 20px 0;">
              <button class="btn btn-primary">Normal</button>
              <button class="btn btn-primary" disabled>Disabled</button>
              <button class="btn btn-primary loading">Loading</button>
            </div>
            <div style="display: flex; gap: 20px; margin: 20px 0;">
              <button class="btn btn-secondary">Secondary</button>
              <button class="btn btn-outline">Outline</button>
              <button class="btn btn-ghost">Ghost</button>
            </div>
            <div style="display: flex; gap: 20px; margin: 20px 0;">
              <button class="btn btn-sm">Small</button>
              <button class="btn">Medium</button>
              <button class="btn btn-lg">Large</button>
            </div>
          </div>
        `;
      });
      
      await visualManager.compareScreenshot('button-states');
    });

    test('form elements', async ({ page }) => {
      await page.goto('/');
      
      // Create a test page with form elements
      await page.evaluate(() => {
        document.body.innerHTML = `
          <div style="padding: 20px; background: white;">
            <h2>Form Elements</h2>
            <form style="max-width: 400px;">
              <div style="margin-bottom: 20px;">
                <label>Text Input</label>
                <input type="text" class="form-control" placeholder="Enter text">
              </div>
              <div style="margin-bottom: 20px;">
                <label>Text Input (Error)</label>
                <input type="text" class="form-control error" placeholder="Enter text">
                <span class="error-message">This field is required</span>
              </div>
              <div style="margin-bottom: 20px;">
                <label>Select Dropdown</label>
                <select class="form-control">
                  <option>Choose an option</option>
                  <option>Option 1</option>
                  <option>Option 2</option>
                </select>
              </div>
              <div style="margin-bottom: 20px;">
                <label>Textarea</label>
                <textarea class="form-control" rows="3" placeholder="Enter description"></textarea>
              </div>
              <div style="margin-bottom: 20px;">
                <label>
                  <input type="checkbox"> Checkbox option
                </label>
              </div>
              <div style="margin-bottom: 20px;">
                <label>
                  <input type="radio" name="radio"> Radio option 1
                </label>
                <label>
                  <input type="radio" name="radio"> Radio option 2
                </label>
              </div>
            </form>
          </div>
        `;
      });
      
      await visualManager.compareScreenshot('form-elements');
    });

    test('cards and panels', async ({ page }) => {
      await page.goto('/');
      
      // Create a test page with cards
      await page.evaluate(() => {
        document.body.innerHTML = `
          <div style="padding: 20px; background: #f5f5f5;">
            <h2>Cards and Panels</h2>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 20px;">
              <div class="card">
                <div class="card-header">
                  <h3>Card Title</h3>
                </div>
                <div class="card-body">
                  <p>Card content goes here. This is a basic card example.</p>
                </div>
                <div class="card-footer">
                  <button class="btn btn-primary">Action</button>
                </div>
              </div>
              <div class="card card-hover">
                <div class="card-body">
                  <h3>Hover Card</h3>
                  <p>This card has hover effects.</p>
                </div>
              </div>
              <div class="card card-selected">
                <div class="card-body">
                  <h3>Selected Card</h3>
                  <p>This card is in selected state.</p>
                </div>
              </div>
            </div>
          </div>
        `;
      });
      
      await visualManager.compareScreenshot('cards-panels');
    });

    test('alerts and notifications', async ({ page }) => {
      await page.goto('/');
      
      // Create a test page with alerts
      await page.evaluate(() => {
        document.body.innerHTML = `
          <div style="padding: 20px; background: white;">
            <h2>Alerts and Notifications</h2>
            <div style="display: flex; flex-direction: column; gap: 15px; margin-top: 20px;">
              <div class="alert alert-success">
                <strong>Success!</strong> Your changes have been saved.
              </div>
              <div class="alert alert-info">
                <strong>Info:</strong> New features are available.
              </div>
              <div class="alert alert-warning">
                <strong>Warning:</strong> Please review your settings.
              </div>
              <div class="alert alert-error">
                <strong>Error:</strong> Something went wrong.
              </div>
            </div>
            <h3 style="margin-top: 30px;">Toast Notifications</h3>
            <div style="position: relative; height: 200px;">
              <div class="toast" style="position: absolute; top: 20px; right: 20px;">
                <div class="toast-success">Changes saved</div>
              </div>
            </div>
          </div>
        `;
      });
      
      await visualManager.compareScreenshot('alerts-notifications');
    });
  });

  test.describe('Theme Variations', () => {
    test('light theme components', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'light');
      });
      
      await page.evaluate(() => {
        document.body.innerHTML = `
          <div style="padding: 20px;">
            <h1>Light Theme</h1>
            <p>This is how components look in light theme.</p>
            <button class="btn btn-primary">Primary Button</button>
            <div class="card" style="margin-top: 20px;">
              <div class="card-body">
                <h3>Card in Light Theme</h3>
                <p>Card content with light theme styling.</p>
              </div>
            </div>
          </div>
        `;
      });
      
      await visualManager.compareScreenshot('theme-light');
    });

    test('dark theme components', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.classList.add('dark');
      });
      
      await page.evaluate(() => {
        document.body.innerHTML = `
          <div style="padding: 20px; background: #1a1a1a; color: white; min-height: 100vh;">
            <h1>Dark Theme</h1>
            <p>This is how components look in dark theme.</p>
            <button class="btn btn-primary">Primary Button</button>
            <div class="card" style="margin-top: 20px; background: #2a2a2a;">
              <div class="card-body">
                <h3>Card in Dark Theme</h3>
                <p>Card content with dark theme styling.</p>
              </div>
            </div>
          </div>
        `;
      });
      
      await visualManager.compareScreenshot('theme-dark');
    });
  });

  test.describe('Loading and Empty States', () => {
    test('loading states', async ({ page }) => {
      await page.goto('/');
      
      await page.evaluate(() => {
        document.body.innerHTML = `
          <div style="padding: 20px; background: white;">
            <h2>Loading States</h2>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px; margin-top: 20px;">
              <div>
                <h3>Skeleton Loaders</h3>
                <div class="skeleton" style="height: 20px; width: 200px; margin-bottom: 10px;"></div>
                <div class="skeleton" style="height: 20px; width: 150px; margin-bottom: 10px;"></div>
                <div class="skeleton" style="height: 60px; width: 100%; margin-bottom: 20px;"></div>
                <div class="skeleton skeleton-card" style="height: 120px; width: 100%;"></div>
              </div>
              <div>
                <h3>Spinners</h3>
                <div style="display: flex; gap: 20px; align-items: center;">
                  <div class="spinner spinner-sm"></div>
                  <div class="spinner"></div>
                  <div class="spinner spinner-lg"></div>
                </div>
                <div style="margin-top: 20px;">
                  <button class="btn btn-primary" disabled>
                    <span class="spinner spinner-sm"></span>
                    Loading...
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      });
      
      await visualManager.compareScreenshot('loading-states');
    });

    test('empty states', async ({ page }) => {
      await page.goto('/');
      
      await page.evaluate(() => {
        document.body.innerHTML = `
          <div style="padding: 20px; background: white;">
            <h2>Empty States</h2>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px; margin-top: 20px;">
              <div class="empty-state">
                <div class="empty-state-icon">📁</div>
                <h3>No Documents</h3>
                <p>You haven't uploaded any documents yet.</p>
                <button class="btn btn-primary">Upload Document</button>
              </div>
              <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <h3>No Results Found</h3>
                <p>Try adjusting your search criteria.</p>
                <button class="btn btn-secondary">Clear Filters</button>
              </div>
            </div>
          </div>
        `;
      });
      
      await visualManager.compareScreenshot('empty-states');
    });
  });

  test.afterEach(async () => {
    // Clean up any test artifacts
    await visualManager.cleanup();
  });
});