import { test, expect, Page } from '@playwright/test';

/**
 * UI-driven e2e for the Reports page — secretary role.
 *
 * Strategy:
 *   - Sign in as the secretary fixture, land on /secretary/reports.
 *   - Open the report-type dropdown and verify the four category groups
 *     render (Operational / Organization / Financial / Statistics).
 *   - Pick "Financial Report" and verify it renders the report header (with
 *     either fee-bearing rows or the empty-state — either path proves
 *     reachability).
 *   - Regression guard for the /qa-feature shows-as-secretary walk
 *     (2026-04-26): financial + statistics categories were silently hidden
 *     by the dropdown's category filter.
 *
 * Auth: secretary@myk9t.com / testpass123.
 */

test.describe.configure({ mode: 'serial' });

const SECRETARY_EMAIL = 'secretary@myk9t.com';
const SECRETARY_PASSWORD = 'testpass123';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('sign-in-button').click();
  await page.waitForURL(url => !url.pathname.includes('/sign-in'), {
    timeout: 15000,
  });
  await page.waitForLoadState('networkidle');
}

async function signInAsSecretary(page: Page) {
  await signIn(page, SECRETARY_EMAIL, SECRETARY_PASSWORD);
}

// The page has multiple comboboxes (show picker, report type, trial, class,
// sort). The report-type one sits below a "Report" label.
function getReportPicker(page: Page) {
  return page.locator('label:has-text("Report")').locator('..').getByRole('combobox');
}

test.describe('Reports UI — secretary', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('report-type dropdown renders all four category groups', async ({ page }) => {
    await page.goto('/secretary/reports');
    await getReportPicker(page).click();

    // INTENT (regression guard): all four group labels must be present in the
    // listbox. Previously only Operational + Organization rendered, hiding
    // Financial Report and the four entry-counts statistics reports.
    for (const label of ['Operational', 'Organization', 'Financial', 'Statistics']) {
      await expect(page.getByRole('group').filter({ hasText: label }).first()).toBeVisible();
    }

    // Financial Report and the four statistics reports are reachable.
    for (const name of [
      'Financial Report',
      'Show Entry Counts',
      'Trial Entry Counts',
      'Breed Entry Counts',
      'Judge Entry Counts',
    ]) {
      await expect(page.getByRole('option', { name })).toBeVisible();
    }
  });

  test('selecting Financial Report changes the report type and renders some result', async ({
    page,
  }) => {
    await page.goto('/secretary/reports');
    const picker = getReportPicker(page);
    await picker.click();
    await page.getByRole('option', { name: 'Financial Report' }).click();

    // The report-type picker reflects the financial-report selection.
    await expect(picker).toContainText(/financial-report|Financial Report/);

    // The page lands on one of three reachable end-states:
    //   1. Grand Total row (seed has accepted fee-bearing entries)
    //   2. FinancialReport's own filter empty-state (entries exist but none match)
    //   3. ReportPreview's page-level empty (the show has no entries at all)
    // Any of the three proves the report was reached — what we'd never see
    // before this fix is the dropdown letting the user pick "Financial Report"
    // in the first place.
    const grandTotal = page.getByText(/Grand Total: \$\d+\.\d{2}/);
    const financialEmpty = page.getByText(/No entries match/i);
    const pageLevelEmpty = page.getByText(/No entries found for this selection/i);
    await expect(grandTotal.or(financialEmpty).or(pageLevelEmpty).first()).toBeVisible({
      timeout: 10000,
    });
  });
});
