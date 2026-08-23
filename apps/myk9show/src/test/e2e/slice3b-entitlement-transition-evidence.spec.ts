/**
 * Slice 3B evidence walk (task 5.8): free → complimentary Premium → revoked.
 *
 * Drives the REAL admin grant workflow (UserEditPanel → admin RPCs) against
 * the linked staging database, then verifies the exhibitor-facing truth on
 * Subscription, Pricing, and a premium dog capability between each transition.
 * Mutates staging data (grant + revoke for the e2e exhibitor, leaving only
 * truthful history rows), so this spec is NOT in the CI allowlist — run it
 * deliberately, and ONLY on a single project with a single worker:
 *
 *   pnpm playwright test src/test/e2e/slice3b-entitlement-transition-evidence.spec.ts \
 *     --project=chromium --workers=1
 *
 * `test.describe.configure({ mode: 'serial' })` orders tests only WITHIN a
 * project. The default config fans this file across chromium/firefox/webkit/
 * mobile-chrome/tablet concurrently, and every project mutates the SAME staging
 * exhibitor — grants would supersede and revoke each other nondeterministically.
 * The guard below therefore skips every project except EVIDENCE_PROJECT.
 *
 * Requires E2E_ADMIN_PASSWORD and E2E_DEMO_EXHIBITOR_PASSWORD in the env.
 */
import { test, expect, type Page } from '@playwright/test';
import { signInAsTestUser } from './helpers/testUsers';

const EVIDENCE_DIR = process.env.SLICE3B_EVIDENCE_DIR ?? 'test-results/slice3b-evidence';

/** The one project allowed to mutate the shared staging exhibitor. */
const EVIDENCE_PROJECT = process.env.SLICE3B_EVIDENCE_PROJECT ?? 'chromium';

const EXHIBITOR_EMAIL = process.env.E2E_DEMO_EXHIBITOR_EMAIL ?? 'exhibitor@myk9t.com';

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

/**
 * Opens the exhibitor's first dog on Career → Title Progress: an account-Premium
 * capability, so it is the surface that must flip locked/unlocked with a grant.
 */
async function openDogTitleProgress(page: Page) {
  await page.goto('/dogs');
  // BrowseCard renders a div with an EXPLICIT role="link" (plus tabIndex and an
  // Enter handler) and navigates via onClick — there is no href to read, and
  // real <a> elements elsewhere on the page also expose the link role, so match
  // the attribute directly. Waiting on the card itself matters: before the dogs
  // query settles the page briefly renders unrelated headings.
  const dogCards = page.locator('[role="link"]');
  await expect(dogCards.first(), 'the e2e exhibitor must own at least one dog').toBeVisible({
    timeout: 20000,
  });
  // Keyboard activation avoids pointer hit-testing against the card's layout.
  await dogCards.first().press('Enter');
  // Client-side navigation fires no `load` event, so waitForURL's default
  // waitUntil would hang — poll the URL instead.
  await expect(page).toHaveURL(/\/dogs\/[0-9a-f-]{36}/i, { timeout: 20000 });

  const dogId = new URL(page.url()).pathname.split('/dogs/')[1]?.split('/')[0];
  expect(dogId, 'expected a dog detail URL after opening the first dog').toBeTruthy();
  await page.goto(`/dogs/${dogId}?section=career&view=titles`);
}

/**
 * Positive locked evidence: BlurGate's own chrome. The blurred children are
 * `aria-hidden`, so role-based queries only ever see the real section when it
 * is genuinely unlocked.
 */
async function expectTitleProgressLocked(page: Page) {
  await expect(page.getByText('Premium Feature').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Upgrade to Premium' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log Result' })).toHaveCount(0);
}

/** Positive unlocked evidence: the real section's own action is reachable. */
async function expectTitleProgressUnlocked(page: Page) {
  await expect(page.getByRole('button', { name: 'Log Result' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Upgrade to Premium' })).toHaveCount(0);
  await expect(page.getByText('Premium Feature')).toHaveCount(0);
}

/** Positive non-premium evidence on Subscription: a settled free/expired plan state. */
async function expectSubscriptionNonPremium(page: Page) {
  await expect(page.getByText(/Premium access ended|You're on the free plan/).first()).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByText('Complimentary premium through')).toHaveCount(0);
  await expect(page.getByText('Founding member premium through')).toHaveCount(0);
}

/** Positive non-premium evidence on Pricing: the real checkout action is offered. */
async function expectPricingOffersCheckout(page: Page) {
  await expect(page.getByRole('button', { name: 'Subscribe Now' })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByRole('button', { name: /^You have .*Premium$/ })).toHaveCount(0);
}

test.describe.configure({ mode: 'serial' });

test.describe('Slice 3B: free -> complimentary -> revoked transition', () => {
  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== EVIDENCE_PROJECT,
      `Mutates the shared staging exhibitor — runs only on the "${EVIDENCE_PROJECT}" project with --workers=1.`
    );
  });

  test('exhibitor starts on the truthful free state', async ({ page }) => {
    await signInAsTestUser(page, 'DEMO_EXHIBITOR');

    await page.goto('/subscription');
    await expectSubscriptionNonPremium(page);
    await shoot(page, '00a-exhibitor-subscription-free');

    await page.goto('/pricing-page');
    await expectPricingOffersCheckout(page);
    await shoot(page, '00b-exhibitor-pricing-free');

    await openDogTitleProgress(page);
    await expectTitleProgressLocked(page);
    await shoot(page, '00c-exhibitor-dog-title-progress-locked');
  });

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
    // Actor-backed audit evidence, per the entitlement spec's admin scenario.
    await expect(history.getByText(/Granted by /).first()).toBeVisible();
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

  test('a granted exhibitor sees an unlocked premium dog capability', async ({ page }) => {
    await signInAsTestUser(page, 'DEMO_EXHIBITOR');

    // Slice 3B's headline behavior: the grant — not a Stripe subscription —
    // unlocks the account-Premium dog capabilities.
    await openDogTitleProgress(page);
    await expectTitleProgressUnlocked(page);
    await shoot(page, '04b-exhibitor-dog-title-progress-unlocked');
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
    await expect(history.getByText(/Revoked by /).first()).toBeVisible();
    await shoot(page, '05-admin-history-revoked');
  });

  test('exhibitor is truthfully back to non-premium', async ({ page }) => {
    await signInAsTestUser(page, 'DEMO_EXHIBITOR');

    await page.goto('/subscription');
    await expectSubscriptionNonPremium(page);
    await shoot(page, '06-exhibitor-subscription-after-revoke');

    await page.goto('/pricing-page');
    await expectPricingOffersCheckout(page);
    await shoot(page, '07-exhibitor-pricing-after-revoke');

    await openDogTitleProgress(page);
    await expectTitleProgressLocked(page);
    await shoot(page, '08-exhibitor-dog-title-progress-relocked');
  });
});
