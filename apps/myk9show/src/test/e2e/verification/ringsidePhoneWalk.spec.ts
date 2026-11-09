import { expect, test, type Page } from '@playwright/test';
import { disposableClass, registerDisposableProofHooks } from './disposableClass';
import {
  evidence,
  isolatedClient,
  judgeRow,
  rolePage,
  row,
  screenshot,
  setState,
  type Client,
} from './showDayProof.helpers';

/**
 * MYK9-1787: the phone-width walk. A judge's ringside list and scoresheet, and the secretary's
 * Check-in desk, walked at 375 px in the disposable local stack, on the flows the owner's phone
 * testing kept finding broken after merge (MYK9-1761, 1762, 1778). `scripts/qa/phone-walk.ts`
 * names the paths whose PRs must have this walk green before the review gate is posted.
 *
 * Every assertion on a dog's state reads the database row, not the page: the page is what
 * was wrong in those issues.
 */
registerDisposableProofHooks();

const PHONE = { width: 375, height: 812 } as const;

async function ringState(client: Client, id: string) {
  const { data, error } = await client
    .from('entries')
    .select('check_in_status,is_in_ring,is_scored,result_status,ring_entry_time')
    .eq('id', id)
    .single();
  if (error || !data) throw new Error('Local ring-state read failed: ' + error?.message);
  return data;
}

/** The page is the phone's width and nothing pushes it wider. */
async function expectFitsPhone(page: Page, stop: string) {
  const size = await page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(size.viewport, `${stop}: the walk is not at phone width`).toBe(PHONE.width);
  expect(size.content, `${stop}: the page scrolls sideways`).toBeLessThanOrEqual(PHONE.width);
}

