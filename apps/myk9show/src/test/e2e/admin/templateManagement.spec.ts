import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Admin Template Management', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
    // Temporarily remove mock API calls to test authentication
    // await testSetup.mockApiResponses();
    await testSetup.signIn('admin');
  });

  test('should display template management page', async ({ page }) => {
    await testSetup.goToTemplateManagement();
    
    // Check page title and main elements - simplified selectors
    await expect(page.locator('main h1')).toContainText('Template Management');
    await expect(page.getByRole('button', { name: 'Create Template' })).toBeVisible();
    await expect(page.getByPlaceholder('Search templates...')).toBeVisible();
  });

  test('should create a new template', async ({ page }) => {
    const templateName = await testSetup.createTestTemplate();
    
    // Verify template appears in list
    await testSetup.goToTemplateManagement();
    await expect(page.locator(`[data-testid="template-card-${templateName}"]`)).toBeVisible();
  });

  test('should edit an existing template', async ({ page }) => {
    const templateName = await testSetup.createTestTemplate();
    
    // Navigate back to template list
    await testSetup.goToTemplateManagement();
    
    // Click edit button for the template
    await page.click(`[data-testid="edit-template-${templateName}"]`);
    
    // Update template name
    const updatedName = `${templateName} - Updated`;
    await page.fill('[data-testid="template-name"]', updatedName);
    
    // Save changes
    await page.click('[data-testid="save-template-button"]');
    
    // Verify changes were saved
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    
    // Go back to list and verify updated name
    await testSetup.goToTemplateManagement();
    await expect(page.locator(`[data-testid="template-card-${updatedName}"]`)).toBeVisible();
  });

  test('should duplicate a template', async ({ page }) => {
    const originalName = await testSetup.createTestTemplate();
    
    await testSetup.goToTemplateManagement();
    
    // Click duplicate button
    await page.click(`[data-testid="duplicate-template-${originalName}"]`);
    
    // Fill new template name
    const duplicateName = `${originalName} - Copy`;
    await page.fill('[data-testid="duplicate-name-input"]', duplicateName);
    await page.click('[data-testid="confirm-duplicate-button"]');
    
    // Verify both templates exist
    await expect(page.locator(`[data-testid="template-card-${originalName}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="template-card-${duplicateName}"]`)).toBeVisible();
  });

  test('should delete a template', async ({ page }) => {
    const templateName = await testSetup.createTestTemplate();
    
    await testSetup.goToTemplateManagement();
    
    // Click delete button
    await page.click(`[data-testid="delete-template-${templateName}"]`);
    
    // Confirm deletion
    await page.click('[data-testid="confirm-delete-button"]');
    
    // Verify template is removed
    await expect(page.locator(`[data-testid="template-card-${templateName}"]`)).not.toBeVisible();
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
  });

  test('should search templates by name', async ({ page }) => {
    await testSetup.createTestTemplate('Scent Work Template');
    
    // Create second template
    await page.click('[data-testid="create-template-button"]');
    await page.fill('[data-testid="template-name"]', 'Agility Template');
    await page.selectOption('[data-testid="organization-select"]', 'AKC');
    await page.selectOption('[data-testid="show-type-select"]', 'AGILITY');
    await page.click('[data-testid="save-template-button"]');
    
    await testSetup.goToTemplateManagement();
    
    // Search for 'Scent'
    await page.fill('[data-testid="template-search"]', 'Scent');
    await page.waitForTimeout(500); // Debounce delay
    
    // Should show only scent work template
    await expect(page.locator('[data-testid="template-card-Scent Work Template"]')).toBeVisible();
    await expect(page.locator('[data-testid="template-card-Agility Template"]')).not.toBeVisible();
  });

  test('should filter templates by organization', async ({ page }) => {
    // Create AKC template
    await testSetup.createTestTemplate('AKC Template');
    
    // Create UKC template
    await page.click('[data-testid="create-template-button"]');
    await page.fill('[data-testid="template-name"]', 'UKC Template');
    await page.selectOption('[data-testid="organization-select"]', 'UKC');
    await page.selectOption('[data-testid="show-type-select"]', 'SCENT_WORK');
    await page.click('[data-testid="save-template-button"]');
    
    await testSetup.goToTemplateManagement();
    
    // Filter by UKC
    await page.selectOption('[data-testid="organization-filter"]', 'UKC');
    await page.waitForTimeout(300);
    
    // Should show only UKC template
    await expect(page.locator('[data-testid="template-card-UKC Template"]')).toBeVisible();
    await expect(page.locator('[data-testid="template-card-AKC Template"]')).not.toBeVisible();
  });

  test('should validate template fields', async ({ page }) => {
    await testSetup.goToTemplateManagement();
    
    // Try to create template without required fields
    await page.click('[data-testid="create-template-button"]');
    await page.click('[data-testid="save-template-button"]');
    
    // Should show validation errors
    await expect(page.locator('[data-testid="error-template-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-organization"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-show-type"]')).toBeVisible();
  });

  test('should preview template before saving', async ({ page }) => {
    await testSetup.goToTemplateManagement();
    
    await page.click('[data-testid="create-template-button"]');
    
    // Fill basic info
    await page.fill('[data-testid="template-name"]', 'Preview Test Template');
    await page.selectOption('[data-testid="organization-select"]', 'AKC');
    await page.selectOption('[data-testid="show-type-select"]', 'SCENT_WORK');
    
    // Add class definition
    await page.click('[data-testid="add-class-definition"]');
    await page.fill('[data-testid="class-element-0"]', 'Container');
    await page.fill('[data-testid="class-level-0"]', 'Novice');
    
    // Click preview button
    await page.click('[data-testid="preview-template-button"]');
    
    // Verify preview panel shows generated classes
    await expect(page.locator('[data-testid="preview-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="preview-class-Container Novice"]')).toBeVisible();
  });

  test('should export and import templates', async ({ page }) => {
    const templateName = await testSetup.createTestTemplate();
    
    await testSetup.goToTemplateManagement();
    
    // Export template
    await page.click(`[data-testid="export-template-${templateName}"]`);
    
    // Verify download started (check for download event)
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="confirm-export-button"]');
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toContain(templateName.toLowerCase().replace(/\s/g, '-'));
    
    // Test import (would require file upload simulation)
    await page.click('[data-testid="import-template-button"]');
    await expect(page.locator('[data-testid="import-dialog"]')).toBeVisible();
  });

  test('should handle template versioning', async ({ page }) => {
    const templateName = await testSetup.createTestTemplate();
    
    await testSetup.goToTemplateManagement();
    
    // Edit template to create new version
    await page.click(`[data-testid="edit-template-${templateName}"]`);
    await page.fill('[data-testid="template-description"]', 'Updated description - new version');
    await page.click('[data-testid="save-as-new-version"]');
    
    // Verify version was incremented
    await expect(page.locator('[data-testid="version-indicator"]')).toContainText('1.1.0');
    
    // Go to version history
    await page.click('[data-testid="version-history-button"]');
    await expect(page.locator('[data-testid="version-1.0.0"]')).toBeVisible();
    await expect(page.locator('[data-testid="version-1.1.0"]')).toBeVisible();
  });

  test('should test template with sample data', async ({ page }) => {
    const templateName = await testSetup.createTestTemplate();
    
    await testSetup.goToTemplateManagement();
    
    // Click test template button
    await page.click(`[data-testid="test-template-${templateName}"]`);
    
    // Should navigate to test page
    await expect(page.url()).toContain('/test');
    
    // Verify test interface is loaded
    await expect(page.locator('[data-testid="test-trial-select"]')).toBeVisible();
    await expect(page.locator('[data-testid="generate-test-classes"]')).toBeVisible();
    
    // Run test generation
    await page.selectOption('[data-testid="test-trial-select"]', 'sample-trial');
    await page.click('[data-testid="generate-test-classes"]');
    
    // Verify results
    await expect(page.locator('[data-testid="test-results"]')).toBeVisible();
    await expect(page.locator('[data-testid="generated-classes-count"]')).toContainText(/\d+ classes generated/);
  });
});