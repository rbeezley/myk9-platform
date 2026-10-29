import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import {
  cleanupDisposableEntry,
  getIsolatedAdminClient,
  isIsolatedTarget,
  readReplicationStoreCount,
  seedDisposableEntry,
} from '../helpers/isolatedFixtures';

/**
 * Suite category: regression (isolated only).
 *
 * MYK9-1474. Venue Wi-Fi with no uplink fails every fetch fast while
 * `navigator.onLine` stays TRUE, so nothing pauses the mutation queue. Before the
 * fix a queued write spent its 3 retries in about 7 s and parked in Sync issues.
 * Now a transport failure confirmed by the `/auth/v1/health` probe spends no
 * retry budget, so the write stays queued and uploads itself when the uplink
 * returns.
 *
 * The outage aborts EVERY request to the Supabase origin, probe included. The
 * control aborts only the RPC: the probe answers, the server counts as reachable,
 * and the failure must still park. Without that control a walk that never
 * reached the parking path would pass.
 */

const SUPABASE = process.env.VITE_SUPABASE_URL ?? '';
const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const CLASS_ID = 'dec1a55e-0000-0000-0000-000000000032';
const TEMPLATE_ENTRY_ID = 'dededede-0000-0000-0000-000000000053';
const OUTAGE_MS = 60_000;

test.describe.configure({ mode: 'serial' });
test.skip(!isIsolatedTarget(), 'writes real rows: isolated Supabase target only');

/** Aborts requests matching `pattern` while down; `navigator.onLine` is left untouched. */
async function uplink(context: BrowserContext, pattern = `${SUPABASE}/**`) {
  let down = false;
  let aborted = 0;
  await context.route(pattern, route => {
    if (!down) return route.fallback();
    aborted += 1;
    return route.abort('internetdisconnected');
  });
  return {
    drop: () => {
      down = true;
    },
    restore: () => {
      down = false;
    },
    aborted: () => aborted,
  };
}

/** Across the outage the write stays queued and never reaches failed_mutations. */
async function holdOutage(page: Page, label: string) {
  await expect
    .poll(() => readReplicationStoreCount(page, 'pending_mutations'), {
      timeout: 15_000,
      message: `${label}: nothing was queued`,
    })
    .toBeGreaterThan(0);
  for (let elapsed = 0; elapsed <= OUTAGE_MS; elapsed += 10_000) {
    if (elapsed > 0) await page.waitForTimeout(10_000);
    expect(
      await readReplicationStoreCount(page, 'failed_mutations'),
      `${label}: parked at t+${elapsed / 1000}s`
    ).toBe(0);
    expect(
      await readReplicationStoreCount(page, 'pending_mutations'),
      `${label}: queue emptied while the uplink was down`
    ).toBeGreaterThan(0);
  }
  await expect(page.getByText(/couldn't update|Sync issues/i)).toHaveCount(0);
}

async function openScoresheet(page: Page, entryId: string) {
  await signInAsSecretary(page, `/at-show/${SHOW_ID}/class/${CLASS_ID}/score/${entryId}`);
  await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible({ timeout: 30_000 });
}

async function submitQualified(page: Page) {
  await page.getByTestId('result-Q').click();
  await page.getByRole('button', { name: /^Save$/ }).click();
  await page.getByRole('button', { name: /Confirm & Submit/i }).click();
  await expect(page).toHaveURL(new RegExp(`/class/${CLASS_ID}`), { timeout: 15_000 });
}

async function readScored(entryId: string) {
  const { data, error } = await getIsolatedAdminClient()
    .from('entries')
    .select('is_scored, result_status')
    .eq('id', entryId)
    .single();
  if (error) throw new Error(`Could not read entry: ${error.message}`);
  return data;
}

test('a ringside score survives a 60 s fast-failing uplink and uploads itself', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  const seed = await seedDisposableEntry({
    showId: SHOW_ID,
    classId: CLASS_ID,
    templateEntryId: TEMPLATE_ENTRY_ID,
    label: 'Uplink Outage',
  });
  try {
    const net = await uplink(context);
    await openScoresheet(page, seed.entryId);
    await expect(page.evaluate(() => navigator.onLine)).resolves.toBe(true);

    net.drop();
    await submitQualified(page);
    await holdOutage(page, 'score');
    expect(net.aborted()).toBeGreaterThan(0);

    const uploaded = page.waitForResponse(
      r => r.url().includes('/rest/v1/rpc/ringside_update_entry') && r.ok(),
      { timeout: 90_000 }
    );
    net.restore();
    expect(JSON.parse((await uploaded).request().postData() ?? '{}')).toMatchObject({
      p_entry_id: seed.entryId,
    });
    await expect
      .poll(() => readReplicationStoreCount(page, 'pending_mutations'), { timeout: 30_000 })
      .toBe(0);
    expect(await readReplicationStoreCount(page, 'failed_mutations')).toBe(0);
    await expect
      .poll(() => readScored(seed.entryId), { timeout: 20_000 })
      .toEqual({ is_scored: true, result_status: 'qualified' });
  } finally {
    await cleanupDisposableEntry(seed);
  }
});

test('control: a reachable server that refuses the RPC still parks the score', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const seed = await seedDisposableEntry({
    showId: SHOW_ID,
    classId: CLASS_ID,
    templateEntryId: TEMPLATE_ENTRY_ID,
    label: 'Uplink Control',
  });
  try {
    // Only the RPC fails; the health probe still answers.
    const rpc = await uplink(context, `${SUPABASE}/rest/v1/rpc/ringside_update_entry`);
    await openScoresheet(page, seed.entryId);
    rpc.drop();
    await submitQualified(page);
    await expect
      .poll(() => readReplicationStoreCount(page, 'failed_mutations'), { timeout: 60_000 })
      .toBeGreaterThan(0);
  } finally {
    await cleanupDisposableEntry(seed);
  }
});

