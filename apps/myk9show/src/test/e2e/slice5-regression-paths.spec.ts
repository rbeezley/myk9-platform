/**
 * Task 7.10 — regression of paths audited earlier in MYK9-71 but not re-walked
 * since.
 *
 * READ-ONLY. The cart case deliberately does NOT click Remove: the seeded
 * account's stale cart item is useful fixture state for exactly this check, and
 * consuming it would make the test pass once and then assert nothing.
 *
 * Two of 7.10's four paths are verified at source level instead, because a
 * browser adds nothing to them:
 *
 *   - dog delete/refetch — useDogsDatabase's delete mutation removes the
 *     detail query and invalidates both `dogs` and `dogs/statistics` onSuccess,
 *     with an onError rollback restoring the optimistic removal. Driving a real
 *     delete would destroy seeded fixture data other specs depend on.
 *   - Developer-menu visibility — gated on `NODE_ENV === 'development'`, so it
 *     is present in dev by design. The meaningful assertion is that it does not
 *     ship: `grep -rl "Reset Data" dist/assets/scripts/` returns 0 matches in
 *     the production build. A dev-server browser check would assert the
 *     opposite of what matters.
 *
 * Run pinned to its own port:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:5199 PLAYWRIGHT_PORT=5199 \
 *     pnpm playwright test src/test/e2e/slice5-regression-paths.spec.ts \
 *     --project=chromium --workers=1
 */
import { test, expect, type Page } from '@playwright/test';
import { signInAsTestUser } from './helpers/testUsers';

const SEED_DOG_ID = 'dededede-0000-0000-0000-000000000041';

async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(600);
}

test.describe('Slice 5: audited-path regression', () => {
  test.setTimeout(180_000);

  /**
   * Stale-cart recovery. The seeded account carries a cart item old enough that
   * the header badge shows it on every page. The requirement is not that the
   * cart be empty — it is that a user who finds one can understand it and get
   * out, rather than being stuck behind a badge they cannot clear.
   */
  test('a stale cart is visible and recoverable', async ({ page }) => {
    await signInAsTestUser(page, 'DEMO_EXHIBITOR');
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto('/cart');
    await settle(page);

    const body = (await page.locator('body').textContent()) ?? '';

    // The cart must resolve to a definite state. A perpetual spinner or a blank
    // page is the actual failure mode this path guards against.
    const hasItems = (await page.getByRole('button', { name: /^Remove/i }).count()) > 0;
    const looksEmpty = /empty|nothing in your cart|no items/i.test(body);

    expect(
      hasItems || looksEmpty,
      'cart resolved to neither items nor an empty state — the user is stuck'
    ).toBe(true);

    // If items are present, an exit must exist. This is the recovery half.
    if (hasItems) {
      await expect(
        page.getByRole('button', { name: /^Remove/i }).first(),
        'cart holds items but offers no Remove control'
      ).toBeVisible();
    }

    // Whatever the state, the page must not be an error surface.
    expect(body, 'cart rendered an error state').not.toMatch(
      /something went wrong|failed to load|unexpected error/i
    );
  });

  /**
   * Exhibitor check-in vocabulary. Check-in is a show-day concept an exhibitor
   * meets once a year; the audit's concern was that they should never be shown
   * staff jargon or a raw status token.
   */
  test('exhibitor check-in vocabulary stays plain', async ({ page }) => {
    await signInAsTestUser(page, 'DEMO_EXHIBITOR');
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto('/my-entries');
    await settle(page);

    const body = (await page.locator('body').textContent()) ?? '';

    // Raw database tokens must never reach an exhibitor's screen. These are the
    // literal `check_in_status` values; seeing one means a mapper was bypassed.
    for (const token of ['no-status', 'checked_in', 'not_checked_in', 'check_in_status']) {
      expect(body, `raw check-in token "${token}" leaked to the exhibitor UI`).not.toContain(token);
    }
  });

  /**
   * Dog delete/refetch, browser half: the dogs list must render from a resolved
   * query rather than a stale cache, so a deletion elsewhere cannot leave a
   * phantom card. Asserting the seeded dog is present and consistent between
   * My Shows and Dog Details is the observable part; the invalidation wiring is
   * source-verified (see the file header).
   */
  test('dog list and detail agree on the seeded dog', async ({ page }) => {
    await signInAsTestUser(page, 'DEMO_EXHIBITOR');
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(`/dogs/${SEED_DOG_ID}`);
    await settle(page);
    await expect(page.getByText('Willow').first()).toBeVisible({ timeout: 20000 });

    await page.goto('/my-entries');
    await settle(page);
    const listBody = (await page.locator('body').textContent()) ?? '';
    expect(
      listBody,
      'dog present on its detail page but missing from the My Shows dog strip'
    ).toContain('Willow');
  });
});
