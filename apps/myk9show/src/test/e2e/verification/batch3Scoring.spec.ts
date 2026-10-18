import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  evidence,
  fixture,
  isolatedClient,
  judgeRow,
  replica,
  rolePage,
  row,
  screenshot,
  setState,
  waiting,
} from './showDayProof.helpers';

test.beforeAll(async () => {
  const expected = process.env.MYK9_SHOW_DAY_SOURCE_SHA;
  if (!expected || !/^[a-f0-9]{40}$/.test(expected)) throw new Error('Missing exact source SHA');
  const response = await fetch('http://127.0.0.1:4173/build-sha.txt');
  expect(response.ok).toBe(true);
  expect((await response.text()).trim()).toBe(expected);
});

// This worker's browser belongs only to this spec. Also closes a context when
// signIn throws before rolePage returns it. Database cleanup is whole-stack only.
test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map(context => context.close()));
});

const DOGS = [
  'dededede-0000-0000-0000-000000000041',
  'dededede-0000-0000-0000-000000000046',
  'dededede-0000-0000-0000-000000000042',
  'dededede-0000-0000-0000-000000000043',
] as const;

async function scenario(
  client: ReturnType<typeof isolatedClient>,
  count: 1 | 2 | 4,
  element = 'Container'
) {
  const seed = await fixture(client);
  const [classRead, entriesRead, judgeRead, armbandRead] = await Promise.all([
    client.from('classes').select('*').eq('id', seed.classId).single(),
    client.from('entries').select('*').eq('class_id', seed.classId).is('deleted_at', null),
    client
      .from('judge_assignments')
      .select('person_id')
      .eq('class_id', seed.classId)
      .eq('status', 'confirmed')
      .single(),
    client
      .from('armbands')
      .select('dog_id,armband_number')
      .eq('show_id', seed.showId)
      .in('dog_id', [...DOGS]),
  ]);
  if (classRead.error) throw classRead.error;
  if (entriesRead.error) throw entriesRead.error;
  if (judgeRead.error) throw judgeRead.error;
  if (armbandRead.error) throw armbandRead.error;
  const template = entriesRead.data.find(entry => entry.id === seed.willowId);
  if (!template) throw new Error('Missing canonical entry template');
  const dogs = DOGS.slice(0, count);
  const missing = dogs.flatMap((dogId, index) => {
    const existing = armbandRead.data.find(armband => armband.dog_id === dogId);
    if (existing) {
      expect(existing.armband_number).toBe(String(200 + index));
      return [];
    }
    return [
      {
        id: randomUUID(),
        show_id: seed.showId,
        dog_id: dogId,
        armband_number: String(200 + index),
        is_available: false,
        assigned_at: new Date().toISOString(),
        version: 1,
      },
    ];
  });
  if (missing.length) {
    const { error } = await client.from('armbands').insert(missing);
    if (error) throw error;
  }
  const classId = randomUUID();
  const ids = dogs.map(() => randomUUID());
  const { error: classError } = await client.from('classes').insert({
    ...classRead.data,
    id: classId,
    name: `${element} Novice A`,
    element,
    status: 'upcoming',
    status_source: 'derived',
    is_scoring_finalized: false,
    actual_start_time: null,
    actual_end_time: null,
    scored_count: 0,
    version: 1,
  });
  if (classError) throw classError;
  const { error: judgeError } = await client.from('judge_assignments').insert({
    id: randomUUID(),
    person_id: judgeRead.data.person_id,
    show_id: seed.showId,
    trial_id: seed.trialId,
    class_id: classId,
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    version: 1,
  });
  if (judgeError) throw judgeError;
  const { data, error } = await client
    .from('entries')
    .insert(
      dogs.map((dogId, index) => ({
        ...(entriesRead.data.find(entry => entry.dog_id === dogId) ?? template),
        ...waiting,
        id: ids[index]!,
        class_id: classId,
        dog_id: dogId,
        armband: String(200 + index),
        run_order: index + 1,
        final_placement: null,
        scoring_completed_at: null,
        deleted_at: null,
        registration_id: null,
        entry_fee: 0,
        payment_status: 'pending',
        version: 1,
      }))
    )
    .select('id,armband,is_scored,result_status,final_placement')
    .order('armband');
  if (error) throw error;
  expect(data).toEqual(
    ids.map((id, index) => ({
      id,
      armband: String(200 + index),
      is_scored: false,
      result_status: 'pending',
      final_placement: null,
    }))
  );
  const state = await client
    .from('classes')
    .select('status,status_source,is_scoring_finalized')
    .eq('id', classId)
    .single();
  if (state.error) throw state.error;
  expect(state.data).toMatchObject({
    status: 'upcoming',
    status_source: 'derived',
    is_scoring_finalized: false,
  });
  return { showId: seed.showId, trialId: seed.trialId, classId, ids, willowId: ids[0]! };
}

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
    await expect(willow).toContainText('Q');
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
