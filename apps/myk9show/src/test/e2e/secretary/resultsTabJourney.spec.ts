import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  captureRestAuth,
  DATA_REQUIRED,
  dataAbsent,
  requireRead,
  type RestAuth,
} from '../helpers/liveCanary';
import { expectNoHorizontalOverflow } from '../helpers/horizontalOverflow';
import { installSharedStagingWriteGuard } from '../helpers/sharedStagingWriteGuard';
import { signInAsSecretary } from '../helpers/testUsers';

/**
 * Suite category: nightly (stateful, seeded Playwright Regression only).
 *
 * MYK9-1031, plan-results-tab-redesign Phase 7: ONE secretary journey through the Results tab on
 * the show-day fixture show (`seed_demo_restore_show_day_fixture`, MYK9-731):
 *
 *   scored class -> verified against the paper -> released -> results sheet printed -> judge
 *   initialed -> reload reads released + initialed.
 *
 * Why seeded-only: every step writes (scores, the check, Release, the print record, the judge's
 * initials). `test.skip` unless MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true, which only the isolated
 * Supabase target sets (`scripts/qa/run-playwright-regression.sh`), and the shared-staging write
 * guard stays installed as a second net. The fixture show has exactly one class per day, so that
 * class IS the secretary's whole judge-day, which is what lets one spec reach the sign-off.
 *
 * The fixture ships UNSCORED (Willow run 1, Cooper run 2), so the journey scores both dogs from
 * paper first. The scores, the check, the release and the initials are not undone at the end: the
 * isolated target is rebuilt per Nightly run (`qa:isolated-e2e:reset`), so the reset is the
 * restore. Re-running against an already-used local database will fail at the first step the
 * previous run already completed; reseed it.
 */

const CLASS_NAME = 'Container Novice A';
const FIXTURE_TIME_ZONE = 'America/Chicago';
const PHONE = { width: 375, height: 812 } as const;
// Every row the fixture function mints starts with this id prefix (MYK9-731).
const FIXTURE_ID_FLOOR = 'dededede-0000-0000-0731-000000000000';
const FIXTURE_ID_CEILING = 'dededede-0000-0000-0731-ffffffffffff';

interface FixtureClassRow {
  id: string;
  trials: { show_id: string; date: string };
}

function todayInFixtureZone(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: FIXTURE_TIME_ZONE }).format(new Date());
}

async function findFixtureClass(page: Page, auth: RestAuth, today: string) {
  const shows = await requireRead<{ id: string }>(
    page,
    auth,
    `shows?select=id&id=gte.${FIXTURE_ID_FLOOR}&id=lte.${FIXTURE_ID_CEILING}&order=start_date.desc&limit=5`
  );
  const showIds = shows.map(show => show.id);
  if (showIds.length === 0)
    dataAbsent('no show-day fixture show (id prefix dededede-0000-0000-0731-)');
  const classes = await requireRead<FixtureClassRow>(
    page,
    auth,
    `classes?select=id,trials!inner(show_id,date)&trials.show_id=in.(${showIds.join(',')})&trials.date=eq.${today}&name=eq.${encodeURIComponent(CLASS_NAME)}&limit=1`
  );
  const target = classes[0];
  if (!target) dataAbsent(`the fixture has no ${CLASS_NAME} dated ${today} (${FIXTURE_TIME_ZONE})`);
  return { showId: target.trials.show_id, classId: target.id };
}

/** Paper-score both fixture dogs Qualified, unless a previous step already scored the class. */
async function scoreFromPaper(page: Page, classId: string) {
  await page.goto(`/scoring/classes/${classId}/entries?mode=split`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('heading', { name: CLASS_NAME })).toBeVisible({ timeout: 20_000 });
  const progress = page.getByText(/\d+ of \d+ scored/).first();
  await expect(progress).toBeVisible({ timeout: 20_000 });
  if ((await progress.innerText()).startsWith('2 of 2')) return;

  for (const dog of ['Willow', 'Cooper']) {
    await page.getByRole('button', { name: new RegExp(dog) }).click();
    await page.locator('button[aria-label="Q"]').filter({ hasText: 'Qualified' }).click();
    await page.getByLabel('Search Time').fill(dog === 'Willow' ? '4231' : '5107');
    await page.getByRole('button', { name: 'Save & Next' }).click();
  }
  await expect(page.getByText('2 of 2 scored').first()).toBeVisible({ timeout: 20_000 });
}

/** Mark the class Complete from the Overview's focused-class panel (the only place that owns it). */
async function markClassComplete(page: Page) {
  const focused = page.locator('aside').filter({ hasText: 'Focused Class' });
  await expect(focused).toBeVisible({ timeout: 20_000 });
  await focused.getByRole('button', { name: /Change class status/ }).click();
  await page.getByRole('menuitem', { name: 'Complete', exact: true }).click();

  const changed = page.getByText('Class status changed to Complete.');
  const warning = page
    .locator('[role="dialog"], [role="alertdialog"]')
    .filter({ hasText: 'Mark this Class complete?' });
  await expect(changed.or(warning).first()).toBeVisible({ timeout: 15_000 });
  if (await warning.isVisible()) {
    await warning.getByRole('button', { name: 'Mark complete' }).click();
  }
  await expect(changed).toBeVisible({ timeout: 15_000 });
}

/** Rows of the "Then" list: one paperwork row per report, found by its label. */
function paperworkRow(detail: Locator, label: string): Locator {
  return detail.locator('li').filter({ hasText: label }).last();
}

