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
import { signInAsSecretary } from '../helpers/testUsers';
import { installBrowserDiagnostics } from '../shared/browserDiagnostics';

/**
 * Suite category: nightly (read-only, seeded Playwright Regression only).
 *
 * MYK9-1942 Phase 5: a secretary runs a class from Show Desk's class panel and is never sent to
 * the class page. One home per class: the panel owns the entries, check-in, run order, scoring
 * and results, so nothing on it needs to leave for a second copy of the same list.
 *
 * Walk, as the demo secretary on the show-day fixture (Willow run 1, Cooper run 2):
 *   open the class on Show Desk -> both dogs are on the panel in run order, each with its own row
 *   menu -> the class's Actions menu offers Edit class and Score this class and no
 *   "View entries and results" -> no link on the desk and no visited URL is the class page.
 *
 * READ-ONLY by design, so it can run beside the stateful resultsTabJourney on the same fixture
 * (that spec scores, releases and signs off this class; this one tolerates any of those states).
 * Scoring and release are walked there; this spec pins that the class never has to be left for
 * the class page along the way.
 *
 * Seeded target only: it skips unless MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true, and the shared
 * staging write guard stays installed as a second net.
 */

test.describe('Secretary: a class runs from Show Desk without the class page (MYK9-1942)', () => {
  installBrowserDiagnostics(test);

  test.skip(
    !DATA_REQUIRED,
    'Needs the seeded show-day fixture, which only the isolated Playwright Regression target has'
  );

  test('the class panel holds the class and no door leads to the class page', async ({ page }) => {
    test.setTimeout(180_000);
    await installSharedStagingWriteGuard(page, { strictRpcWrites: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    const visitedUrls = watchNavigations(page);
    const capture = captureRestAuth(page);
    let deskUrl = '';

    await test.step('1. sign in and open the fixture class on Show Desk', async () => {
      await signInAsSecretary(page);
      const { showId, classId, day } = await findFixtureClass(page, await capture.get());
      // The day and the focus travel together: Show Desk only searches the selected day's classes.
      deskUrl = `/shows/${encodeURIComponent(showId)}?day=${day}&focus=${encodeURIComponent(classId)}`;
      await page.goto(deskUrl, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { level: 2, name: FIXTURE_CLASS_NAME })).toBeVisible({
        timeout: 60_000,
      });
    });

    await test.step('2. both dogs are on the panel, Willow ahead of Cooper', async () => {
      const rows = page.getByTestId('class-entry-row');
      await expect(rows.first()).toBeAttached({ timeout: 60_000 });
      const text = (await rows.allInnerTexts()).join('\n');
      expect(text).toContain('Willow');
      expect(text).toContain('Cooper');
      expect(text.indexOf('Willow')).toBeLessThan(text.indexOf('Cooper'));
    });

    await test.step('3. the class menu runs the class here and has no class-page item', async () => {
      await page.getByRole('button', { name: `Actions for ${FIXTURE_CLASS_NAME}` }).click();
      await expect(page.getByRole('menuitem', { name: 'Edit class' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Score this class' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: /view entries and results/i })).toHaveCount(
        0
      );
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menuitem', { name: 'Edit class' })).toHaveCount(0);
    });

    await test.step('4. Show Desk has no link to the class page and the URL never left the desk', async () => {
      expect(await classPageLinks(page), 'Show Desk links to the class page').toEqual([]);
      await expect(page).toHaveURL(/\/shows\/[^/?]+\?/);
    });

    assertNeverOpenedClassPage(visitedUrls());
  });
});
