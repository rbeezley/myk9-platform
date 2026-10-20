import { expect, test } from '@playwright/test';
import { disposableClass as scenario, registerDisposableProofHooks } from './disposableClass';
import {
  evidence,
  isolatedClient,
  judgeRow,
  replica,
  rolePage,
  row,
  screenshot,
  setState,
} from './showDayProof.helpers';

registerDisposableProofHooks();

test('paper scoring persists one-entry and multi-entry results after reload (MYK9-1246)', async ({
  browser,
}, info) => {
  const client = isolatedClient();
  for (const cardinality of [1, 2] as const) {
    const f = await scenario(client, cardinality);
    const secretary = await rolePage(
      browser,
      'SECRETARY',
      `/scoring/classes/${f.classId}/entries?mode=split`
    );
    const page = secretary.page;
    await expect(page.getByRole('heading', { name: 'Container Novice A' })).toBeVisible();
    await page.getByRole('button', { name: /Willow/ }).click();
    await page.locator('button[aria-label="Q"]').filter({ hasText: 'Qualified' }).click();
    await page.getByLabel('Search Time', { exact: true }).fill('10203');
    await page.getByRole('button', { name: '+', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect
      .poll(
        async () => {
          const stored = await row(client, f.willowId);
          return [
            stored.is_scored,
            stored.result_status,
            stored.search_time_seconds,
            stored.total_faults,
          ];
        },
        { timeout: 60_000 }
      )
      .toEqual([true, 'qualified', 62.03, 1]);
    await page.reload();
    const willow = page.getByRole('button', { name: /Willow/ });
    await expect(willow.getByText('Q', { exact: true })).toBeVisible();
    await expect(willow).toContainText('1:02.03');
    await expect(willow).toContainText('1 fault');
    if ((await willow.getAttribute('data-active')) !== 'true') await willow.click();
    await expect
      .poll(async () =>
        (await page.getByLabel('Search Time', { exact: true }).inputValue()).replace(/\D/g, '')
      )
      .toBe('10203');
    await expect.poll(async () => (await replica(page, f.willowId)).pending.length).toBe(0);
    expect(secretary.nonLocalSocketUrls).toEqual([]);
    await evidence(info, `paper-${cardinality}-entry`, {
      ...f,
      cardinality,
      sql: await row(client, f.willowId),
      replica: await replica(page, f.willowId),
    });
    await screenshot(page, info, `paper-${cardinality}-after-reload`);
    await secretary.context.close();
  }
});

test('manual class placements agree in Check Scores, Fix and report preview (MYK9-1230/MYK9-1234)', async ({
  browser,
}, info) => {
  const client = isolatedClient();
  for (const [element, count] of [
    ['Container', 2],
    ['Vehicle', 4],
  ] as const) {
    const f = await scenario(client, count, element);
    const { error } = await client
      .from('classes')
      .update({ status: 'completed', status_source: 'manual' })
      .eq('id', f.classId);
    if (error) throw error;
    for (const [index, id] of f.ids.entries())
      await setState(client, id, {
        is_scored: true,
        result_status: index === 2 ? 'nq' : index === 3 ? 'absent' : 'qualified',
        search_time_seconds: index === 0 ? 40 : index === 1 ? 30 : 0,
        total_faults: 0,
        check_in_status: 'completed',
      });
    const { data: stored, error: storedError } = await client
      .from('entries')
      .select('id,armband,final_placement,result_status')
      .eq('class_id', f.classId)
      .is('deleted_at', null)
      .order('armband');
    if (storedError) throw storedError;
    // Acceptance pins: only qualified dogs rank; NQ/ABS follow by armband.
    expect(stored?.map(entry => entry.final_placement)).toEqual(
      count === 2 ? [2, 1] : [2, 1, null, null]
    );
    const secretary = await rolePage(
      browser,
      'SECRETARY',
      `/shows/${f.showId}/results?status=all&classId=${f.classId}`
    );
    const page = secretary.page;
    const table = page.getByRole('table');
    await expect(table.getByRole('row')).toHaveCount(count + 1);
    for (let index = 0; index < count; index++) {
      const entryRow = table
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: String(200 + index), exact: true }) });
      await expect(entryRow.getByRole('cell').first()).toHaveText(
        index === 0 ? '2' : index === 1 ? '1' : '—'
      );
    }
    await info.attach(`check-scores-${f.classId}`, {
      body: await table.screenshot(),
      contentType: 'image/png',
    });
    await page.getByRole('link', { name: 'Fix score for Willow', exact: true }).click();
    await expect(page.getByRole('button', { name: /Willow/ })).toContainText('2nd');
    await expect(page.getByRole('button', { name: /Cooper/ })).toContainText('1st');
    const unplaced =
      count === 4
        ? ([
            ['Ranger', 'NQ'],
            ['Juni', 'ABS'],
          ] as const)
        : [];
    for (const [dog, result] of unplaced) {
      const entryRow = page.getByRole('button', { name: new RegExp(dog) });
      await expect(entryRow).toBeVisible();
      await expect(entryRow).toContainText(result);
      await expect(entryRow).not.toContainText(/\b\d+(st|nd|rd|th)\b/);
    }
    await screenshot(page, info, `fix-${f.classId}`);
    await page.goto(
      `/shows/${f.showId}/reports?report=results-sheet&trialId=${f.trialId}&classId=${f.classId}`
    );
    const reportTable = page
      .frameLocator('iframe[title="Report Preview"]')
      .locator('table.report-table');
    await expect(reportTable).toBeVisible();
    const reportRows = reportTable.locator('tbody tr');
    await expect(reportRows).toHaveCount(count);
    const order = await reportRows.evaluateAll(rows =>
      rows.map(r => r.querySelectorAll('td')[1]?.textContent?.trim())
    );
    expect(order).toEqual(count === 2 ? ['201', '200'] : ['201', '200', '202', '203']);
    expect(secretary.nonLocalSocketUrls).toEqual([]);
    await evidence(info, `placements-${f.classId}`, {
      ...f,
      stored,
      previewOrder: order,
      nonLocalSockets: secretary.nonLocalSocketUrls,
    });
    await info.attach(`print-preview-${f.classId}`, {
      body: await reportTable.screenshot(),
      contentType: 'image/png',
    });
    await secretary.context.close();
  }
});