test.describe('Results tab: scored -> verified -> released -> printed -> initialed', () => {
  test.skip(
    !DATA_REQUIRED,
    'Stateful: writes scores, the paper check, a release, a print record and judge initials. ' +
      'Runs only on the seeded isolated Playwright Regression target.'
  );

  test('a secretary takes the fixture class from scores to a signed-off class (MYK9-1031)', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    // A second net behind the DATA_REQUIRED skip: nothing here may reach shared staging.
    await installSharedStagingWriteGuard(page);
    // The system print dialog is not testable; stub it in every frame (the report prints from an
    // iframe) so a headed run never stops on it. The app's own "Print dialog opened." toast and
    // the recorded print are what this spec asserts.
    await page.addInitScript(() => {
      window.print = () => undefined;
    });

    const capture = captureRestAuth(page);
    await signInAsSecretary(page);
    const { showId, classId } = await findFixtureClass(
      page,
      await capture.get(),
      todayInFixtureZone()
    );
    const resultsUrl = `/shows/${encodeURIComponent(showId)}/results?classId=${encodeURIComponent(classId)}`;
    const detail = page.getByRole('region', { name: `${CLASS_NAME} results` });

    // 1. Scored: both dogs from paper.
    await scoreFromPaper(page, classId);

    // 2. Open the class on Results. A scored class that is not Complete sends the secretary to
    // Overview to complete it (Results never completes a class itself).
    await page.goto(resultsUrl, { waitUntil: 'domcontentloaded' });
    const verifyButton = detail.getByRole('button', { name: 'Scores match the paper' });
    const completeFirst = detail.getByRole('link', { name: /Mark Class Complete on Overview/ });
    await expect(verifyButton.or(completeFirst).first()).toBeVisible({ timeout: 30_000 });
    if (await completeFirst.isVisible()) {
      await completeFirst.click();
      await markClassComplete(page);
      await page.goto(resultsUrl, { waitUntil: 'domcontentloaded' });
    }

    // 3. Verify: Release is held until every dog is ticked against the paper.
    await expect(verifyButton).toBeVisible({ timeout: 30_000 });
    await expect(verifyButton).toBeDisabled();
    await expect(detail.getByRole('button', { name: 'Release results' })).toBeDisabled();
    const ticks = detail.getByRole('checkbox');
    const dogCount = await ticks.count();
    expect(dogCount, 'the fixture class holds two dogs').toBe(2);
    for (let index = 0; index < dogCount; index += 1) {
      await ticks.nth(index).check();
      await expect(ticks.nth(index)).toBeChecked();
    }
    await expect(verifyButton).toBeEnabled();
    await verifyButton.click();
    await expect(detail.getByText(/Scores checked against the paper by you/)).toBeVisible({
      timeout: 20_000,
    });

    // 4. Release: the server is asked first, then the release lands.
    const release = detail.getByRole('button', { name: 'Release results' });
    await expect(release).toBeEnabled({ timeout: 20_000 });
    await release.click();
    await expect(page.getByText('Results released').first()).toBeVisible({ timeout: 20_000 });
    await expect(detail.getByText('Print the results sheet and ribbon labels')).toBeVisible({
      timeout: 20_000,
    });

    // 5. Print the Results sheet: the link opens the report, Print fires, and the print is
    // recorded from the toast it offers.
    const sheetRow = paperworkRow(detail, 'Results sheet');
    await expect(sheetRow.getByText('Not confirmed printed')).toBeVisible({ timeout: 20_000 });
    await sheetRow.getByRole('link', { name: /Print/ }).click();
    await expect(page).toHaveURL(/\/reports\?.*report=results-sheet/);
    const printButton = page.getByRole('button', { name: 'Print', exact: true });
    await expect(printButton).toBeVisible({ timeout: 30_000 });
    // The preview builds asynchronously; Print answers "Still building the preview" until then.
    await expect(async () => {
      await printButton.click();
      await expect(page.getByText('Print dialog opened.').first()).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Mark printed' }).click();
    await expect(page.getByText('Marked as printed.').first()).toBeVisible({ timeout: 15_000 });

    // 6. Back on Results the sheet reads printed, and the judge's day can be initialed.
    await page.goto(resultsUrl, { waitUntil: 'domcontentloaded' });
    await expect(paperworkRow(detail, 'Results sheet').getByText(/^Printed /)).toBeVisible({
      timeout: 20_000,
    });
    const signOff = detail.locator('section[aria-labelledby="judge-sign-off-heading"]');
    await expect(signOff).toBeVisible({ timeout: 20_000 });
    await signOff.getByRole('button', { name: /^Record initials/ }).click();
    await expect(page.getByText('Initials recorded on 1 class')).toBeVisible({ timeout: 20_000 });

    // 7. Reload: the class reads released, checked and initialed from the server's copy.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(detail.getByText('Released', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(detail.getByText(/Scores checked against the paper by you/)).toBeVisible();
    const signOffAfter = detail.locator('section[aria-labelledby="judge-sign-off-heading"]');
    await expect(signOffAfter.getByText('Initialed by judge').first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      signOffAfter.getByRole('button', { name: `Undo initials: ${CLASS_NAME}` })
    ).toBeVisible();
    await expect(detail.getByText('All done for this class')).toBeVisible();

    // 8. The same class on a phone: the list and the detail each fit the screen.
    await page.setViewportSize(PHONE);
    await page.goto(`/shows/${encodeURIComponent(showId)}/results`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page
        .getByRole('list', { name: 'Classes' })
        .getByRole('link', { name: new RegExp(CLASS_NAME) })
        .first()
    ).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalOverflow(page, 'Results class list at 375px');
    await page.goto(resultsUrl, { waitUntil: 'domcontentloaded' });
    await expect(detail).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalOverflow(page, 'Results class detail at 375px');
  });
});
