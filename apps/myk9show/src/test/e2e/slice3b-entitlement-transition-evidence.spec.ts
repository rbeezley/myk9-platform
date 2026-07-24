/**
 * Slice 3B evidence walk (task 5.8): free → complimentary Premium → revoked.
 *
 * Drives the REAL admin grant workflow (UserEditPanel → admin RPCs) against
 * the linked staging database, then verifies the exhibitor-facing truth on
 * Subscription and Pricing between each transition. Mutates staging data
 * (grant + revoke for the e2e exhibitor, leaving only truthful history rows),
 * so this spec is NOT in the CI allowlist — run it deliberately:
 *
 *   pnpm playwright test src/test/e2e/slice3b-entitlement-transition-evidence.spec.ts
 *
 * Requires E2E_ADMIN_PASSWORD and E2E_DEMO_EXHIBITOR_PASSWORD in the env.
 */
import { test, expect, type Page } from '@playwright/test';
import { signInAsTestUser } from './helpers/testUsers';

const EVIDENCE_DIR = process.env.SLICE3B_EVIDENCE_DIR ?? 'test-results/slice3b-evidence';

const EXHIBITOR_EMAIL = process.env.E2E_DEMO_EXHIBITOR_EMAIL ?? 'e2e-exhibitor@test.myk9.com';

const GRANT_REASON = 'Slice 3B staging evidence run (task 5.8)';
const REVOKE_REASON = 'Slice 3B staging evidence run complete';

async function shoot(page: Page, name: string) {
  // Let the route's fade/lazy-chunk transition finish so the evidence shows
  // settled content, not a mid-transition ghost (same race Slice 2 hit).
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png`, fullPage: true });
}

/** Open the e2e exhibitor's edit panel from /admin/users. */
async function openExhibitorEditPanel(page: Page) {
  await page.goto('/admin/users');
  const search = page.getByPlaceholder('Search by name, email, or ID...');
  await expect(search).toBeVisible({ timeout: 20000 });
  await search.fill(EXHIBITOR_EMAIL);
  const row = page.getByText(EXHIBITOR_EMAIL, { exact: false }).first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.click();
  await expect(page.getByText('Complimentary Premium', { exact: true })).toBeVisible({
    timeout: 15000,
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Slice 3B: free -> complimentary -> revoked transition', () => {
  test('admin grants complimentary Premium to the e2e exhibitor', async ({ page }) => {
    await signInAsTestUser(page, 'SITE_ADMIN');
    await openExhibitorEditPanel(page);
    await shoot(page, '01-admin-panel-before-grant');

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);
    await page.locator('#grant-end-date').fill(endDate.toISOString().slice(0, 10));
    await page.locator('#grant-reason').fill(GRANT_REASON);
    await page.getByRole('button', { name: 'Grant Complimentary Premium' }).click();

    // The section may report an overlapping active grant from a previous
    // aborted run; take the explicit replace path so the run is idempotent.
    const replace = page.getByRole('button', { name: 'Replace active grant' });
    try {
      await replace.waitFor({ state: 'visible', timeout: 4000 });
      await replace.click();
    } catch {
      // No overlap — the plain grant path succeeded.
    }

    // History refetches after mutation success and shows the active grant.
    const history = page.getByLabel('Grant history');
    await expect(history.getByText('active', { exact: true }).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(history.getByText(GRANT_REASON).first()).toBeVisible();
    await shoot(page, '02-admin-history-active-grant');
  });

  test('exhibitor sees truthful complimentary Premium', async ({ page }) => {
    await signInAsTestUser(page, 'DEMO_EXHIBITOR');

    await page.goto('/subscription');
    await expect(page.getByText('Complimentary Premium').first()).toBeVisible({
      timeout: 20000,
    });
    // Grants never expose Stripe billing management.
    await expect(page.getByRole('button', { name: /manage billing|customer portal/i })).toHaveCount(
      0
    );
    await shoot(page, '03-exhibitor-subscription-complimentary');

    await page.goto('/pricing-page');
    await expect(page.getByRole('button', { name: 'You have Complimentary Premium' })).toBeVisible({
      timeout: 20000,
    });
    await shoot(page, '04-exhibitor-pricing-current-access');
  });

  test('admin revokes the grant with a reason', async ({ page }) => {
    await signInAsTestUser(page, 'SITE_ADMIN');
    await openExhibitorEditPanel(page);

    const history = page.getByLabel('Grant history');
    await history.getByRole('button', { name: 'Revoke' }).first().click();
    await page.locator('#revoke-reason').fill(REVOKE_REASON);
    await page
      .getByRole('button', { name: /^Revoke grant$|^Revoke$/ })
      .last()
      .click();

    await expect(history.getByText('revoked', { exact: true }).first()).toBeVisible({
      timeout: 15000,
    });
    await shoot(page, '05-admin-history-revoked');
  });

  test('exhibitor is truthfully back to non-premium', async ({ page }) => {
    await signInAsTestUser(page, 'DEMO_EXHIBITOR');

    await page.goto('/subscription');
    // A revoked grant resolves as non-premium; the page must NOT claim any
    // active premium source.
    await expect(page.getByText('Complimentary premium through')).toHaveCount(0, {
      timeout: 20000,
    });
    await shoot(page, '06-exhibitor-subscription-after-revoke');

    await page.goto('/pricing-page');
    // The real checkout path is back for non-premium users.
    await expect(page.getByRole('button', { name: 'You have Complimentary Premium' })).toHaveCount(
      0
    );
    await shoot(page, '07-exhibitor-pricing-after-revoke');
  });
});
