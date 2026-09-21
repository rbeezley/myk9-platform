import { test, expect } from '@playwright/test';
import { signInAsExhibitor } from './helpers/testUsers';
import {
  installExhibitorFixture,
  FIXTURE_SHOW_NAME,
  FIXTURE_DOG_CALL_NAME,
} from './helpers/exhibitorFixture';

/**
 * Phase 2 acceptance for the hermetic fixture
 * (docs/plan-hermetic-e2e-fixtures.md).
 *
 * These run against the CURRENTLY EMPTY staging database. That is the point:
 * if they pass here, the specs they unblock no longer care what the shared
 * project contains.
 */
test.describe('exhibitor fixture', () => {
  test('renders My Shows with a show card on an empty database', async ({ page }) => {
    await installExhibitorFixture(page);
    await signInAsExhibitor(page, '/exhibitor/entries');

    // The heading every converted spec waits for. Without the fixture's
    // exhibitor_profiles row this URL redirects to /onboarding and the
    // heading never exists.
    await expect(page.getByRole('heading', { name: 'My Shows', level: 1 })).toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByText(FIXTURE_SHOW_NAME).first()).toBeVisible();
    await expect(page.getByText(FIXTURE_DOG_CALL_NAME).first()).toBeVisible();
  });

  test('serves a deliberate zero state distinct from an empty database', async ({ page }) => {
    await installExhibitorFixture(page, { entries: [] });
    await signInAsExhibitor(page, '/exhibitor/entries');

    await expect(page.getByRole('heading', { name: 'My Shows', level: 1 })).toBeVisible({
      timeout: 15000,
    });
    // The page still mounts — the exhibitor is onboarded, they simply have no
    // entries. Asserting this separately is what stops a spec from passing on
    // an accidental empty database and calling it a zero-state test.
    await expect(page.getByText(FIXTURE_SHOW_NAME)).toHaveCount(0);
  });

  /**
   * Positive control. A fixture that renders nothing would let every assertion
   * above pass vacuously on a page that never loaded, which is exactly how the
   * original specs gave a clean pass while proving nothing
   * (LESSONS measurement-harness, mutation-actually-mutated).
   */
  test('positive control: without the fixture the exhibitor is redirected to onboarding', async ({
    page,
  }) => {
    await signInAsExhibitor(page, '/exhibitor/entries');

    // `networkidle` is NOT a synchronisation point for this redirect: it fires
    // when requests go quiet, while the redirect happens in an effect after
    // the profile query settles. Reading the URL there caught the pre-redirect
    // value about one run in two. Poll the pathname instead.
    await expect
      .poll(() => new URL(page.url()).pathname, {
        timeout: 15000,
        message:
          'the demo exhibitor reached /exhibitor/entries WITHOUT the fixture, so ' +
          'staging has a profile row again and these specs no longer prove that ' +
          'the fixture is what makes them pass. Re-check the control.',
      })
      .toBe('/onboarding');
  });
});
