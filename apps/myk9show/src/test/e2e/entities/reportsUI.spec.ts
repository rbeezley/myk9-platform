import { test, expect, Page } from '@playwright/test';
import { signInAsSecretary } from '../helpers/testUsers';

/**
 * UI-driven e2e for the Reports page — secretary role.
 *
 * Strategy:
 *   - Sign in as the secretary fixture, land on /secretary/reports.
 *   - Verify the four SHOW-PHASE sections render (Before / During / After the
 *     show, Anytime). MYK9-630 phase 3
 *     replaced the old category headings (Operational / Organization /
 *     Financial / Statistics) with these; the reports themselves are
 *     unchanged and none is gated by show status.
 *   - Pick "Financial Report" and verify it renders the report header (with
 *     either fee-bearing rows or the empty-state — either path proves
 *     reachability).
 *   - Regression guard for the /qa-feature shows-as-secretary walk
 *     (2026-04-26): financial + statistics reports were silently hidden
 *     by the dropdown's category filter.
 *
 * Auth: TEST_USERS.SECRETARY (`secretary@myk9t.com`, password in env).
 */

test.describe.configure({ mode: 'serial' });

// Reports now live under the show-scoped workbench route; the standalone
// /secretary/reports redirects to the dashboard (no show context).
const SHOW_ID = '4584f257-19b5-4016-aae6-5e7827b769cb';
const REPORTS_PATH = `/shows/${SHOW_ID}/reports`;

// The catalog is shown as phase sections of report cards (MYK9-1033), not a dropdown.
// A card's select button carries the report name.
function getReportCard(page: Page, name: string) {
  return page.getByTestId('report-card').filter({ hasText: name }).first();
}

test.describe('Reports UI — secretary', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsSecretary(page);
  });

  test('report catalog renders all four phase sections', async ({ page }) => {
    await page.goto(REPORTS_PATH);

    // INTENT (regression guard, carried across the MYK9-630 phase-3 regroup):
    // all four group labels must be present in the listbox. The guard exists
    // because a grouping map that omits a bucket silently hides every report in
    // it — that is how Financial Report and the four entry-counts reports
    // disappeared for weeks under the old category headings.
    for (const label of ['Before the show', 'During the show', 'After the show', 'Anytime']) {
      await expect(page.getByRole('region', { name: label })).toBeVisible();
    }

    // Financial Report and the four statistics reports are reachable.
    for (const name of [
      'Financial Report',
      'Show Entry Counts',
      'Trial Entry Counts',
      'Breed Entry Counts',
      'Judge Entry Counts',
    ]) {
      await expect(getReportCard(page, name)).toBeVisible();
    }
  });

  test('selecting Financial Report changes the report type and renders some result', async ({
    page,
  }) => {
    await page.goto(REPORTS_PATH);
    const card = getReportCard(page, 'Financial Report');
    await card.getByRole('button').first().click();

    // The card reflects the financial-report selection.
    await expect(card.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');

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
