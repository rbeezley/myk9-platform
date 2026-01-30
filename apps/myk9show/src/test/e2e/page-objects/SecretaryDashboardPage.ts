import { Page, expect } from '@playwright/test';

export class SecretaryDashboardPage {
  constructor(private page: Page) {}

  // Locators
  private get createShowButton() {
    return this.page.locator('button:has-text("Create Show"), a:has-text("Create Show"), [data-testid="create-show-button"]');
  }

  private get showsList() {
    return this.page.locator('[data-testid="shows-list"], .shows-list, [class*="show-card"]');
  }

  private get pageTitle() {
    return this.page.locator('h1, [data-testid="page-title"]');
  }

  // Actions
  async goto() {
    await this.page.goto('/secretary/dashboard');
    await this.page.waitForLoadState('networkidle');
  }

  async clickCreateShow() {
    await this.createShowButton.click();
    // Wait for navigation to wizard
    await this.page.waitForURL(/\/secretary\/create-show/, { timeout: 10000 });
  }

  async openShow(showName: string) {
    await this.page.locator(`text=${showName}`).first().click();
  }

  // Assertions
  async expectToBeOnDashboard() {
    await expect(this.page).toHaveURL(/\/secretary\/dashboard/);
  }

  async expectShowInList(showName: string) {
    await expect(this.page.locator(`text=${showName}`).first()).toBeVisible();
  }

  async expectCreateShowButtonVisible() {
    await expect(this.createShowButton).toBeVisible();
  }
}
