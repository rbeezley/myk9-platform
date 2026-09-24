import { test, expect } from '@playwright/test';
import type { Response } from '@playwright/test';
import { dataAbsent, judgeRead } from './helpers/liveCanary';
import { signInAsExhibitor } from './helpers/testUsers';

/**
 * The exhibitor read path, against LIVE data, with no fixture.
 *
 * The PR-smoke UI specs run on hermetic fixtures (exhibitorFixture.ts), so
 * they no longer notice when the real read path breaks: a tightened policy, a
 * moved view, a renamed column. This spec is the one place that still talks
 * to Supabase for the exhibitor, and it has to tell two situations apart
 * (docs/plan-hermetic-e2e-fixtures.md, Phase 4):
 *
 * - DATA ABSENT: staging has no profile row or no entries for the demo
 *   exhibitor. That is an operational condition, not a verdict on the diff,
 *   so PR smoke SKIPS, with an annotation that names it. On 2026-09-20 the
 *   suite could not make this distinction and reported an empty database as
 *   broken code on every open PR.
 * - READ PATH BROKEN: a read on the path answers 4xx/5xx, or the data is
 *   there and the page does not render it. That blocks.
 *
 * WHAT IT PROVES, EXACTLY. Two reads are REQUIRED: `exhibitor_profiles` and
 * the entries view `view_authenticated_entry_results`. Each must complete
 * and be judged well-formed, or the canary fails. Those two decide whether My
 * Shows works: the profile gates the page, and entry rows carry their show
 * and dog as embeds. `shows` and `dogs` are only WATCHED: if they are read and
 * fail, the canary fails, but it does not require them to be read at all.
 * They are replication pulls, and requiring them would pin the canary to
 * replication internals rather than to what the exhibitor sees (Codex review,
 * #2392).
 *
 * The absent/broken classifier lives in helpers/liveCanary.ts, shared with
 * walkRegressionCanaries.spec.ts. In the nightly regression run
 * (MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true), absence FAILS too: that run
 * targets a seeded database, so an empty one is exactly what the nightly
 * exists to report, once a night instead of on every pull request.
 */

// Every read judged for breakage. Only the first two are REQUIRED to happen;
// see "WHAT IT PROVES" above.
const READ_PATH = ['exhibitor_profiles', 'view_authenticated_entry_results', 'shows', 'dogs'];

function readPathTable(response: Response): string | undefined {
  const match = /\/rest\/v1\/([^?/]+)/.exec(response.url());
  const table = match?.[1];
  return table && READ_PATH.includes(table) ? table : undefined;
}

test('exhibitor read path works against live data', async ({ page }) => {
  const broken: string[] = [];
  // Undefined until a read of that table has been JUDGED ok. Zero is never a
  // default: it can only come from a successful, well-formed empty read.
  let profileRows: number | undefined;
  let entryRows: number | undefined;

  page.on('response', async response => {
    const table = readPathTable(response);
    if (!table || response.request().method() !== 'GET') return;
    const outcome = await judgeRead(response);
    if (!outcome.ok) {
      broken.push(`${table}: ${outcome.reason}`);
      return;
    }
    if (table === 'exhibitor_profiles') profileRows = outcome.rows;
    if (table === 'view_authenticated_entry_results') {
      entryRows = (entryRows ?? 0) + outcome.rows;
    }
  });

  const assertNoBrokenRead = () =>
    expect(broken, 'a live read on the exhibitor path failed. This IS a regression').toEqual([]);

  await signInAsExhibitor(page, '/exhibitor/entries');
  // Settle on the profile read OR a failed read, then report the failure
  // first: a 403 can stop the page mounting, and "My Shows did not mount"
  // would name the symptom instead of the broken read.
  await expect
    .poll(() => profileRows !== undefined || broken.length > 0, {
      timeout: 15000,
      message: 'the exhibitor_profiles read never completed',
    })
    .toBe(true);
  assertNoBrokenRead();

  if (profileRows === 0) dataAbsent('the demo exhibitor has no exhibitor_profiles row');

  // Profile present: the onboarding gate must let the exhibitor through.
  const heading = page.getByRole('heading', { name: 'My Shows', level: 1 });
  await expect
    .poll(async () => broken.length > 0 || (await heading.isVisible()), { timeout: 15000 })
    .toBe(true)
    .catch(() => undefined);
  assertNoBrokenRead();
  await expect(
    heading,
    'the demo exhibitor has a profile row, yet My Shows did not mount'
  ).toBeVisible();
  await expect
    .poll(() => entryRows !== undefined || broken.length > 0, {
      timeout: 15000,
      message:
        'My Shows mounted but the entries view was never read successfully. The read ' +
        'path is broken, not the data: this IS a regression',
    })
    .toBe(true);
  await page.waitForLoadState('networkidle');

  assertNoBrokenRead();
  if (entryRows === 0) dataAbsent('the demo exhibitor has no entries');

  // Entries came back from the real view: they must reach the page.
  await expect(
    page.locator('.myk9-entries-dog-card').first(),
    `the real view returned ${entryRows} entry row(s) but no dog card rendered`
  ).toBeVisible({ timeout: 15000 });
});