test('Ringside at 375 px: open, leave unscored, score, reset (MYK9-1762, MYK9-1778)', async ({
  browser,
}, info) => {
  const client = isolatedClient();
  const f = await disposableClass(client, 1);
  const path = `/at-show/${f.showId}/class/${f.classId}`;
  const judge = await rolePage(browser, 'JUDGE', path, PHONE);
  const page = judge.page;
  const card = judgeRow(page, 'Willow');

  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card.getByTestId('check-in-indicator')).toHaveText(/Checked in/);
  await expectFitsPhone(page, 'entry list');
  await screenshot(page, info, 'phone-entry-list');

  // Opening the scoresheet moves the dog into the ring and starts its ring time.
  await card.getByRole('heading', { name: 'Willow', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/score/${f.willowId}`));
  const actionBar = page.getByTestId('scoresheet-action-bar');
  await expect(actionBar).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(() => ringState(client, f.willowId), { timeout: 30_000 })
    .toMatchObject({ check_in_status: 'in-ring', ring_entry_time: expect.any(String) });
  await expectFitsPhone(page, 'scoresheet');
  await screenshot(page, info, 'phone-scoresheet');

  // Leaving without a score puts the dog back where it was, with no ring time (MYK9-1762).
  await actionBar.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect
    .poll(() => ringState(client, f.willowId), { timeout: 30_000 })
    .toMatchObject({ check_in_status: 'checked-in', is_scored: false, ring_entry_time: null });
  await expect(card.getByTestId('check-in-indicator')).toHaveText(/Checked in/);
  await expect(card.getByText('Resume', { exact: true })).toHaveCount(0);
  const leftUnscored = await ringState(client, f.willowId);
  await screenshot(page, info, 'phone-left-unscored');

  // Score the dog: the result is saved and the dog is done.
  await card.getByRole('heading', { name: 'Willow', exact: true }).click();
  await expect(actionBar).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('result-Q').click();
  await page.getByRole('textbox', { name: /time$/i }).first().fill('01:02.03');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /Confirm & Submit/i }).click();
  await expect
    .poll(async () => (await row(client, f.willowId)).result_status, { timeout: 30_000 })
    .toBe('qualified');
  const scored = await ringState(client, f.willowId);

  // Reset the score: the dog is unscored again and its ring time is gone (MYK9-1778).
  await page.goto(path);
  await page.getByRole('button', { name: /^Completed/ }).click();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expectFitsPhone(page, 'completed list');
  await card.getByTestId('reset-menu-button').click();
  await page.getByRole('menuitem', { name: 'Reset score' }).click();
  await page.getByTestId('reset-dialog-confirm').click();
  await expect
    .poll(() => ringState(client, f.willowId), { timeout: 30_000 })
    .toMatchObject({ is_scored: false, result_status: 'pending', ring_entry_time: null });
  const afterReset = await ringState(client, f.willowId);
  expect(afterReset.check_in_status).not.toBe('in-ring');
  expect(judge.nonLocalSocketUrls).toEqual([]);
  await screenshot(page, info, 'phone-after-reset');
  await evidence(info, 'phone-ringside-walk', {
    viewport: PHONE,
    entryId: f.willowId,
    leftUnscored,
    scored,
    afterReset,
  });
});

test('Check-in desk at 375 px: check in, clear a flagged pull, undo (MYK9-1787)', async ({
  browser,
}, info) => {
  const client = isolatedClient();
  const f = await disposableClass(client, 1);
  await setState(client, f.willowId, { check_in_status: 'no-status' });

  const secretary = await rolePage(
    browser,
    'SECRETARY',
    `/shows/${f.showId}/entries?tab=exceptions&exception=check-in&checkin=pending`,
    PHONE
  );
  const page = secretary.page;
  const search = page.getByRole('textbox', { name: 'Search name, dog, armband' });
  await expect(search).toBeVisible({ timeout: 60_000 });
  await search.fill('Willow');
  const dog = page.getByRole('article', { name: 'Willow', exact: true });
  const checkIn = dog.getByRole('button', { name: 'Check in Willow', exact: true });
  await expect(checkIn).toBeVisible({ timeout: 60_000 });
  await expectFitsPhone(page, 'check-in desk');
  await screenshot(page, info, 'phone-check-in-desk');

  // The button covers every class the dog has waiting today; the walk's own entry is the proof.
  await checkIn.click();
  await expect
    .poll(async () => (await row(client, f.willowId)).check_in_status, { timeout: 30_000 })
    .toBe('checked-in');
  await expect(checkIn).toHaveCount(0);
  await expectFitsPhone(page, 'check-in desk, checked in');
  const checkedIn = await row(client, f.willowId);
  await screenshot(page, info, 'phone-check-in-desk-done');

  // Staff flag the dog as pulled while it is still entered. The desk shows the flag, and
  // clearing it puts the dog back to the status the flag replaced (MYK9-1757).
  await setState(client, f.willowId, { check_in_status: 'pulled' });
  await page.goto(`/shows/${f.showId}/entries?tab=exceptions&exception=check-in`);
  await expect(search).toBeVisible({ timeout: 60_000 });
  await search.fill('Willow');
  const clearFlag = dog.getByRole('button', { name: /^Clear the pull flag for Willow, / });
  await expect(clearFlag).toBeVisible({ timeout: 60_000 });
  await expectFitsPhone(page, 'check-in desk, flagged pull');
  await screenshot(page, info, 'phone-check-in-desk-flagged');
  // The dog has other classes of the same name; the flag marks which row is the walk's own.
  const rows = dog.getByRole('listitem');
  const ownIndex = await rows.evaluateAll(items =>
    items.findIndex(item => item.querySelector('button[aria-label^="Clear the pull flag"]'))
  );
  expect(ownIndex).toBeGreaterThanOrEqual(0);
  const ownRow = rows.nth(ownIndex);
  await clearFlag.click();
  await expect
    .poll(async () => (await row(client, f.willowId)).check_in_status, { timeout: 30_000 })
    .toBe('checked-in');
  await expect(clearFlag).toHaveCount(0);
  const flagCleared = await row(client, f.willowId);

  // Undo the check-in from the dog's class row: the dog is waiting again.
  await ownRow.getByRole('button', { name: /^Change status for Willow, .*: Checked-in$/ }).click();
  const picker = page.getByRole('dialog');
  await expect(picker).toBeVisible();
  await expectFitsPhone(page, 'check-in desk, status picker');
  await picker.getByRole('button', { name: /^Not checked in/ }).click();
  await expect
    .poll(async () => (await row(client, f.willowId)).check_in_status, { timeout: 30_000 })
    .toBe('no-status');
  await expect(checkIn).toBeVisible({ timeout: 30_000 });
  await expectFitsPhone(page, 'check-in desk, check-in undone');
  expect(secretary.nonLocalSocketUrls).toEqual([]);
  await screenshot(page, info, 'phone-check-in-desk-undone');
  await evidence(info, 'phone-check-in-desk', {
    viewport: PHONE,
    entryId: f.willowId,
    checkedIn,
    flagCleared,
    afterUndo: await row(client, f.willowId),
  });
});
