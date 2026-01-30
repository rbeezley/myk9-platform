import { Page, expect } from '@playwright/test';
import { TEST_USERS, TEST_PASSWORD, TestUserRole } from '../fixtures/test-users';

export class LoginPage {
  constructor(private page: Page) {}

  // Locators - matching actual SignInPage.tsx
  private get emailInput() {
    return this.page.locator('[data-testid="email-input"]');
  }

  private get passwordInput() {
    return this.page.locator('[data-testid="password-input"]');
  }

  private get submitButton() {
    return this.page.locator('[data-testid="sign-in-button"]');
  }

  private get errorMessage() {
    return this.page.locator('.text-destructive');
  }

  private get signInHeading() {
    return this.page.locator('h2:has-text("Sign in")');
  }

  // Actions
  async goto() {
    await this.page.goto('/sign-in');
    await this.page.waitForLoadState('networkidle');
    // Wait for the form to be visible
    await this.signInHeading.waitFor({ state: 'visible', timeout: 10000 });
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  /**
   * Login as a specific test user role
   * Test users must be created first: node scripts/setup-e2e-test-users.js
   */
  async loginAs(role: TestUserRole) {
    const user = TEST_USERS[role];
    await this.login(user.email, TEST_PASSWORD);
    // Wait for redirect away from sign-in page (app redirects to home after login)
    await this.page.waitForURL(url => !url.pathname.includes('sign-in'), { timeout: 15000 });
  }

  async loginAsSecretary() {
    await this.loginAs('secretary');
  }

  async loginAsExhibitor() {
    await this.loginAs('exhibitor');
  }

  async loginAsJudge() {
    await this.loginAs('judge');
  }

  async loginAsAdmin() {
    await this.loginAs('siteAdmin');
  }

  async loginAsClubAdmin() {
    await this.loginAs('clubAdmin');
  }

  // Assertions
  async expectErrorMessage(text?: string) {
    await expect(this.errorMessage).toBeVisible();
    if (text) {
      await expect(this.errorMessage).toContainText(text);
    }
  }

  async expectToBeOnLoginPage() {
    await expect(this.page).toHaveURL(/\/sign-in/);
  }
}
