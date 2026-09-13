import { test, expect, type Page } from '@playwright/test';
import { TEST_USERS, signInAsSecretary, signInAsTestUser } from '../helpers/testUsers';

/**
 * MYK9-464's stated evidence gate: "Verify against a real cross-club viewer,
 * not a fixture."
 *
 * WHY REAL ACCOUNTS. The club gates are a disjunction —
 * `is_site_admin() OR is_club_admin(club) OR is_trial_secretary(club)` — so the
 * e2e site-admin passes through the first branch and never exercises the club
 * term. A cross-club rejection written with that account reports a pass whether
 * or not club scoping exists (clubAdminJourney.spec.ts:14-18 and seed-demo.sql
 * section 10e both say so). Every account used here is club-scoped with no
 * site-wide role, so it can actually be refused.
 *
 * WHAT THIS PINS. #2183 made the ownership gate answer two questions, and the
 * distinction is invisible to fixture-based tests because a fixture just states
 * the answer:
 *
 *   canManage  — class lifecycle controls. A club admin of the owning club HAS this.
 *   canOperate — the show-day operational surface (run sheet, show-wide entry
 *                read). A club admin does NOT; a scoped secretary does.
 *
 * Collapsing them silently granted club admins the run sheet (caught by the
 * Codex gate on #2183). These are the real-viewer proof it stayed fixed.
 *
 * COVERAGE SPLIT. The secretary cases run today. The club-admin cases need
 * `E2E_CLUB_ADMIN_PASSWORD`, which no environment currently sets; they skip
 * rather than silently substituting an account that would pass vacuously.
 */

/** Seeded Heartland class. Both the secretary and the club admin are scoped to this club. */
const HEARTLAND_CLASS =
  '/shows/dededede-0000-0000-0000-000000000010' +
  '/trials/dededede-0000-0000-0000-000000000021' +
  '/classes/dec1a55e-0000-0000-0000-000000000031';

/** Seeded published class owned by a DIFFERENT club (MYK9-109 Load Club 1). */
const OTHER_CLUB_CLASS =
  '/shows/a1090000-0000-0000-0010-100000000001' +
  '/trials/a1090000-0000-0000-0011-100000000001' +
  '/classes/a1090000-0000-0000-0012-100000000001';

const runSheet = (page: Page) => page.getByTestId('secretary-run-sheet');
/** The non-staff surface. ClassDetailsPage renders exactly one of these two. */
const nonStaffSurface = (page: Page) => page.getByTestId('class-details-main');
const editButton = (page: Page) => page.getByRole('button', { name: /^edit$/i });

async function openClass(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 30_000 });
}

/**
 * Settle on the NON-STAFF surface before asserting the staff one is absent.
 *
 * Waiting on a heading is not enough: the run sheet renders after entries load,
 * so `toHaveCount(0)` run too early reports "absent" for a surface that is
 * merely late. Verified — aiming the cross-club test at the viewer's OWN club
 * (where the run sheet demonstrably renders) still passed without this wait.
 * Because the two surfaces are mutually exclusive, seeing this one IS the
 * evidence that `isStaff` resolved false.
 */
async function expectNonStaffSurface(page: Page) {
  await expect(nonStaffSurface(page)).toBeVisible({ timeout: 30_000 });
}

test.describe('Class scope for a club-scoped SECRETARY', () => {
  // POSITIVE CONTROL for every absence assertion in this file. If the run-sheet
  // locator ever stops matching the real component, this fails — without it, the
  // `toHaveCount(0)` assertions below would pass for the wrong reason forever.
  test('sees the run sheet on their OWN club’s class', async ({ page }) => {
    await signInAsSecretary(page);
    await openClass(page, HEARTLAND_CLASS);

    await expect(runSheet(page)).toBeVisible({ timeout: 30_000 });
  });

  // The cross-club half of the acceptance criteria, with a real viewer.
  test('gets no operational surface on ANOTHER club’s class', async ({ page }) => {
    await signInAsSecretary(page);
    await openClass(page, OTHER_CLUB_CLASS);

    await expectNonStaffSurface(page);
    await expect(runSheet(page)).toHaveCount(0);
    await expect(editButton(page)).toHaveCount(0);
  });
});

test.describe('Class scope for a club-scoped CLUB ADMIN', () => {
  test.skip(
    !process.env.E2E_CLUB_ADMIN_PASSWORD,
    'Set E2E_CLUB_ADMIN_PASSWORD to run the club-admin half (MYK9-464). The account is ' +
      'already seeded with an active club_admin grant on Heartland; only the password is ' +
      'absent. Substituting the site-admin account would pass vacuously.'
  );

  test('the account under test really is club-scoped, not a site admin', () => {
    // If this account ever gains a global role, every assertion below would pass
    // through the is_site_admin() branch and stop proving anything.
    expect(TEST_USERS.CLUB_ADMIN.role).toBe('club_admin');
    expect(TEST_USERS.CLUB_ADMIN.email).toBe('clubadmin@myk9t.com');
  });

  test('OWN club: lifecycle controls yes, operational run sheet no', async ({ page }) => {
    await signInAsTestUser(page, 'CLUB_ADMIN');
    await openClass(page, HEARTLAND_CLASS);

    // canManage — theirs.
    await expect(editButton(page)).toBeVisible();
    // canOperate — NOT theirs. The boundary the refactor moved twice. Settle on
    // the non-staff surface first so this cannot pass on a merely-late run sheet.
    await expectNonStaffSurface(page);
    await expect(runSheet(page)).toHaveCount(0);
  });

  test('ANOTHER club: neither lifecycle controls nor run sheet', async ({ page }) => {
    await signInAsTestUser(page, 'CLUB_ADMIN');
    await openClass(page, OTHER_CLUB_CLASS);

    await expectNonStaffSurface(page);
    await expect(editButton(page)).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: /delete class/i })).toHaveCount(0);
    await expect(runSheet(page)).toHaveCount(0);
  });
});