test('judge scoring persists the only entry after reload (MYK9-1246)', async ({
  browser,
}, info) => {
  const client = isolatedClient();
  const f = await scenario(client, 1);
  const path = `/at-show/${f.showId}/class/${f.classId}`;
  const judge = await rolePage(browser, 'JUDGE', `${path}/score/${f.willowId}`);
  const page = judge.page;
  await expect(page.getByTestId('result-Q')).toBeVisible();
  await page.getByTestId('result-Q').click();
  await page.getByRole('textbox', { name: /time$/i }).first().fill('01:02.03');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /Confirm & Submit/i }).click();
  await expect
    .poll(async () => (await row(client, f.willowId)).result_status, { timeout: 60_000 })
    .toBe('qualified');
  expect(await row(client, f.willowId)).toMatchObject({
    search_time_seconds: 62.03,
    total_faults: 0,
    is_scored: true,
  });
  await expect.poll(async () => (await replica(page, f.willowId)).pending.length).toBe(0);
  await page.goto(path);
  await expect(page.getByRole('button', { name: /^Completed/ })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^Completed/ }).click();
  const willow = judgeRow(page, 'Willow');
  await expect(willow).toContainText('1st');
  await expect(willow).toContainText(/1:02\.03|62\.03/);
  expect(judge.nonLocalSocketUrls).toEqual([]);
  await evidence(info, 'judge-single-after-reload', {
    ...f,
    sql: await row(client, f.willowId),
    replica: await replica(page, f.willowId),
  });
  await screenshot(page, info, 'judge-single-after-reload');
});
