import { expect, test } from '@playwright/test';
import { registerDisposableProofHooks } from './disposableClass';
import { NATIONALS_ARMBAND, nationalsEntry, nationalsTrial } from './nationalsFixture';
import {
  evidence,
  isolatedClient,
  judgeRow,
  replica,
  rolePage,
  screenshot,
} from './showDayProof.helpers';

registerDisposableProofHooks();

// MYK9-1879: the MYK9-1806 review found the ordinary show-day walk never exercises AKC Nationals
// scoring or the persisted leaderboard result. This walk does, on a Nationals trial of its own.
test('Nationals judge walk: no placement chips, a saved Q persists, and the leaderboard ranks it (MYK9-1879)', async ({
  browser,
}, info) => {
  const client = isolatedClient();
  const f = await nationalsTrial(client);
  const classPath = `/at-show/${f.showId}/class/${f.classId}`;

  const judge = await rolePage(browser, 'JUDGE', `${classPath}/score/${f.entryId}`);
  const page = judge.page;

  // The Nationals sheet (not the standard one) is on screen, and it offers results only.
  await expect(page.getByText('AKC Nationals', { exact: true })).toBeVisible();
  for (const result of ['Q', 'NQ', 'ABS', 'EX', 'DQ'])
    await expect(page.getByTestId(`result-${result}`)).toBeVisible();
  for (const place of ['1st', '2nd', '3rd', '4th']) {
    await expect(page.getByTestId(`result-${place}`)).toHaveCount(0);
    await expect(page.getByRole('button', { name: new RegExp(`^${place}\\b`) })).toHaveCount(0);
  }
  await expect(page.getByText(/placement \(optional\)/i)).toHaveCount(0);
  await screenshot(page, info, 'nationals-sheet-no-placement-chips');

  // Three correct alerts and one incorrect: 3 x 10 - 5 = 25 points; area 1 took 20 seconds.
  for (let i = 0; i < 3; i++) await page.getByTestId('correct-inc').click();
  await page.getByTestId('incorrect-inc').click();
  await expect(page.getByTestId('total-points')).toHaveText('25');
  await page.getByRole('textbox', { name: 'Area 1 time' }).fill('00:20.00');
  await page.getByTestId('result-Q').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /Confirm & Submit/i }).click();

  // The result, the points and the server's own placement all land in the database.
  await expect
    .poll(async () => (await nationalsEntry(client, f.entryId)).result_status, { timeout: 60_000 })
    .toBe('qualified');
  expect(await nationalsEntry(client, f.entryId)).toMatchObject({
    is_scored: true,
    result_status: 'qualified',
    points_earned: 25,
    search_time_seconds: 20,
    final_placement: 1,
    total_correct_finds: 3,
    total_incorrect_finds: 1,
  });
  await expect.poll(async () => (await replica(page, f.entryId)).pending.length).toBe(0);

  // The class list shows it Completed, and it is still there after a reload.
  await page.goto(classPath);
  await expect(page.getByRole('button', { name: /^Completed/ })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^Completed/ }).click();
  await expect(judgeRow(page, 'Willow')).toBeVisible();
  expect(await nationalsEntry(client, f.entryId)).toMatchObject({
    result_status: 'qualified',
    points_earned: 25,
    final_placement: 1,
  });
  expect(judge.nonLocalSocketUrls).toEqual([]);
  await screenshot(page, info, 'nationals-completed-after-reload');
  await judge.context.close();

  // The leaderboard ranks released classes only, so set the release column the leaderboard reads directly (the release control itself is not under test).
  const { error: releaseError } = await client
    .from('classes')
    .update({ results_released_at: new Date().toISOString() })
    .eq('id', f.classId);
  if (releaseError) throw releaseError;

  const secretary = await rolePage(browser, 'SECRETARY', `/at-show/${f.showId}/leaderboard`);
  const board = secretary.page;
  await expect(board.getByRole('heading', { name: 'Nationals Leaderboard' })).toBeVisible();
  const dog = board
    .getByRole('row')
    .filter({ has: board.getByRole('cell', { name: NATIONALS_ARMBAND, exact: true }) });
  await expect(dog).toHaveCount(1);
  await expect(dog.getByRole('cell').first()).toHaveText('1');
  await expect(dog).toContainText('Willow');
  await expect(dog.getByRole('cell', { name: '25', exact: true }).first()).toBeVisible();
  expect(secretary.nonLocalSocketUrls).toEqual([]);
  await evidence(info, 'nationals-walk', {
    ...f,
    sql: await nationalsEntry(client, f.entryId),
  });
  await screenshot(board, info, 'nationals-leaderboard');
  await secretary.context.close();
});
