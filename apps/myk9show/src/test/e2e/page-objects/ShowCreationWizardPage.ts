import { Page, expect, Locator } from '@playwright/test';
import { format, addDays, addMonths } from 'date-fns';

export interface ShowDetails {
  name: string;
  organization: 'AKC' | 'UKC' | 'NASDA' | 'Other';
  startDate: Date;
  endDate: Date;
  location: string;
  clubName?: string;
  chairman?: string;
  secretary?: string;
  entryOpenDate?: Date;
  entryCloseDate?: Date;
  preEntryFee?: number;
  dayOfShowFee?: number;
}

export interface TrialDetails {
  name: string;
  dateTime: Date;
  eventNumber: string;
}

export class ShowCreationWizardPage {
  constructor(private page: Page) {}

  // ========== Common Locators ==========
  private get nextButton() {
    return this.page.locator('button:has-text("Next")');
  }

  private get previousButton() {
    return this.page.locator('button:has-text("Previous"), button:has-text("Back")');
  }

  // ========== Step 1: Show Details ==========

  // Find input field by its label text
  private getFieldByLabel(labelText: string): Locator {
    // Find the parent container that has the label, then find the input/select inside
    return this.page
      .locator(
        `div.space-y-2:has(label:text-is("${labelText}")) input,
                              div.space-y-2:has(label:text-is("${labelText}")) textarea,
                              div.space-y-2:has(label:text-is("${labelText}")) button[role="combobox"]`
      )
      .first();
  }

  // Find date picker button by label
  private getDatePickerByLabel(labelText: string): Locator {
    return this.page.locator(`div.space-y-2:has(label:has-text("${labelText}")) button`).first();
  }

  private get locationTextarea() {
    return this.page.locator('textarea').first();
  }

  // ========== Step 2: Trials ==========
  private get addTrialButton() {
    return this.page.locator('button:has-text("Add Trial"), button:has-text("Add First Trial")');
  }

  // ========== Step 3: Classes ==========
  private get classCheckboxes() {
    return this.page.locator('input[type="checkbox"]');
  }

  // ========== Navigation Actions ==========
  async goto() {
    await this.page.goto('/secretary/create-show/wizard');
    await this.page.waitForLoadState('networkidle');
    // Wait for the wizard form to be visible - use multiple selectors for resilience
    // Some browsers may render text differently
    try {
      await this.page.waitForSelector('text=Basic Show Information', { timeout: 15000 });
    } catch {
      // Fallback: wait for the form elements instead
      await this.page.waitForSelector(
        'label:has-text("SHOW NAME"), input[placeholder*="show"], h2:has-text("Create")',
        { timeout: 10000 }
      );
    }
  }

  // Helper to close any open popovers/modals
  private async closeAnyOpenOverlays() {
    // Check for calendar dialog first (date picker that's still open)
    const calendarDialog = this.page.locator('[role="dialog"]:has([role="grid"])');
    if (await calendarDialog.isVisible().catch(() => false)) {
      // Click outside to close - click on a heading
      const heading = this.page.locator('h2, h3').first();
      if (await heading.isVisible().catch(() => false)) {
        await heading.click({ force: true });
        await this.page.waitForTimeout(300);
      }
    }

    // Check for command palette (cmdk)
    const commandPalette = this.page.locator('[cmdk-dialog], [data-cmdk-root], [cmdk-root]');
    if (await commandPalette.isVisible().catch(() => false)) {
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(200);
      await commandPalette.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
    }

    // Check for alert dialog (like "unsaved changes" warning)
    const alertDialog = this.page.locator('[role="alertdialog"]');
    if (await alertDialog.isVisible().catch(() => false)) {
      // Click "Keep Editing" to stay in the wizard and continue
      const keepEditingButton = this.page.locator(
        '[role="alertdialog"] button:has-text("Keep Editing")'
      );
      if (await keepEditingButton.isVisible().catch(() => false)) {
        await keepEditingButton.click();
        await this.page.waitForTimeout(200);
        return;
      }
    }

    // Small wait for animations
    await this.page.waitForTimeout(50);
  }

