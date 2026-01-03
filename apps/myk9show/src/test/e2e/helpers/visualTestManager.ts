import { Page, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export class VisualTestManager {
  private page: Page;
  private baselineDir: string;
  private actualDir: string;
  private diffDir: string;

  constructor(page: Page) {
    this.page = page;
    this.baselineDir = path.join(process.cwd(), 'test-results', 'visual-baselines');
    this.actualDir = path.join(process.cwd(), 'test-results', 'visual-actual');
    this.diffDir = path.join(process.cwd(), 'test-results', 'visual-diffs');
    
    this.ensureDirectories();
  }

  /**
   * Ensure all necessary directories exist
   */
  private ensureDirectories() {
    [this.baselineDir, this.actualDir, this.diffDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Take a screenshot and compare with baseline
   */
  async compareScreenshot(
    name: string, 
    options: {
      fullPage?: boolean;
      threshold?: number;
      maxDiffPixels?: number;
      mode?: 'pixel' | 'layout';
      animations?: 'disabled' | 'allow';
      maskSelectors?: string[];
    } = {}
  ) {
    const defaultOptions = {
      fullPage: true,
      threshold: 0.2,
      maxDiffPixels: 1000,
      mode: 'pixel' as const,
      animations: 'disabled' as const,
      ...options
    };

    // Mask dynamic content
    if (defaultOptions.maskSelectors) {
      for (const selector of defaultOptions.maskSelectors) {
        await this.page.locator(selector).first().screenshot({ 
          mask: [this.page.locator(selector)] 
        });
      }
    }

    await expect(this.page).toHaveScreenshot(`${name}.png`, defaultOptions);
  }

  /**
   * Take element screenshot and compare with baseline
   */
  async compareElementScreenshot(
    selector: string,
    name: string,
    options: {
      threshold?: number;
      maxDiffPixels?: number;
      mask?: string[];
    } = {}
  ) {
    const element = this.page.locator(selector);
    await expect(element).toBeVisible();
    
    const defaultOptions = {
      threshold: 0.2,
      maxDiffPixels: 500,
      ...options
    };

    if (options.mask) {
      const maskLocators = options.mask.map(s => this.page.locator(s));
      await expect(element).toHaveScreenshot(`${name}.png`, {
        ...defaultOptions,
        mask: maskLocators
      });
    } else {
      await expect(element).toHaveScreenshot(`${name}.png`, defaultOptions);
    }
  }

  /**
   * Create baseline screenshots for first run
   */
  async createBaseline(name: string, options: Record<string, unknown> = {}) {
    const screenshotPath = path.join(this.baselineDir, `${name}.png`);
    
    if (!fs.existsSync(screenshotPath)) {
      await this.page.screenshot({
        path: screenshotPath,
        fullPage: options.fullPage ?? true,
        animations: options.animations ?? 'disabled'
      });
    }
  }

  /**
   * Update baseline with current screenshot
   */
  async updateBaseline(name: string, options: Record<string, unknown> = {}) {
    const screenshotPath = path.join(this.baselineDir, `${name}.png`);
    
    await this.page.screenshot({
      path: screenshotPath,
      fullPage: options.fullPage ?? true,
      animations: options.animations ?? 'disabled'
    });
  }

  /**
   * Mask dynamic content that changes between runs
   */
  async maskDynamicContent() {
    // Common dynamic content selectors
    const dynamicSelectors = [
      '[data-testid="timestamp"]',
      '[data-testid="generated-id"]',
      '.loading-spinner',
      '.skeleton-loader',
      '[data-testid="random-content"]',
      '.date-now',
      '.time-now'
    ];

    // Hide dynamic content
    await this.page.addStyleTag({
      content: `
        ${dynamicSelectors.join(', ')} {
          visibility: hidden !important;
        }
      `
    });
  }

  /**
   * Prepare page for consistent screenshots
   */
  async preparePage() {
    // Disable animations
    await this.page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
          scroll-behavior: auto !important;
        }
        
        .loading-spinner,
        .skeleton-loader {
          display: none !important;
        }
      `
    });

    // Wait for fonts
    await this.page.waitForFunction(() => document.fonts.ready);

    // Wait for images
    await this.page.waitForFunction(() => {
      const images = Array.from(document.images);
      return images.every(img => img.complete);
    });

    // Mask dynamic content
    await this.maskDynamicContent();

    // Small delay for stability
    await this.page.waitForTimeout(300);
  }

  /**
   * Compare multiple viewports
   */
  async compareViewports(
    name: string,
    viewports: Array<{ width: number; height: number; name: string }>
  ) {
    for (const viewport of viewports) {
      await this.page.setViewportSize({ width: viewport.width, height: viewport.height });
      await this.page.waitForTimeout(300);
      await this.compareScreenshot(`${name}-${viewport.name}`);
    }
  }

  /**
   * Generate visual test report
   */
  async generateReport() {
    const reportPath = path.join(process.cwd(), 'test-results', 'visual-report.html');
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Visual Regression Test Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          .test-result { margin: 20px 0; padding: 20px; border: 1px solid #ddd; }
          .passed { border-color: green; }
          .failed { border-color: red; }
          img { max-width: 300px; margin: 10px; }
          .comparison { display: flex; gap: 20px; }
          .comparison div { text-align: center; }
        </style>
      </head>
      <body>
        <h1>Visual Regression Test Report</h1>
        <p>Generated on: ${new Date().toISOString()}</p>
        
        <h2>Test Results</h2>
        <div id="results">
          <!-- Results will be populated by the test runner -->
        </div>
        
        <h2>Usage Instructions</h2>
        <p>To review and approve changes:</p>
        <ol>
          <li>Review the differences shown below</li>
          <li>If changes are expected, run: <code>npm run test:visual:update</code></li>
          <li>If changes are unexpected, fix the issues and re-run tests</li>
        </ol>
      </body>
      </html>
    `;

    fs.writeFileSync(reportPath, html);
    return reportPath;
  }

  /**
   * Get list of failed visual tests
   */
  getFailedTests(): string[] {
    const diffFiles = fs.existsSync(this.diffDir) 
      ? fs.readdirSync(this.diffDir).filter(f => f.endsWith('.png'))
      : [];
    
    return diffFiles.map(f => f.replace('.png', ''));
  }

  /**
   * Approve visual changes (update baselines)
   */
  async approveChanges(testNames?: string[]) {
    const actualFiles = fs.existsSync(this.actualDir) 
      ? fs.readdirSync(this.actualDir).filter(f => f.endsWith('.png'))
      : [];

    for (const file of actualFiles) {
      const testName = file.replace('.png', '');
      
      if (!testNames || testNames.includes(testName)) {
        const actualPath = path.join(this.actualDir, file);
        const baselinePath = path.join(this.baselineDir, file);
        
        // Copy actual to baseline
        fs.copyFileSync(actualPath, baselinePath);
        
        // Remove diff if it exists
        const diffPath = path.join(this.diffDir, file);
        if (fs.existsSync(diffPath)) {
          fs.unlinkSync(diffPath);
        }
      }
    }
  }

  /**
   * Clean up old test artifacts
   */
  cleanup() {
    // Remove old actual and diff files
    [this.actualDir, this.diffDir].forEach(dir => {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const filePath = path.join(dir, file);
          fs.unlinkSync(filePath);
        });
      }
    });
  }

  /**
   * Cross-browser comparison
   */
  async compareCrossBrowser(
    name: string,
    browsers: string[],
    callback: () => Promise<void>
  ) {
    for (const browser of browsers) {
      await callback();
      await this.compareScreenshot(`${name}-${browser}`);
    }
  }

  /**
   * Theme comparison
   */
  async compareThemes(
    name: string,
    themes: string[],
    switchTheme: (theme: string) => Promise<void>
  ) {
    for (const theme of themes) {
      await switchTheme(theme);
      await this.page.waitForTimeout(300);
      await this.compareScreenshot(`${name}-${theme}`);
    }
  }
}