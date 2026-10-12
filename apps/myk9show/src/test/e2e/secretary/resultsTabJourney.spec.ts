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
 *   scored class -> verified against the paper -> released -> results sheet and ribbon labels printed -> judge
 *   initialed -> reload reads released + initialed.
 *
 * Why seeded-only: every step writes (scores, the check, Release, the print records, the judge's
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
 *
 * Each phase is a `test.step`, so a red run names the phase that broke.
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

/**
 * Paper-score both fixture dogs Qualified, unless a previous run already scored the class.
 *
 * The paper page reads the LOCAL replica once on mount (PaperScoresheetPage.tsx load effect) and
 * never re-reads when entries sync in, so a cold direct load can list zero dogs while its
 * "0 of 0 scored" counter is already on screen (the first CI run timed out waiting for a dog
 * button for this reason). The Results tab reads reactively, so it is opened first and given time
 * to show the class's two dogs; only then does the paper page load, from a warm replica. The dog
 * wait reloads once more in case the replica was still filling.
 */
async function scoreFromPaper(page: Page, resultsUrl: string, classId: string) {
  await page.goto(resultsUrl, { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('list', { name: 'Classes' }).getByText(/Scored\s*\d+\s*\/\s*2/)
  ).toBeVisible({ timeout: 45_000 });

  await page.goto(`/scoring/classes/${classId}/entries?mode=split`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('heading', { name: CLASS_NAME })).toBeVisible({ timeout: 20_000 });
  const willow = page.getByRole('button', { name: /Willow/ });
  await expect(async () => {
    if (!(await willow.isVisible())) await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(willow).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 60_000 });

  if (await page.getByText('2 of 2 scored').first().isVisible()) return;

  for (const dog of ['Willow', 'Cooper']) {
    const row = page.getByRole('button', { name: new RegExp(dog) });
    await row.click();
    const qualified = page.locator('button[aria-label="Q"]').filter({ hasText: 'Qualified' });
    await expect(qualified).toBeVisible();
    await qualified.click();
    const time = page.getByLabel('Search Time');
    await expect(time).toBeVisible();
    await time.fill(dog === 'Willow' ? '4231' : '5107');
    const saveNext = page.getByRole('button', { name: 'Save & Next' });
    await expect(saveNext).toBeEnabled();
    await saveNext.click();
    await expect(row).toContainText('Q', { timeout: 20_000 });
  }
  await expect(page.getByText('2 of 2 scored').first()).toBeVisible({ timeout: 20_000 });
}

/** Follow a paperwork row's Print link to Reports, print, and record it as printed. */
async function printFromResults(page: Page, detail: Locator, label: string, reportId: string) {
  const row = paperworkRow(detail, label);
  await expect(row.getByText('Not confirmed printed')).toBeVisible({ timeout: 20_000 });
  await row.getByRole('link', { name: /Print/ }).click();
  await expect(page).toHaveURL(new RegExp(`/reports\\?.*report=${reportId}`));
  const printButton = page.getByRole('button', { name: 'Print', exact: true });
  await expect(printButton).toBeVisible({ timeout: 30_000 });
  // The preview builds asynchronously; Print answers "Still building the preview" until then.
  await expect(async () => {
    await printButton.click();
    await expect(page.getByText('Print dialog opened.').first()).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  const markPrinted = page.getByRole('button', { name: 'Mark printed' });
  await expect(markPrinted).toBeVisible();
  await markPrinted.click();
  await expect(page.getByText('Marked as printed.').first()).toBeVisible({ timeout: 15_000 });
}

/** Rows of the "Then" list: one paperwork row per report, found by its label. */
function paperworkRow(detail: Locator, label: string): Locator {
  return detail.locator('li').filter({ hasText: label }).last();
}

test.describe('Results tab: scored -> verified -> released -> printed -> initialed', () => {
  test.skip(
    !DATA_REQUIRED,
    'Stateful: writes scores, the paper check, a release, print records and judge initials. ' +
      'Runs only on the seeded isolated Playwright Regression target.'
  );

  test('a secretary takes the fixture class from scores to a signed-off class (MYK9-1031)', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    // A second net behind the DATA_REQUIRED skip: nothing here may reach shared staging.
    await installSharedStagingWriteGuard(page);
    // The system print dialog is not testable; stub it in every frame (the report prints from an
    // iframe) so a headed run never stops on it. The app's own "Print dialog opened." toast and
    // the recorded print are what this spec asserts.
    await page.addInitScript(() => {
      window.print = () => undefined;
    });

    const capture = captureRestAuth(page);
    let showId = '';
    let classId = '';
    let resultsUrl = '';
    const detail = page.getByRole('region', { name: `${CLASS_NAME} results` });
    const verifyButton = detail.getByRole('button', { name: 'Scores match the paper' });
    const releaseButton = detail.getByRole('button', { name: 'Release results' });
    const signOff = detail.locator('section[aria-labelledby="judge-sign-off-heading"]');

    await test.step('1. sign in and find the fixture class', async () => {
      await signInAsSecretary(page);
      ({ showId, classId } = await findFixtureClass(
        page,
        await capture.get(),
        todayInFixtureZone()
      ));
      resultsUrl = `/shows/${encodeURIComponent(showId)}/results?classId=${encodeURIComponent(classId)}`;
    });

    await test.step('2. score both dogs from paper', async () => {
      await scoreFromPaper(page, resultsUrl, classId);
    });

    await test.step('3. open the class on Results once the server has completed it', async () => {
      // Scoring the last dog completes the class on the server (refresh_class_scoring_state; every
      // fixture class is status_source 'derived'). Until that reaches this device the detail reads
      // "Mark Class Complete on Overview", and completing it by hand from the stale row collides
      // with the server's own completion ("This record was changed elsewhere"), which leaves the
      // class row unsynced. So wait for the sync; each load re-reads the show's classes.
      await expect(async () => {
        await page.goto(resultsUrl, { waitUntil: 'domcontentloaded' });
        await expect(verifyButton).toBeVisible({ timeout: 10_000 });
      }).toPass({ timeout: 90_000 });
    });

    await test.step('4. tick every dog against the paper and verify', async () => {
      await expect(verifyButton).toBeVisible({ timeout: 30_000 });
      // Release stays held until the check is saved.
      await expect(verifyButton).toBeDisabled();
      await expect(releaseButton).toBeDisabled();
      const ticks = detail.getByRole('checkbox');
      await expect(ticks).toHaveCount(2);
      for (let index = 0; index < 2; index += 1) {
        await ticks.nth(index).check();
        await expect(ticks.nth(index)).toBeChecked();
      }
      await expect(verifyButton).toBeEnabled();
      await verifyButton.click();
      await expect(detail.getByText(/Scores checked against the paper by you/)).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step('5. release the results', async () => {
      await expect(releaseButton).toBeEnabled({ timeout: 20_000 });
      await releaseButton.click();
      await expect(page.getByText('Results released').first()).toBeVisible({ timeout: 20_000 });
      await expect(detail.getByText('Print the results sheet and ribbon labels')).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step('6. print the Results sheet and Ribbon labels from their reports', async () => {
      await printFromResults(page, detail, 'Results sheet', 'results-sheet');
      await page.goto(resultsUrl, { waitUntil: 'domcontentloaded' });
      await printFromResults(page, detail, 'Ribbon labels', 'result-labels');
    });

    await test.step('7. back on Results: both read printed, record the judge initials', async () => {
      await page.goto(resultsUrl, { waitUntil: 'domcontentloaded' });
      // A print Reports just recorded must read Printed here too, not Stale: the two pages
      // fingerprint the class from different read paths (buildReportPaperworkDescriptor).
      for (const label of ['Results sheet', 'Ribbon labels']) {
        await expect(paperworkRow(detail, label).getByText(/^Printed /)).toBeVisible({
          timeout: 30_000,
        });
      }
      await expect(signOff).toBeVisible({ timeout: 20_000 });
      const record = signOff.getByRole('button', { name: /^Record initials/ });
      await expect(record).toBeEnabled();
      await record.click();
      await expect(page.getByText('Initials recorded on 1 class')).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step('8. reload: released, checked and initialed', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(detail.getByText('Released', { exact: true }).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(detail.getByText(/Scores checked against the paper by you/)).toBeVisible();
      await expect(signOff.getByText('Initialed by judge').first()).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        signOff.getByRole('button', { name: `Undo initials: ${CLASS_NAME}` })
      ).toBeVisible();
      await expect(detail.getByText('All done for this class')).toBeVisible();
    });

    await test.step('9. the same class on a 375px phone fits the screen', async () => {
      await page.setViewportSize(PHONE);
      // The class is done now, so the default "Needs me" filter no longer lists it.
      await page.goto(`/shows/${encodeURIComponent(showId)}/results?status=all`, {
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
});