  async goToNextStep() {
    // Wait for the Next button to be enabled
    await this.nextButton.waitFor({ state: 'visible' });
    const isDisabled = await this.nextButton.isDisabled();
    if (isDisabled) {
      throw new Error('Next button is disabled - form validation may have failed');
    }
    await this.nextButton.click();
    await this.page.waitForTimeout(500); // Allow for transition
  }

  async goToPreviousStep() {
    await this.previousButton.click();
    await this.page.waitForTimeout(500);
  }

  // ========== Step 1 Actions ==========
  async fillShowDetails(details: ShowDetails) {
    // Show Name - first input on the page
    const nameInput = this.page.locator('input').first();
    await nameInput.fill(details.name);

    // Show Type - click the Select trigger, then pick option
    await this.closeAnyOpenOverlays();
    const showTypeSelect = this.page.locator('button[role="combobox"]').first();
    await showTypeSelect.click();
    await this.page.locator(`[role="option"]:has-text("${details.organization}")`).click();
    await this.page.waitForTimeout(300); // Wait for dropdown to close

    // Start Date
    await this.closeAnyOpenOverlays();
    await this.selectDateByLabel('Start Date', details.startDate);

    // End Date
    await this.closeAnyOpenOverlays();
    await this.selectDateByLabel('End Date', details.endDate);

    // Location
    await this.closeAnyOpenOverlays();
    await this.locationTextarea.fill(details.location);

    // Club Selection - find the "Select a club" button
    await this.closeAnyOpenOverlays();
    await this.selectClub(details.clubName);

    // Chairman - find Select with "Select chairman" placeholder
    await this.closeAnyOpenOverlays();
    await this.selectFromDropdownByPlaceholder('Select chairman', details.chairman);

    // Secretary - find Select with "Select secretary" placeholder
    await this.closeAnyOpenOverlays();
    await this.selectFromDropdownByPlaceholder('Select secretary', details.secretary);

    // Entry Open Date
    if (details.entryOpenDate) {
      await this.closeAnyOpenOverlays();
      await this.selectDateByLabel('Entry Opens', details.entryOpenDate);
    }

    // Entry Close Date (may be auto-filled)
    if (details.entryCloseDate) {
      await this.closeAnyOpenOverlays();
      await this.selectDateByLabel('Entry Closes', details.entryCloseDate);
    }

    // Fees - use the number inputs
    if (details.preEntryFee !== undefined) {
      await this.closeAnyOpenOverlays();
      const preEntryInput = this.page.locator('input[type="number"]').first();
      await preEntryInput.fill(details.preEntryFee.toString());
    }

    if (details.dayOfShowFee !== undefined) {
      await this.closeAnyOpenOverlays();
      const dayOfShowInput = this.page.locator('input[type="number"]').nth(1);
      await dayOfShowInput.fill(details.dayOfShowFee.toString());
    }
  }

  private async selectDateByLabel(labelText: string, date: Date) {
    // First dismiss any alert dialogs that might be open
    await this.closeAnyOpenOverlays();

    // Map label text to button placeholder text
    const buttonTextMap: Record<string, string> = {
      'Start Date': 'Select start date',
      'End Date': 'Select end date',
      'Entry Opens': 'Select entry open date',
      'Entry Closes': 'Select entry close date',
    };

    const placeholderText = buttonTextMap[labelText] || `Select ${labelText.toLowerCase()}`;

    // Try to find the date picker button by placeholder text first
    let dateButton = this.page.locator(`button:has-text("${placeholderText}")`).first();

    // If not found (date might already be set), find by label proximity
    if (!(await dateButton.isVisible({ timeout: 1000 }).catch(() => false))) {
      // Find the label, then get the next button
      const labelSection = this.page.locator(`text="${labelText}"`).first();
      dateButton = labelSection.locator('xpath=following::button[1]');

      // Or try finding button with calendar icon near the label
      if (!(await dateButton.isVisible({ timeout: 500 }).catch(() => false))) {
        dateButton = this.page
          .locator(`text="${labelText}"`)
          .locator('xpath=../..')
          .locator('button')
          .first();
      }
    }

    // Wait for the button to be visible and click it
    await dateButton.waitFor({ state: 'visible', timeout: 5000 });
    await dateButton.click({ timeout: 10000 });
    await this.page.waitForTimeout(300);

    // Wait for calendar popover to appear
    await this.page.waitForSelector('[role="grid"]', { timeout: 5000 });

    await this.navigateToDateInCalendar(date);
  }

