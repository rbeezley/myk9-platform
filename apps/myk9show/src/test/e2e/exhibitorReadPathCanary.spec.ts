import { test, expect } from '@playwright/test';
import type { Response } from '@playwright/test';
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
 * In the nightly regression run (MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true),
 * absence FAILS too: that run targets a seeded database, so an empty one is
 * exactly what the nightly exists to report, once a night instead of on every
 * pull request.
 */

const READ_PATH = ['exhibitor_profiles', 'view_authenticated_entry_results', 'shows', 'dogs'];
const DATA_REQUIRED = process.env.MYK9_PLAYWRIGHT_REGRESSION_ENABLED === 'true';

function readPathTable(response: Response): string | undefined {
  const match = /\/rest\/v1\/([^?/]+)/.exec(response.url());
  const table = match?.[1];
  return table && READ_PATH.includes(table) ? table : undefined;
}

test('exhibitor read path works against live data', async ({ page }) => {
  const broken: string[] = [];
  let profileRows: number | undefined;
  let entryRows = 0;

  page.on('response', async response => {
    const table = readPathTable(response);
    if (!table || response.request().method() !== 'GET') return;
    if (response.status() >= 400) {
      broken.push(`${response.status()} ${table}`);
      return;
    }
    const rows = await response.json().catch(() => null);
    const count = Array.isArray(rows) ? rows.length : rows ? 1 : 0;
    if (table === 'exhibitor_profiles') profileRows = count;
    if (table === 'view_authenticated_entry_results') entryRows += count;
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

  const absent = (what: string) => {
    const note =
      `staging data is missing (${what}); the exhibitor read path was NOT exercised. ` +
      'This is not a verdict on the diff. Reseed staging (seed-reset skill) to restore coverage.';
    if (DATA_REQUIRED) throw new Error(`nightly: ${note}`);
    test.info().annotations.push({ type: 'staging-data-absent', description: note });
    test.skip(true, note);
  };

  if (profileRows === 0) absent('the demo exhibitor has no exhibitor_profiles row');

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
  await page.waitForLoadState('networkidle');

  assertNoBrokenRead();
  if (entryRows === 0) absent('the demo exhibitor has no entries');

  // Entries came back from the real view: they must reach the page.
  await expect(
    page.locator('.myk9-entries-dog-card').first(),
    `the real view returned ${entryRows} entry row(s) but no dog card rendered`
  ).toBeVisible({ timeout: 15000 });
});
