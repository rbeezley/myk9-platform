import { expect, test } from '@playwright/test';
import { captureRestAuth, DATA_REQUIRED } from '../helpers/liveCanary';
import {
  assertNeverOpenedClassPage,
  classPageLinks,
  findFixtureClass,
  FIXTURE_CLASS_NAME,
  watchNavigations,
} from '../helpers/classPageNavigationAudit';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';
import { signInAsExhibitor } from '../helpers/testUsers';
import { installBrowserDiagnostics } from '../shared/browserDiagnostics';

/**
 * Suite category: nightly (read-only, seeded Playwright Regression only).
 *
 * MYK9-1942 Phase 5: the exhibitor on a phone, on a show day, never needs the class page.
 * One home per class: My Shows says where to be today, Ringside ("Your dogs today") is the
 * show-day home, and the show page's "Where to be & when" opens Ringside on the trial day.
 *
 * Walk, as the demo exhibitor on the show-day fixture (Willow runs first in Container Novice A):
 *   My Shows -> "Where to be today" -> Ringside lists Willow's class with its Check in button, a place
 *   in line or a result -> the show page's "Where to be & when" row opens Ringside, not the class page.
 * Throughout, no visited URL is the class page, and neither My Shows nor Ringside links to it.
 *
 * READ-ONLY by design, so it can run beside the stateful resultsTabJourney on the same fixture:
 * it never presses Check in, never scores. NOT covered here (they need a second signed-in role
 * writing to the same class): watching the place in line change as a score is recorded, and the
 * result arriving. The place-in-line answer and the preliminary label are pinned by the
 * ExhibitorClassCallout, MyEntryRow and run-queue vitest suites; walk those two steps by hand
 * from docs/qa/walks/exhibitor-task-walk.md.
 *
 * Seeded target only: it skips unless MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true, and the shared
 * staging write guard stays installed as a second net.
 */

const PHONE = { width: 390, height: 844 } as const;
const DOG = 'Willow';

test.describe('Exhibitor phone: My Shows to Ringside without the class page (MYK9-1942)', () => {
  installBrowserDiagnostics(test);

  test.skip(
    !DATA_REQUIRED,
    'Needs the seeded show-day fixture, which only the isolated Playwright Regression target has'
  );

  test('where to be today, Ringside and the show page never open the class page', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
    await page.setViewportSize(PHONE);
    const visitedUrls = watchNavigations(page);
    const capture = captureRestAuth(page);
    let showId = '';

    await test.step('1. sign in on My Shows and find the show running today', async () => {
      await signInAsExhibitor(page, '/exhibitor/entries');
      ({ showId } = await findFixtureClass(page, await capture.get()));
      await expect(page.getByRole('link', { name: 'Where to be today' }).first()).toBeVisible({
        timeout: 45_000,
      });
      expect(await classPageLinks(page), 'My Shows links to the class page').toEqual([]);
    });

    await test.step('2. Where to be today opens Ringside', async () => {
      await page
        .locator(`a[href="/at-show/${showId}"]`)
        .filter({ hasText: 'Where to be today' })
        .click();
      await expect(page).toHaveURL(new RegExp(`/at-show/${showId}/?$`));
      await expect(page.getByText('Your dogs today').first()).toBeVisible({ timeout: 45_000 });
    });

    await test.step("3. Ringside shows the dog's class with its place in line or its result", async () => {
      const row = page.locator('[data-testid^="at-show-my-entry-"]').filter({ hasText: DOG });
      await expect(row.first()).toBeVisible({ timeout: 45_000 });
      await expect(row.first()).toContainText(FIXTURE_CLASS_NAME);
      // What Ringside owns for Willow depends on where she is. A fresh seed has her unchecked-in
      // with self check-in on, so the row offers the Check in button (never pressed here); once
      // checked in it carries a place line; once scored, her own result or the withheld notice.
      await expect(
        row
          .first()
          .getByRole('button', { name: /^Check in Willow/ })
          .or(row.first().getByTestId('at-show-my-entry-place'))
          .or(row.first().getByRole('group', { name: 'Result' }))
          .or(row.first().getByTestId('at-show-my-entry-withheld'))
          .first()
      ).toBeVisible();
      expect(await classPageLinks(page), 'Ringside links to the class page').toEqual([]);
    });

    await test.step('4. the show page "Where to be & when" opens Ringside on the trial day', async () => {
      await page.goto(`/shows/${showId}`, { waitUntil: 'domcontentloaded' });
      const whereToBe = page
        .locator(`a[href="/at-show/${showId}"]`)
        .filter({ hasText: FIXTURE_CLASS_NAME })
        .first();
      await expect(whereToBe).toBeVisible({ timeout: 45_000 });
      await whereToBe.click();
      await expect(page).toHaveURL(new RegExp(`/at-show/${showId}/?$`));
    });

    assertNeverOpenedClassPage(visitedUrls());
  });
});