  private async navigateToDateInCalendar(date: Date) {
    const targetMonth = date.getMonth(); // 0-11
    const targetYear = date.getFullYear();
    const dayOfMonth = date.getDate();

    // Month names for matching
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    // Wait for the calendar to be visible
    await this.page.waitForSelector('[role="grid"]', { timeout: 5000 });

    // Navigate to the correct month using Next Month button
    for (let attempts = 0; attempts < 24; attempts++) {
      const grid = this.page.locator('[role="grid"]').first();
      const gridLabel = (await grid.getAttribute('aria-label').catch(() => '')) || '';

      // Check if we're on the right month
      if (
        gridLabel.includes(monthNames[targetMonth]) &&
        gridLabel.includes(targetYear.toString())
      ) {
        break;
      }

      // Click Next Month button - try different possible labels
      const nextButton = this.page
        .locator('button[aria-label="Next Month"], button:has-text("Next Month")')
        .first();
      if (await nextButton.isVisible().catch(() => false)) {
        await nextButton.click();
        await this.page.waitForTimeout(150);
      } else {
        break;
      }
    }

    // Now click the day button directly
    // The buttons have aria-labels like "Sunday, March 1st, 2026"
    // We need to find the button that contains our month and day

    // Format the day with ordinal suffix (1st, 2nd, 3rd, etc.)
    const getOrdinal = (n: number) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const targetDayStr = `${monthNames[targetMonth]} ${getOrdinal(dayOfMonth)}`;

    // Find the button with this date in its aria-label or text
    const dayButton = this.page.locator(`button[aria-label*="${targetDayStr}"]`).first();

    if (await dayButton.isVisible().catch(() => false)) {
      await dayButton.click();
      await this.page.waitForTimeout(200);
      return;
    }

    // Fallback: find button by text content (the day number)
    // Look inside gridcells for buttons with the day number
    const gridcellButtons = this.page.locator(`[role="gridcell"] button`);
    const count = await gridcellButtons.count();

    for (let i = 0; i < count; i++) {
      const button = gridcellButtons.nth(i);
      const buttonText = (await button.textContent().catch(() => '')) || '';
      const ariaLabel = (await button.getAttribute('aria-label').catch(() => '')) || '';

      // Check if this button is for our target day and month
      if (
        buttonText.trim() === dayOfMonth.toString() &&
        ariaLabel.includes(monthNames[targetMonth])
      ) {
        await button.click();
        await this.page.waitForTimeout(200);
        return;
      }
    }

    // Last resort: just click any visible button with the day number
    const anyDayButton = this.page.locator(`button:text-is("${dayOfMonth}")`).first();
    if (await anyDayButton.isVisible().catch(() => false)) {
      await anyDayButton.click();
      await this.page.waitForTimeout(200);
    }

    // Wait for calendar dialog to close (it should auto-close on selection)
    // If it's still open, close it by clicking outside
    const calendarDialog = this.page.locator('[role="dialog"]:has([role="grid"])');
    if (await calendarDialog.isVisible({ timeout: 500 }).catch(() => false)) {
      // Click on the page title to close the calendar (clicking outside the dialog)
      const pageTitle = this.page.locator('h2:has-text("Create New Show")');
      if (await pageTitle.isVisible().catch(() => false)) {
        await pageTitle.click({ force: true });
        await this.page.waitForTimeout(200);
      }
    }
  }

  private async selectClub(clubName?: string) {
    // Find and click the "Select a club" button
    const clubButton = this.page.locator('button:has-text("Select a club")');

    if (!(await clubButton.isVisible().catch(() => false))) {
      // Club might already be selected
      return;
    }

    await clubButton.click();
    await this.page.waitForTimeout(500); // Wait for popover and data to load

    // Wait for club list to appear
    const clubList = this.page.locator(
      '.p-3.hover\\:bg-muted, [class*="hover:bg-muted"].cursor-pointer'
    );
    await clubList
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {});

