import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  classPath,
  type Fixture,
  evidence,
  fixture,
  isolatedClient,
  judgeRow,
  replica,
  reset,
  rolePage,
  row,
  screenshot,
  setState,
  waiting,
} from './showDayProof.helpers';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const expected = process.env.MYK9_SHOW_DAY_SOURCE_SHA;
  if (!expected || !/^[a-f0-9]{40}$/.test(expected)) throw new Error('Missing exact source SHA');
  const response = await fetch('http://127.0.0.1:4173/build-sha.txt');
  expect(response.ok).toBe(true);
  expect((await response.text()).trim()).toBe(expected);
});

async function restoreCompanion(client: ReturnType<typeof isolatedClient>, id: string) {
  const { error } = await client.from('entries').update({ deleted_at: null }).eq('id', id);
  if (error) throw error;
}

async function resetClass(client: ReturnType<typeof isolatedClient>, f: Fixture) {
  const { error } = await client
    .from('classes')
    .update({
      status: 'upcoming',
      status_source: 'derived',
      is_scoring_finalized: false,
      actual_start_time: null,
      actual_end_time: null,
    })
    .eq('id', f.classId);
  if (error) throw error;
  await reset(client, f);
  const state = await client
    .from('classes')
    .select('status,status_source,is_scoring_finalized')
    .eq('id', f.classId)
    .single();
  if (state.error) throw state.error;
  expect(state.data).toMatchObject({
    status: 'upcoming',
    status_source: 'derived',
    is_scoring_finalized: false,
  });
  const entries = await client
    .from('entries')
    .select('is_scored,result_status,final_placement')
    .eq('class_id', f.classId)
    .is('deleted_at', null);
  if (entries.error) throw entries.error;
  expect(entries.data).toHaveLength(2);
  for (const entry of entries.data)
    expect(entry).toMatchObject({
      is_scored: false,
      result_status: 'pending',
      final_placement: null,
    });
}

async function removeVehicle(
  client: ReturnType<typeof isolatedClient>,
  id: string,
  armbands: string[]
) {
  const { error: entriesError } = await client.from('entries').delete().eq('class_id', id);
  if (entriesError) throw entriesError;
  const { error: classError } = await client.from('classes').delete().eq('id', id);
  if (classError) throw classError;
  const { error: armbandError } = await client.from('armbands').delete().in('id', armbands);
  if (armbandError) throw armbandError;
}

async function finishVehicle(
  client: ReturnType<typeof isolatedClient>,
  id: string,
  armbands: string[],
  primaryError: unknown
) {
  try {
    await removeVehicle(client, id, armbands);
  } catch (cleanupError) {
    if (primaryError !== undefined)
      throw new AggregateError([primaryError, cleanupError], 'Vehicle proof and cleanup failed');
    throw cleanupError;
  }
}

test('paper scoring persists one-entry and multi-entry results after reload (MYK9-1246)', async ({
  browser,
}, info) => {
  const client = isolatedClient();
  const f = await fixture(client);
  for (const cardinality of [1, 2]) {
    await resetClass(client, f);
    const { error } = await client
      .from('entries')
      .update({ deleted_at: cardinality === 1 ? new Date().toISOString() : null })
      .eq('id', f.cooperId);
    if (error) throw error;
    const { count, error: countError } = await client
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', f.classId)
      .is('deleted_at', null);
    if (countError) throw countError;
    expect(count).toBe(cardinality);
    const secretary = await rolePage(
      browser,
      'SECRETARY',
      `/scoring/classes/${f.classId}/entries?mode=split`
    );
    try {
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
      if ((await willow.getAttribute('data-active')) !== 'true') await willow.click();
      await expect
        .poll(async () =>
          (await page.getByLabel('Search Time', { exact: true }).inputValue()).replace(/\D/g, '')
        )
        .toBe('10203');
      await expect.poll(async () => (await replica(page, f.willowId)).pending.length).toBe(0);
      await evidence(info, `paper-${cardinality}-entry`, {
        classId: f.classId,
        cardinality,
        sql: await row(client, f.willowId),
        replica: await replica(page, f.willowId),
      });
      await screenshot(page, info, `paper-${cardinality}-after-reload`);
    } finally {
      await secretary.context.close();
      await restoreCompanion(client, f.cooperId);
    }
  }
});

