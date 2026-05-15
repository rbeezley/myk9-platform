import { Page, expect } from '@playwright/test';
import { logger } from '@/services/LoggingService';
import { TEST_USERS, type TestUser } from './testUsers';

type TestRole = 'admin' | 'secretary' | 'user' | 'judge';

const ROLE_USERS: Record<TestRole, TestUser> = {
  admin: TEST_USERS.SITE_ADMIN,
  secretary: TEST_USERS.SECRETARY,
  user: TEST_USERS.EXHIBITOR,
  judge: TEST_USERS.JUDGE,
};

export class TestSetup {
  constructor(protected page: Page) {}

  /**
   * Sign in as a test user
   */
  async signIn(role: TestRole = 'admin', returnTo = '/') {
    logger.debug(`Signing in as ${role}...`, 'app', {});

    const params = new URLSearchParams({ returnTo });
    await this.page.goto(`/sign-in?${params.toString()}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    const creds = ROLE_USERS[role];
    if (!creds.password) {
      throw new Error(`Missing password for ${role} test user ${creds.email}`);
    }

    logger.debug(`Using credentials: ${creds.email}`, 'app', {});

    await expect(this.page.getByTestId('email-input')).toBeVisible({ timeout: 15000 });
    await this.page.getByTestId('email-input').fill(creds.email);
    await this.page.getByTestId('password-input').fill(creds.password);

    logger.debug('Clicking sign in button...', 'app', {});
    await this.page.getByTestId('sign-in-button').click();
    await this.page.waitForURL(url => !url.pathname.includes('/sign-in'), { timeout: 15000 });
    await this.page.waitForLoadState('domcontentloaded');

    await expect
      .poll(
        async () =>
          await this.page.evaluate(async () => {
            const { supabase } = await import('/src/services/database/supabaseClient.ts');
            const { data } = await supabase.auth.getUser();
            return data.user?.email ?? null;
          }),
        { timeout: 15000 }
      )
      .toBe(creds.email);

    // Wait for any loading spinners to disappear
    await this.page
      .waitForSelector('[data-testid="loading-spinner"]', {
        state: 'hidden',
        timeout: 5000,
      })
      .catch(() => {
        logger.debug('No loading spinner detected', 'app', {});
      });

    await expect(this.page).not.toHaveURL(/\/sign-in/);

    const finalUrl = this.page.url();
    logger.debug(`Successfully signed in! Final URL: ${finalUrl}`, 'app', {});
  }

  /**
   * Navigate to admin template management
   */
  async goToTemplateManagement() {
    await this.page.goto('/admin/templates');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Navigate to class creation for a trial
   */
  async goToClassCreation(trialId: string = 'trial-123') {
    await this.page.goto(`/trials/${trialId}/classes/create`);
    await this.page.waitForLoadState('domcontentloaded');
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
      } catch {
        // Handle cases where localStorage is not accessible (like file:// protocol or cross-origin)
      }
    });
  }

  /**
   * Wait for loading to complete
   */
  async waitForLoading() {
    // Wait for any loading spinners to disappear
    await this.page
      .waitForSelector('[data-testid="loading-spinner"]', {
        state: 'hidden',
        timeout: 5000,
      })
      .catch(() => {
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
      fullPage: true,
    });
  }

  /**
   * Check for console errors
   */
  async checkConsoleErrors() {
    const errors: string[] = [];

    this.page.on('console', msg => {
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
    // Mock dog search API
    await this.page.route('**/api/dogs/search**', async route => {
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

      const filtered = (dogs as MockDog[]).filter(
        (dog: MockDog) =>
          dog.callName.toLowerCase().includes(query.toLowerCase()) ||
          dog.registeredName.toLowerCase().includes(query.toLowerCase()) ||
          dog.breed.toLowerCase().includes(query.toLowerCase())
      );

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(filtered),
      });
    });

    // Mock registration API
    await this.page.route('**/api/registrations**', async route => {
      const method = route.request().method();

      if (method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            id: `reg-${Date.now()}`,
            confirmationNumber: `CONF-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
    });

    // Mock payment API
    await this.page.route('**/api/payments/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          transactionId: `txn-${Date.now()}`,
        }),
      });
    });

    // Mock handlers API
    await this.page.route('**/api/handlers/search**', async route => {
      const handlers = [
        { id: 'handler-1', name: 'Professional Handler 1', phone: '555-0001' },
        { id: 'handler-2', name: 'Professional Handler 2', phone: '555-0002' },
        { id: 'handler-3', name: 'John Smith', phone: '555-0003' },
      ];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(handlers),
      });
    });

    // Mock template API endpoints
    await this.page.route('**/api/templates/**', async route => {
      const method = route.request().method();

      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }
    });
  }
}