    if (clubName) {
      // Search for the club
      const searchInput = this.page.locator('input[placeholder*="Search clubs"]');
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.fill(clubName);
        await this.page.waitForTimeout(300);
      }
      // Click the matching club
      const matchingClub = this.page
        .locator(`.p-3.hover\\:bg-muted:has-text("${clubName}")`)
        .first();
      if (await matchingClub.isVisible().catch(() => false)) {
        await matchingClub.click();
        await this.page.waitForTimeout(200);
        return;
      }
    }

    // Just select the first available club from the list
    const firstClub = this.page
      .locator('.p-3.hover\\:bg-muted.cursor-pointer, .p-3[class*="hover:bg-muted"]')
      .first();
    if (await firstClub.isVisible().catch(() => false)) {
      await firstClub.click();
      await this.page.waitForTimeout(200);
    } else {
      // No clubs available - close popover and try to create one
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(100);

      // Try to use "Create New Club" button
      await this.createNewClub();
    }
  }

  /**
   * Creates a new club using the panel
   */
  private async createNewClub() {
    const createButton = this.page.locator('button:has-text("Create New Club")');
    if (!(await createButton.isVisible().catch(() => false))) {
      return; // Button not found
    }

    await createButton.click();
    await this.page.waitForTimeout(1000);

    // Wait for the panel to open - look for the panel content
    const panel = this.page.locator('[role="dialog"], .fixed.inset-y-0');
    await panel.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    // Fill in club name - look for the input with placeholder "Enter club name"
    const clubNameInput = this.page.locator('input[placeholder="Enter club name"]');
    if (await clubNameInput.isVisible().catch(() => false)) {
      await clubNameInput.fill(`E2E Test Club ${Date.now()}`);
    }

    // Fill in required email field if present
    const emailInput = this.page.locator('input[type="email"]').first();
    if (await emailInput.isVisible().catch(() => false)) {
      const existingValue = await emailInput.inputValue();
      if (!existingValue) {
        await emailInput.fill(`testclub${Date.now()}@test.myk9.com`);
      }
    }

    // Scroll to bottom of panel to find save button
    const panelContent = this.page.locator('.overflow-y-auto').first();
    if (await panelContent.isVisible().catch(() => false)) {
      await panelContent.evaluate(el => (el.scrollTop = el.scrollHeight));
      await this.page.waitForTimeout(300);
    }

    // Look for save/create button - should be at the bottom
    const saveButton = this.page
      .locator(
        'button:has-text("Save Club"), button:has-text("Create Club"), button[type="submit"]:has-text("Save")'
      )
      .first();
    if (await saveButton.isVisible().catch(() => false)) {
      await saveButton.scrollIntoViewIfNeeded();
      await this.page.waitForTimeout(200);
      await saveButton.click({ force: true });
      await this.page.waitForTimeout(2000);
    }

    // Panel should auto-close and select the new club
    await panel.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  private async selectFromDropdownByPlaceholder(placeholderText: string, value?: string) {
    const selectTrigger = this.page.locator(
      `button[role="combobox"]:has-text("${placeholderText}")`
    );
    if (!(await selectTrigger.isVisible().catch(() => false))) {
      // Try alternative selector - combobox with child text
      const altTrigger = this.page.locator(`[role="combobox"]:has-text("${placeholderText}")`);
      if (!(await altTrigger.isVisible().catch(() => false))) {
        return; // Dropdown not found, skip
      }
      await altTrigger.click();
    } else {
      await selectTrigger.click();
    }

    // Wait longer for options to load (API calls may be needed)
    await this.page.waitForTimeout(500);

    // Wait for options to appear
    const optionsLocator = this.page.locator('[role="option"], [role="listbox"] > *');
    await optionsLocator
      .first()
      .waitFor({ state: 'visible', timeout: 3000 })
      .catch(() => {});

    if (value) {
      // Find and click the option - partial match since names might vary
      const option = this.page.locator(`[role="option"]`).filter({ hasText: value }).first();
      if (await option.isVisible().catch(() => false)) {
        await option.click();
        await this.page.waitForTimeout(200);
        return;
      }
    }

    // No specific value or value not found - select the first available option
    const firstOption = this.page.locator('[role="option"]').first();
    if (await firstOption.isVisible().catch(() => false)) {
      await firstOption.click();
      await this.page.waitForTimeout(200);
    } else {
      // No options available - close dropdown and try the "Create New" button
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(100);

      // Try to use "Create New" button for chairman/secretary
      if (placeholderText.includes('chairman')) {
        await this.createNewOfficial('Chairman');
      } else if (placeholderText.includes('secretary')) {
        await this.createNewOfficial('Secretary');
      }
    }
  }

  /**
   * Creates a new official (chairman/secretary) using the panel
   */
  private async createNewOfficial(role: 'Chairman' | 'Secretary') {
    const createButton = this.page.locator(`button:has-text("Create New ${role}")`);
    if (!(await createButton.isVisible().catch(() => false))) {
      return; // Button not found
    }

    await createButton.click();
    await this.page.waitForTimeout(500);

    // Wait for the panel to open
    const panel = this.page.locator('[role="dialog"], [class*="panel"], [class*="slide"]');
    await panel.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    // Fill in basic person details
    const firstNameInput = panel
      .locator(
        'input[placeholder*="First"], input[name="firstName"], label:has-text("First Name") + input, label:has-text("First Name") ~ input'
      )
      .first();
    const lastNameInput = panel
      .locator(
        'input[placeholder*="Last"], input[name="lastName"], label:has-text("Last Name") + input, label:has-text("Last Name") ~ input'
      )
      .first();

    if (await firstNameInput.isVisible().catch(() => false)) {
      await firstNameInput.fill(`Test ${role}`);
    }
    if (await lastNameInput.isVisible().catch(() => false)) {
      await lastNameInput.fill(`E2E ${Date.now()}`);
    }

    // Look for save/create button
    const saveButton = panel
      .locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]')
      .first();
    if (await saveButton.isVisible().catch(() => false)) {
      await saveButton.click();
      await this.page.waitForTimeout(1000);
    }

    // Panel should auto-close and select the new person
    await panel.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  // ========== Step 2 Actions ==========
  async addTrial(trial: TrialDetails) {
    await this.addTrialButton.click();
    await this.page.waitForTimeout(300);

    // Get the last trial card - look for cards with Trial headers
    const trialCards = this.page
      .locator('[class*="rounded"]')
      .filter({ has: this.page.locator('h4:has-text("Trial")') });
    const lastTrialCard = trialCards.last();

    // Fill trial name - first input in the card
    const nameInput = lastTrialCard.locator('input').first();
    await nameInput.clear();
    await nameInput.fill(trial.name);

    // Fill event number - second input
    const eventNumberInput = lastTrialCard.locator('input').nth(1);
    if (await eventNumberInput.isVisible()) {
      await eventNumberInput.clear();
      await eventNumberInput.fill(trial.eventNumber);
    }

    // Set date/time - click the button with calendar icon
    const dateTimeButton = lastTrialCard
      .locator('button')
      .filter({ has: this.page.locator('svg') })
      .first();
    if (await dateTimeButton.isVisible()) {
      await dateTimeButton.click();
      await this.page.waitForSelector('[role="grid"]', { timeout: 5000 });
      await this.navigateToDateInCalendar(trial.dateTime);
    }
  }

  async addMultipleTrials(trials: TrialDetails[]) {
    for (const trial of trials) {
      await this.addTrial(trial);
    }
  }

  // ========== Step 3 Actions ==========
  async selectTemplate(templateName?: string) {
    const templateSelect = this.page
      .locator('button[role="combobox"]')
      .filter({ hasText: /Select a template|template/i })
      .first();

    if (await templateSelect.isVisible().catch(() => false)) {
      await templateSelect.click();
      await this.page.waitForTimeout(200);

      if (templateName) {
        await this.page.locator(`[role="option"]:has-text("${templateName}")`).first().click();
      } else {
        // Select first available template
        const firstOption = this.page.locator('[role="option"]').first();
        if (await firstOption.isVisible()) {
          await firstOption.click();
        }
      }
    }
    // Template might be auto-selected or not required
  }

  async selectClasses(classNames: string[]) {
    for (const className of classNames) {
      const checkbox = this.page.locator(`label:has-text("${className}") input[type="checkbox"]`);
      if (await checkbox.isVisible()) {
        await checkbox.check();
      }
    }
  }

  async selectAllClasses() {
    const selectAllButton = this.page.locator('button:has-text("Select All")');
    if (await selectAllButton.isVisible().catch(() => false)) {
      await selectAllButton.click();
    } else {
      // Check all visible checkboxes
      const checkboxes = this.page.locator('input[type="checkbox"]');
      const count = await checkboxes.count();
      for (let i = 0; i < Math.min(count, 20); i++) {
        // Limit to prevent hanging
        const checkbox = checkboxes.nth(i);
        if ((await checkbox.isVisible()) && !(await checkbox.isChecked())) {
          await checkbox.check();
        }
      }
    }
  }

  // ========== Step 4 Actions ==========
  async createShow() {
    // Look for the create show button - could have different text
    const createButton = this.page.locator('button:has-text("Create Show")').first();
    await createButton.click();
    await this.page.waitForURL(/\/secretary\/dashboard/, { timeout: 15000 });
  }

  async createAndPublishShow() {
    const publishButton = this.page
      .locator('button:has-text("Create & Publish"), button:has-text("Publish")')
      .first();
    await publishButton.click();
    await this.page.waitForURL(/\/secretary\/dashboard/, { timeout: 15000 });
  }

  // ========== Assertions ==========
  async expectToBeOnStep(stepNumber: 1 | 2 | 3 | 4) {
    const stepIndicators = {
      1: 'Basic Show Information',
      2: 'Trial',
      3: 'Class',
      4: 'Review',
    };

    // Look for step-specific content
    await expect(
      this.page.locator(
        `h3:has-text("${stepIndicators[stepNumber]}"), h2:has-text("${stepIndicators[stepNumber]}")`
      )
    ).toBeVisible({ timeout: 5000 });
  }

  async expectValidationError(errorText: string) {
    await expect(
      this.page.locator(
        `.text-destructive:has-text("${errorText}"), .text-red-500:has-text("${errorText}")`
      )
    ).toBeVisible();
  }

  async expectNoValidationErrors() {
    const errorElements = this.page.locator('.text-destructive, .text-red-500, [role="alert"]');
    await expect(errorElements).toHaveCount(0);
  }

  async takeScreenshot(name: string) {
    await this.page.screenshot({ path: `test-results/screenshots/${name}.png`, fullPage: true });
  }

  // ========== Debug Helpers ==========
  async getFormState(): Promise<Record<string, string>> {
    const state: Record<string, string> = {};

    // Get values from visible inputs
    const inputs = this.page.locator('input:visible');
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const name = (await input.getAttribute('name')) || `input_${i}`;
      const value = await input.inputValue();
      state[name] = value;
    }

    return state;
  }
}

// Helper function to generate test show data
export function generateTestShowData(overrides: Partial<ShowDetails> = {}): ShowDetails {
  const startDate = addMonths(new Date(), 2);
  const endDate = addDays(startDate, 1);

  return {
    name: `E2E Test Show ${format(new Date(), 'yyyy-MM-dd-HHmmss')}`,
    organization: 'AKC',
    startDate,
    endDate,
    location: '123 Test Venue\nTest City, TS 12345',
    entryOpenDate: addDays(new Date(), 7),
    entryCloseDate: addDays(startDate, -3),
    preEntryFee: 35,
    dayOfShowFee: 40,
    ...overrides,
  };
}

export function generateTestTrialData(showStartDate: Date, index: number = 0): TrialDetails {
  const trialDate = addDays(showStartDate, index);
  trialDate.setHours(8, 0, 0, 0);

  return {
    name: `Trial ${index + 1}`,
    dateTime: trialDate,
    eventNumber: (index + 1).toString(),
  };
}