/** Show home, select mode, Trial 3 (two not-started classes) all ticked. */
async function selectTrial3(page: Page) {
  await page.getByRole('button', { name: /^Expand Trial 3/ }).click({ timeout: 30_000 });
  await page.getByRole('checkbox', { name: /^Select every class in Trial 3/ }).check();
}

async function assignJudge(page: Page, pick: 'first' | 'Unassigned') {
  await page.getByRole('button', { name: /^Assign judge/ }).click();
  if (pick === 'Unassigned') {
    await page.getByRole('menuitem', { name: 'Unassigned' }).click();
    return 'Unassigned';
  }
  const judges = page
    .getByRole('menuitem')
    .filter({ hasNotText: /Unassigned|Loading|can't load/i });
  await expect(judges.first()).toBeVisible({ timeout: 15_000 });
  const name = (await judges.first().innerText()).trim();
  await judges.first().click();
  return name;
}

async function expectTrial3Judge(page: Page, text: string) {
  await page.reload();
  await page.getByRole('button', { name: /^Expand Trial 3/ }).click({ timeout: 30_000 });
  for (const cls of ['Container Advanced', 'Handler Discrimination Novice A']) {
    // The nearest ancestor holding the whole row (its "N of 7 steps done" line too).
    const row = page
      .getByRole('button', { name: cls, exact: true })
      .locator('xpath=ancestor::*[contains(normalize-space(.), "steps done")][1]');
    await expect(row).toContainText(text, { timeout: 15_000 });
  }
}

test('a judge pick survives a 60 s fast-failing uplink and uploads itself', async ({
  page,
  context,
}) => {
  test.setTimeout(300_000);
  const net = await uplink(context);
  await signInAsSecretary(page, `/shows/${SHOW_ID}?select=classes`);
  await selectTrial3(page);
  try {
    net.drop();
    const judge = await assignJudge(page, 'first');
    await holdOutage(page, 'judge pick');

    const statuses: number[] = [];
    page.on('response', r => {
      if (r.url().includes('/rest/v1/rpc/set_class_judge')) statuses.push(r.status());
    });
    net.restore();
    await expect
      .poll(() => readReplicationStoreCount(page, 'pending_mutations'), { timeout: 60_000 })
      .toBe(0);
    expect(await readReplicationStoreCount(page, 'failed_mutations')).toBe(0);
    expect(statuses.length).toBeGreaterThanOrEqual(2);
    expect(statuses.every(s => s >= 200 && s < 300)).toBe(true);
    await expectTrial3Judge(page, judge);
  } finally {
    // Put Trial 3 back as the seed has it, through the same bulk action.
    net.restore();
    await page.goto(`/shows/${SHOW_ID}?select=classes`);
    await selectTrial3(page);
    await assignJudge(page, 'Unassigned');
    await expect
      .poll(() => readReplicationStoreCount(page, 'pending_mutations'), { timeout: 60_000 })
      .toBe(0);
  }
});
