import { test, expect } from '@playwright/test';
import { TestSetup } from '../helpers/testSetup';

test.describe('Secretary Class Creation Workflow', () => {
  let testSetup: TestSetup;

  test.beforeEach(async ({ page }) => {
    testSetup = new TestSetup(page);
    await testSetup.clearTestData();
    await testSetup.mockApiResponses();
    await testSetup.signIn('secretary');
  });

  test('should complete full class creation workflow', async ({ page }) => {
    await testSetup.goToClassCreation();
    
    // Step 1: Select Organization and Template
    await expect(page.locator('[data-testid="step-indicator"]')).toContainText('Step 1 of 4');
    
    await page.selectOption('[data-testid="organization-select"]', 'AKC');
    await page.waitForTimeout(500); // Wait for show types to load
    
    await page.selectOption('[data-testid="show-type-select"]', 'SCENT_WORK');
    await page.waitForTimeout(500); // Wait for templates to load
    
    await page.click('[data-testid="template-akc-scent-work"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Step 2: Select Classes
    await expect(page.locator('[data-testid="step-indicator"]')).toContainText('Step 2 of 4');
    
    // Select some classes
    await page.check('[data-testid="class-checkbox-Container-Novice-A"]');
    await page.check('[data-testid="class-checkbox-Container-Advanced-A"]');
    await page.check('[data-testid="class-checkbox-Buried-Novice-A"]');
    
    // Verify selection count
    await expect(page.locator('[data-testid="selected-count"]')).toContainText('3 selected');
    
    await page.click('[data-testid="next-step-button"]');
    
    // Step 3: Override Field Values
    await expect(page.locator('[data-testid="step-indicator"]')).toContainText('Step 3 of 4');
    
    // Override some values
    await page.fill('[data-testid="override-maxEntries"]', '35');
    await page.fill('[data-testid="override-preEntryFee"]', '28');
    await page.fill('[data-testid="override-estimatedJudgingTime"]', '50');
    
    await page.click('[data-testid="next-step-button"]');
    
    // Step 4: Review and Create
    await expect(page.locator('[data-testid="step-indicator"]')).toContainText('Step 4 of 4');
    
    // Verify summary shows correct information
    await expect(page.locator('[data-testid="summary-class-count"]')).toContainText('3 classes');
    await expect(page.locator('[data-testid="summary-override-maxEntries"]')).toContainText('35');
    
    // Create classes
    await page.click('[data-testid="create-classes-button"]');
    
    // Verify success
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="created-classes-count"]')).toContainText('3 classes created');
  });

  test('should allow bulk class selection', async ({ page }) => {
    await testSetup.goToClassCreation();
    
    // Navigate to class selection step
    await page.selectOption('[data-testid="organization-select"]', 'AKC');
    await page.selectOption('[data-testid="show-type-select"]', 'SCENT_WORK');
    await page.click('[data-testid="template-akc-scent-work"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Test select all
    await page.click('[data-testid="select-all-button"]');
    const allCheckboxes = page.locator('[data-testid^="class-checkbox-"]');
    const checkedCount = await allCheckboxes.filter({ hasText: /:checked/ }).count();
    const totalCount = await allCheckboxes.count();
    expect(checkedCount).toBe(totalCount);
    
    // Test deselect all
    await page.click('[data-testid="deselect-all-button"]');
    const uncheckedCount = await allCheckboxes.filter({ hasText: /:not\(:checked\)/ }).count();
    expect(uncheckedCount).toBe(totalCount);
    
    // Test select by element
    await page.click('[data-testid="select-by-element-Container"]');
    const containerClasses = page.locator('[data-testid^="class-checkbox-Container"]');
    const containerChecked = await containerClasses.filter({ hasText: /:checked/ }).count();
    const containerTotal = await containerClasses.count();
    expect(containerChecked).toBe(containerTotal);
    
    // Test select by level
    await page.click('[data-testid="deselect-all-button"]'); // Clear first
    await page.click('[data-testid="select-by-level-Novice"]');
    const noviceClasses = page.locator('[data-testid*="Novice"]');
    const noviceChecked = await noviceClasses.filter({ hasText: /:checked/ }).count();
    expect(noviceChecked).toBeGreaterThan(0);
  });

  test('should filter and search classes', async ({ page }) => {
    await testSetup.goToClassCreation();
    
    // Navigate to class selection step
    await page.selectOption('[data-testid="organization-select"]', 'AKC');
    await page.selectOption('[data-testid="show-type-select"]', 'SCENT_WORK');
    await page.click('[data-testid="template-akc-scent-work"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Test search functionality
    await page.fill('[data-testid="class-search"]', 'Container');
    await page.waitForTimeout(300); // Debounce delay
    
    const visibleClasses = page.locator('[data-testid^="class-card-"]:visible');
    const visibleCount = await visibleClasses.count();
    
    // All visible classes should contain 'Container'
    for (let i = 0; i < visibleCount; i++) {
      const classText = await visibleClasses.nth(i).textContent();
      expect(classText).toContain('Container');
    }
    
    // Test element filter
    await page.fill('[data-testid="class-search"]', ''); // Clear search
    await page.selectOption('[data-testid="element-filter"]', 'Buried');
    await page.waitForTimeout(300);
    
    const buriedClasses = page.locator('[data-testid^="class-card-"]:visible');
    const buriedCount = await buriedClasses.count();
    
    for (let i = 0; i < buriedCount; i++) {
      const classText = await buriedClasses.nth(i).textContent();
      expect(classText).toContain('Buried');
    }
  });

  test('should validate field overrides', async ({ page }) => {
    await testSetup.goToClassCreation();
    
    // Navigate to override step
    await page.selectOption('[data-testid="organization-select"]', 'AKC');
    await page.selectOption('[data-testid="show-type-select"]', 'SCENT_WORK');
    await page.click('[data-testid="template-akc-scent-work"]');
    await page.click('[data-testid="next-step-button"]');
    
    await page.check('[data-testid="class-checkbox-Container-Novice-A"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Test invalid numeric input
    await page.fill('[data-testid="override-maxEntries"]', 'not a number');
    await page.click('[data-testid="next-step-button"]');
    
    // Should show validation error
    await expect(page.locator('[data-testid="error-maxEntries"]')).toContainText('must be a number');
    
    // Test negative values where not allowed
    await page.fill('[data-testid="override-maxEntries"]', '-5');
    await page.click('[data-testid="next-step-button"]');
    
    await expect(page.locator('[data-testid="error-maxEntries"]')).toContainText('must be positive');
    
    // Test valid input
    await page.fill('[data-testid="override-maxEntries"]', '25');
    await page.click('[data-testid="next-step-button"]');
    
    // Should proceed to next step
    await expect(page.locator('[data-testid="step-indicator"]')).toContainText('Step 4 of 4');
  });

  test('should handle conditional field display', async ({ page }) => {
    await testSetup.goToClassCreation();
    
    // Navigate to override step
    await page.selectOption('[data-testid="organization-select"]', 'AKC');
    await page.selectOption('[data-testid="show-type-select"]', 'SCENT_WORK');
    await page.click('[data-testid="template-akc-scent-work"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Select Interior class (which should have multiple time limits)
    await page.check('[data-testid="class-checkbox-Interior-Excellent-A"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Verify time limit fields appear based on search areas
    await expect(page.locator('[data-testid="override-timeLimit1"]')).toBeVisible();
    await expect(page.locator('[data-testid="override-timeLimit2"]')).toBeVisible();
    
    // Change search areas to 1
    await page.fill('[data-testid="override-searchAreas"]', '1');
    await page.waitForTimeout(300);
    
    // Should hide second time limit
    await expect(page.locator('[data-testid="override-timeLimit2"]')).not.toBeVisible();
  });

  test('should show field help and validation messages', async ({ page }) => {
    await testSetup.goToClassCreation();
    
    // Navigate to override step
    await page.selectOption('[data-testid="organization-select"]', 'AKC');
    await page.selectOption('[data-testid="show-type-select"]', 'SCENT_WORK');
    await page.click('[data-testid="template-akc-scent-work"]');
    await page.click('[data-testid="next-step-button"]');
    
    await page.check('[data-testid="class-checkbox-Container-Novice-A"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Test help icon functionality
    await page.hover('[data-testid="help-icon-maxEntries"]');
    await expect(page.locator('[data-testid="help-tooltip"]')).toBeVisible();
    await expect(page.locator('[data-testid="help-tooltip"]')).toContainText('Maximum number of entries');
    
    // Test field descriptions
    await expect(page.locator('[data-testid="field-description-maxEntries"]')).toBeVisible();
  });

  test('should handle workflow navigation', async ({ page }) => {
    await testSetup.goToClassCreation();
    
    // Complete first step
    await page.selectOption('[data-testid="organization-select"]', 'AKC');
    await page.selectOption('[data-testid="show-type-select"]', 'SCENT_WORK');
    await page.click('[data-testid="template-akc-scent-work"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Complete second step
    await page.check('[data-testid="class-checkbox-Container-Novice-A"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Test back navigation
    await page.click('[data-testid="previous-step-button"]');
    await expect(page.locator('[data-testid="step-indicator"]')).toContainText('Step 2 of 4');
    
    // Verify state is preserved
    await expect(page.locator('[data-testid="class-checkbox-Container-Novice-A"]')).toBeChecked();
    
    // Test skip functionality (if no overrides needed)
    await page.click('[data-testid="next-step-button"]');
    await page.click('[data-testid="skip-overrides-button"]');
    await expect(page.locator('[data-testid="step-indicator"]')).toContainText('Step 4 of 4');
  });

  test('should show progress and estimated completion time', async ({ page }) => {
    await testSetup.goToClassCreation();
    
    // Progress should start at 0%
    await expect(page.locator('[data-testid="progress-bar"]')).toHaveAttribute('aria-valuenow', '0');
    
    // Complete step 1
    await page.selectOption('[data-testid="organization-select"]', 'AKC');
    await page.selectOption('[data-testid="show-type-select"]', 'SCENT_WORK');
    await page.click('[data-testid="template-akc-scent-work"]');
    await page.click('[data-testid="next-step-button"]');
    
    // Progress should be 25%
    await expect(page.locator('[data-testid="progress-bar"]')).toHaveAttribute('aria-valuenow', '25');
    
    // Select multiple classes and check estimated time
    await page.check('[data-testid="class-checkbox-Container-Novice-A"]');
    await page.check('[data-testid="class-checkbox-Container-Advanced-A"]');
    await page.check('[data-testid="class-checkbox-Buried-Novice-A"]');
    
    // Should show estimated judging time
    await expect(page.locator('[data-testid="estimated-time"]')).toContainText(/\d+ minutes total judging time/);
  });

  test('should handle errors gracefully', async ({ page }) => {
    await testSetup.goToClassCreation();
    
    // Try to proceed without selecting organization
    await page.click('[data-testid="next-step-button"]');
    
    // Should show validation error
    await expect(page.locator('[data-testid="error-organization"]')).toBeVisible();
    await expect(page.locator('[data-testid="step-indicator"]')).toContainText('Step 1 of 4');
    
    // Try to proceed to class creation without selecting classes
    await page.selectOption('[data-testid="organization-select"]', 'AKC');
    await page.selectOption('[data-testid="show-type-select"]', 'SCENT_WORK');
    await page.click('[data-testid="template-akc-scent-work"]');
    await page.click('[data-testid="next-step-button"]');
    
    await page.click('[data-testid="next-step-button"]'); // Try to skip class selection
    
    await expect(page.locator('[data-testid="error-no-classes"]')).toContainText('Please select at least one class');
  });

  test('should save progress and allow resume', async ({ page }) => {
    await testSetup.goToClassCreation();
    
    // Complete partial workflow
    await page.selectOption('[data-testid="organization-select"]', 'AKC');
    await page.selectOption('[data-testid="show-type-select"]', 'SCENT_WORK');
    await page.click('[data-testid="template-akc-scent-work"]');
    await page.click('[data-testid="next-step-button"]');
    
    await page.check('[data-testid="class-checkbox-Container-Novice-A"]');
    
    // Navigate away and come back
    await page.goto('/');
    await testSetup.goToClassCreation();
    
    // Should resume from where left off
    await expect(page.locator('[data-testid="step-indicator"]')).toContainText('Step 2 of 4');
    await expect(page.locator('[data-testid="class-checkbox-Container-Novice-A"]')).toBeChecked();
  });
});