test('manual class placements agree in Check Scores, Fix and report preview (MYK9-1230/MYK9-1234)', async ({
  browser,
}, info) => {
  const client = isolatedClient();
  const f = await fixture(client);
  await resetClass(client, f);
  const { data: classTemplate, error: classReadError } = await client
    .from('classes')
    .select('*')
    .eq('id', f.classId)
    .single();
  const { data: entryTemplate, error: entryReadError } = await client
    .from('entries')
    .select('*')
    .eq('id', f.willowId)
    .single();
  if (classReadError || !classTemplate) throw classReadError ?? new Error('No class template');
  if (entryReadError || !entryTemplate) throw entryReadError ?? new Error('No entry template');
  const vehicleId = randomUUID();
  const vehicleEntries = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const addedArmbands = [randomUUID(), randomUUID()];
  let primaryError: unknown;
  try {
    const { error: classInsertError } = await client.from('classes').insert({
      ...classTemplate,
      id: vehicleId,
      name: 'Vehicle Novice A',
      element: 'Vehicle',
      status: 'upcoming',
      status_source: 'derived',
      is_scoring_finalized: false,
      actual_start_time: null,
      actual_end_time: null,
      scored_count: 0,
      version: 1,
    });
    if (classInsertError) throw classInsertError;
    const dogs = [
      entryTemplate.dog_id,
      'dededede-0000-0000-0000-000000000046',
      'dededede-0000-0000-0000-000000000042',
      'dededede-0000-0000-0000-000000000043',
    ];
    const { error: armbandError } = await client.from('armbands').insert(
      addedArmbands.map((id, index) => ({
        id,
        show_id: f.showId,
        dog_id: dogs[index + 2]!,
        armband_number: String(202 + index),
        is_available: false,
        assigned_at: new Date().toISOString(),
        version: 1,
      }))
    );
    if (armbandError) throw armbandError;
    const { error: entryInsertError } = await client.from('entries').insert(
      vehicleEntries.map((id, index) => ({
        ...entryTemplate,
        ...waiting,
        id,
        class_id: vehicleId,
        dog_id: dogs[index]!,
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
    );
    if (entryInsertError) throw entryInsertError;
    const inserted = await client
      .from('entries')
      .select('dog_id,armband')
      .eq('class_id', vehicleId)
      .order('armband');
    if (inserted.error) throw inserted.error;
    expect(inserted.data).toEqual(
      dogs.map((dog_id, index) => ({ dog_id, armband: String(200 + index) }))
    );
    const cases = [
      { id: f.classId, ids: [f.willowId, f.cooperId], order: ['201', '200'] },
      { id: vehicleId, ids: vehicleEntries, order: ['201', '200', '202', '203'] },
    ];
    for (const scenario of cases) {
      const { error: manualError } = await client
        .from('classes')
        .update({ status: 'completed', status_source: 'manual' })
        .eq('id', scenario.id);
      if (manualError) throw manualError;
      for (const [index, id] of scenario.ids.entries())
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
        .eq('class_id', scenario.id)
        .is('deleted_at', null)
        .order('armband');
      if (storedError) throw storedError;
      // Acceptance pins: only qualified dogs rank; NQ/ABS follow by armband.
      expect(stored?.map(e => e.final_placement)).toEqual(
        scenario.ids.length === 2 ? [2, 1] : [2, 1, null, null]
      );
      const secretary = await rolePage(
        browser,
        'SECRETARY',
        `/shows/${f.showId}/results?status=all&classId=${scenario.id}`
      );
      try {
        const page = secretary.page;
        const table = page.getByRole('table');
        await expect(table.getByRole('row')).toHaveCount(scenario.ids.length + 1);
        for (const [armband, placement] of [
          ['200', '2'],
          ['201', '1'],
        ]) {
          const entryRow = table
            .getByRole('row')
            .filter({ has: page.getByRole('cell', { name: armband, exact: true }) });
          await expect(entryRow.getByRole('cell').first()).toHaveText(placement!);
        }
        await screenshot(page, info, `check-scores-${scenario.id}`);
        await page.getByRole('link', { name: 'Fix score for Willow', exact: true }).click();
        await expect(page.getByRole('button', { name: /Willow/ })).toContainText('2nd');
        await expect(page.getByRole('button', { name: /Cooper/ })).toContainText('1st');
        await screenshot(page, info, `fix-${scenario.id}`);
        await page.goto(
          `/shows/${f.showId}/reports?report=results-sheet&trialId=${f.trialId}&classId=${scenario.id}`
        );
        const preview = page.frameLocator('iframe[title="Report Preview"]');
        const reportRows = preview.locator('table.report-table tbody tr');
        await expect(reportRows).toHaveCount(scenario.ids.length);
        const order = await reportRows.evaluateAll(rows =>
          rows.map(r => r.querySelectorAll('td')[1]?.textContent?.trim())
        );
        expect(order).toEqual(scenario.order);
        await evidence(info, `placements-${scenario.id}`, {
          stored,
          previewOrder: order,
          nonLocalSockets: secretary.nonLocalSocketUrls,
        });
        expect(secretary.nonLocalSocketUrls).toEqual([]);
        await screenshot(page, info, `print-preview-${scenario.id}`);
      } finally {
        await secretary.context.close();
      }
    }
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    await finishVehicle(client, vehicleId, addedArmbands, primaryError);
  }
});

test('judge scoring persists the only entry after reload (MYK9-1246)', async ({
  browser,
}, info) => {
  const client = isolatedClient();
  const f = await fixture(client);
  await resetClass(client, f);
  const { error } = await client
    .from('entries')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', f.cooperId);
  if (error) throw error;
  const judge = await rolePage(browser, 'JUDGE', `${classPath(f)}/score/${f.willowId}`);
  try {
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
    await page.goto(classPath(f));
    await expect(page.getByRole('button', { name: /^Completed/ })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: /^Completed/ }).click();
    const willow = judgeRow(page, 'Willow');
    await expect(willow).toContainText('1st');
    await expect(willow).toContainText(/1:02\.03|62\.03/);
    await evidence(info, 'judge-single-after-reload', {
      sql: await row(client, f.willowId),
      replica: await replica(page, f.willowId),
    });
    await screenshot(page, info, 'judge-single-after-reload');
  } finally {
    await judge.context.close();
    await restoreCompanion(client, f.cooperId);
  }
});
