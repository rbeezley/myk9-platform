import { Page, expect } from '@playwright/test';

export class TestSetup {
  constructor(protected page: Page) {}

  /**
   * Sign in as a test user
   */
  async signIn(role: 'admin' | 'secretary' | 'user' | 'judge' = 'admin') {
    console.log(`Signing in as ${role}...`);
    
    // Navigate to sign-in page and wait for it to load
    await this.page.goto('/sign-in', { 
      waitUntil: 'networkidle',
      timeout: 15000 
    });
    
    // Use actual test credentials from testUsers.ts
    const credentials = {
      admin: { email: 'testadmin@example.com', password: 'Test123!' },
      secretary: { email: 'testsecretary@example.com', password: 'Test123!' },
      user: { email: 'testexhibitor@example.com', password: 'Test123!' },
      judge: { email: 'testjudge@example.com', password: 'Test123!' }
    };

    const creds = credentials[role];
    console.log(`Using credentials: ${creds.email}`);
    
    // Wait for the email input to be visible before filling
    await this.page.waitForSelector('[data-testid="email-input"]', { 
      state: 'visible',
      timeout: 10000 
    });
    
    await this.page.fill('[data-testid="email-input"]', creds.email);
    await this.page.fill('[data-testid="password-input"]', creds.password);
    
    console.log('Clicking sign in button...');
    await this.page.click('[data-testid="sign-in-button"]');
    
    console.log('Waiting for navigation to home page...');
    
    try {
      // First try to wait for URL change with longer timeout
      await this.page.waitForURL('/', { timeout: 30000 });
      console.log('URL changed to home page');
    } catch {
      console.log('URL wait failed, checking if we navigated elsewhere...');
      const currentUrl = this.page.url();
      console.log(`Current URL: ${currentUrl}`);
      
      // If we're not on sign-in page, we might have been redirected to a role-specific page
      if (!currentUrl.includes('/sign-in')) {
        console.log('Navigation successful to:', currentUrl);
      } else {
        throw new Error(`Authentication failed - timeout waiting for navigation. Current URL: ${currentUrl}`);
      }
    }
    
    // Wait for the page to fully load after authentication
    await this.page.waitForLoadState('networkidle', { timeout: 15000 });
    
    // Wait for any loading spinners to disappear
    try {
      await this.page.waitForSelector('[data-testid="loading-spinner"]', { 
        state: 'hidden', 
        timeout: 5000 
      });
      console.log('Loading spinner hidden');
    } catch {
      // No spinner found, continue
      console.log('No loading spinner detected');
    }
    
    // Wait for any authentication-related loading to complete
    await this.page.waitForTimeout(2000);
    
    // Verify authentication was successful
    const finalUrl = this.page.url();
    if (finalUrl.includes('/sign-in')) {
      throw new Error('Authentication failed - still on sign-in page');
    }
    
    console.log(`Successfully signed in! Final URL: ${finalUrl}`);
  }

  /**
   * Navigate to admin template management
   */
  async goToTemplateManagement() {
    await this.page.goto('/admin/templates');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to class creation for a trial
   */
  async goToClassCreation(trialId: string = 'trial-123') {
    await this.page.goto(`/trials/${trialId}/classes/create`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Create a test template via UI
   */
  async createTestTemplate(templateName: string = 'E2E Test Template') {
    await this.goToTemplateManagement();
    
    // Click create template button
    await this.page.click('[data-testid="create-template-button"]');
    
    // Fill template basic info
    await this.page.fill('[data-testid="template-name"]', templateName);
    await this.page.selectOption('[data-testid="organization-select"]', 'AKC');
    await this.page.selectOption('[data-testid="show-type-select"]', 'SCENT_WORK');
    await this.page.fill('[data-testid="template-description"]', 'E2E test template description');
    
    // Add a simple field
    await this.page.click('[data-testid="add-field-button"]');
    await this.page.fill('[data-testid="field-name-0"]', 'maxEntries');
    await this.page.selectOption('[data-testid="field-type-0"]', 'admin-set');
    await this.page.selectOption('[data-testid="data-type-0"]', 'number');
    await this.page.fill('[data-testid="display-name-0"]', 'Maximum Entries');
    await this.page.fill('[data-testid="default-value-0"]', '30');
    
    // Save template
    await this.page.click('[data-testid="save-template-button"]');
    
    // Wait for success message
    await expect(this.page.locator('[data-testid="success-message"]')).toBeVisible();
    
    return templateName;
  }

  /**
   * Clear all test data
   */
  async clearTestData() {
    // Clear localStorage with error handling for cross-origin issues
    await this.page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {
        // Handle cases where localStorage is not accessible (like file:// protocol or cross-origin)
        console.log('Cannot clear storage:', e);
      }
    });
  }

  /**
   * Wait for loading to complete
   */
  async waitForLoading() {
    // Wait for any loading spinners to disappear
    await this.page.waitForSelector('[data-testid="loading-spinner"]', { 
      state: 'hidden', 
      timeout: 5000 
    }).catch(() => {
      // Ignore if no loading spinner exists
    });
    
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Take a screenshot with timestamp
   */
  async takeScreenshot(name: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await this.page.screenshot({ 
      path: `test-results/screenshots/${name}-${timestamp}.png`,
      fullPage: true 
    });
  }

  /**
   * Check for console errors
   */
  async checkConsoleErrors() {
    const errors: string[] = [];
    
    this.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    return errors;
  }

  /**
   * Mock API responses for testing
   */
  async mockApiResponses() {
    // Mock successful authentication
    await this.page.route('**/auth/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: '1', email: 'test@example.com', role: 'admin' },
          token: 'mock-token'
        })
      });
    });

    // Mock dog search API
    await this.page.route('**/api/dogs/search**', async (route) => {
      const url = new URL(route.request().url());
      const query = url.searchParams.get('q') || '';
      
      const dogs = await this.page.evaluate(() => {
        const stored = localStorage.getItem('test_dogs');
        return stored ? JSON.parse(stored) : [];
      });
      
      interface MockDog {
        callName: string;
        registeredName: string;
        breed: string;
      }
      
      const filtered = (dogs as MockDog[]).filter((dog: MockDog) => 
        dog.callName.toLowerCase().includes(query.toLowerCase()) ||
        dog.registeredName.toLowerCase().includes(query.toLowerCase()) ||
        dog.breed.toLowerCase().includes(query.toLowerCase())
      );
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(filtered)
      });
    });

    // Mock registration API
    await this.page.route('**/api/registrations**', async (route) => {
      const method = route.request().method();
      
      if (method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ 
            success: true, 
            id: `reg-${Date.now()}`,
            confirmationNumber: `CONF-${Math.random().toString(36).substr(2, 8).toUpperCase()}`
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      }
    });

    // Mock payment API
    await this.page.route('**/api/payments/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ 
          success: true,
          transactionId: `txn-${Date.now()}`
        })
      });
    });

    // Mock handlers API
    await this.page.route('**/api/handlers/search**', async (route) => {
      const handlers = [
        { id: 'handler-1', name: 'Professional Handler 1', phone: '555-0001' },
        { id: 'handler-2', name: 'Professional Handler 2', phone: '555-0002' },
        { id: 'handler-3', name: 'John Smith', phone: '555-0003' }
      ];
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(handlers)
      });
    });

    // Mock template API endpoints
    await this.page.route('**/api/templates/**', async (route) => {
      const method = route.request().method();
      
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      }
    });
  }
}