import { expect, test, type Page } from '@playwright/test';
import { performance } from 'node:perf_hooks';
import {
  classPath,
  evidence,
  fixture,
  isolatedClient,
  judgeRow,
  secretaryRow,
  replica,
  reset,
  rolePage,
  row,
  screenshot,
  secretaryPath,
  sessionIdentity,
  setState,
  waiting,
} from './showDayProof.helpers';

// Fail the short matrix before spending an hour on endurance proof.
test.describe.configure({ mode: 'serial' });

// Manual verification: real loopback Supabase, current built app, no clock or transport mocks.
test('canonical queue positions and state-only controls agree across roles (MYK9-992)', async ({
  browser,
}, info) => {
  test.skip(
    info.project.name !== 'isolated-show-day-proof',
    'Use the dedicated manual proof config'
  );
  test.setTimeout(12 * 60_000);
  const client = isolatedClient();
  const buildResponse = await fetch('http://127.0.0.1:4173/build-sha.txt');
  expect(buildResponse.ok).toBe(true);
  const testedBuild = (await buildResponse.text()).trim();
  expect(testedBuild).toBe(process.env.MYK9_SHOW_DAY_SOURCE_SHA);
  const f = await fixture(client);
  await reset(client, f);
  const cases = [
    {
      name: 'null',
      fields: { ...waiting, run_order: null },
      exhibitor: /not posted|position pending/i,
    },
    { name: 'gapped', fields: { ...waiting, run_order: 101 }, exhibitor: /2nd up/ },
    {
      name: 'in-ring',
      fields: { ...waiting, run_order: 101, check_in_status: 'in-ring', is_in_ring: true },
      exhibitor: /in ring/i,
    },
    {
      name: 'pulled',
      fields: { ...waiting, run_order: 101, check_in_status: 'pulled' },
      exhibitor: /pulled/i,
    },
    {
      name: 'completed',
      fields: {
        ...waiting,
        run_order: 101,
        check_in_status: 'completed',
        is_scored: true,
        result_status: 'qualified',
        search_time_seconds: 61.23,
      },
      exhibitor: /qualified|completed|done/i,
    },
  ];
  try {
    for (const scenario of cases)
      await test.step(scenario.name, async () => {
        const stored = await setState(client, f.willowId, scenario.fields);
        const secretary = await rolePage(browser, 'SECRETARY', secretaryPath(f));
        const judge = await rolePage(browser, 'JUDGE', classPath(f));
        const exhibitor = await rolePage(browser, 'DEMO_EXHIBITOR', `/at-show/${f.showId}`);
        try {
          const secRow = secretaryRow(secretary.page, 'Willow');
          const ringRow = judgeRow(judge.page, 'Willow');
          const ownRow = exhibitor.page.getByTestId(`at-show-my-entry-${f.willowId}`);
          if (scenario.name === 'completed')
            await judge.page.getByRole('button', { name: /^Completed/ }).click();
          for (const entryRow of [secRow, ringRow, ownRow]) {
            await expect(entryRow).toHaveCount(1);
            await expect(entryRow).toBeVisible();
            await expect(entryRow).not.toContainText(/\b101(?:st|th)?(?: up)?\b/);
          }
          const status = scenario.fields.check_in_status;
          const statusLabel =
            status === 'checked-in'
              ? /checked[- ]in/i
              : status === 'in-ring'
                ? /in ring/i
                : new RegExp(status, 'i');
          await expect(secRow.getByRole('combobox')).toContainText(statusLabel);
          await expect(ownRow).toContainText(scenario.exhibitor);
          if (scenario.name === 'completed') {
            await expect(secRow.getByText('Qualified', { exact: true })).toBeVisible();
            await expect(ringRow.getByText('Q', { exact: true })).toBeVisible();
            await expect(ownRow.getByText('Completed', { exact: true })).toBeVisible();
          } else
            await expect(ringRow.getByTestId('check-in-button')).toHaveAttribute(
              'aria-label',
              statusLabel
            );
          const terminal = ['in-ring', 'pulled', 'completed'].includes(scenario.name);
          if (terminal) {
            await expect(ownRow.getByTestId('at-show-my-entry-place')).toHaveCount(0);
            for (const entryRow of [secRow, ringRow, ownRow])
              await expect(entryRow).not.toContainText(
                /\b(?:[0-9]+(?:st|nd|rd|th) up|Next up|position pending|not posted)\b/i
              );
          } else
            await expect(ownRow.getByTestId('at-show-my-entry-place')).toContainText(
              scenario.exhibitor
            );
          await expect
            .poll(async () => (await replica(judge.page, f.willowId)).row?.data)
            .toMatchObject({
              runOrder: scenario.fields.run_order,
              checkInStatus: status,
              isScored: scenario.fields.is_scored,
            });
          const exhibitorText = await ownRow.innerText();
          const secretaryText = await secRow.innerText();
          const judgeText = await ringRow.innerText();
          if (scenario.name === 'gapped') {
            const sheetNames = await secretary.page
              .getByTestId('secretary-run-sheet')
              .getByText(/^(Cooper|Willow)$/)
              .allTextContents();
            expect(sheetNames).toEqual(['Cooper', 'Willow']);
            const ringNames = await judge.page
              .getByTestId('dog-card')
              .getByRole('heading')
              .allTextContents();
            expect(ringNames).toEqual(['Cooper', 'Willow']);
          }
          if (scenario.name !== 'null') {
            await secretary.page.getByRole('link', { name: 'Set run order', exact: true }).click();
            await secretary.page.getByRole('button', { name: /^Run order for / }).click();
            await secretary.page.getByRole('menuitem', { name: 'Reorder manually...' }).click();
            const placement = secretary.page.getByRole('region', { name: 'Place a dog by hand' });
            const waitingList = placement.getByRole('list', { name: 'Run order', exact: true });
            const cooper = waitingList.getByRole('listitem').filter({ hasText: 'Cooper' });
            await expect(cooper.locator(':scope > span')).toHaveText('1');
            if (!terminal) {
              const willow = waitingList.getByRole('listitem').filter({ hasText: 'Willow' });
              await expect(willow.locator(':scope > span')).toHaveText('2');
              await expect(waitingList.getByRole('listitem')).toHaveCount(2);
            } else {
              await expect(waitingList.getByRole('listitem')).toHaveCount(1);
              const readonlyList = placement.getByRole('list', {
                name: scenario.name === 'in-ring' ? 'In the ring' : 'Completed',
                exact: true,
              });
              const willow = readonlyList.getByRole('listitem').filter({ hasText: 'Willow' });
              await expect(willow).toBeVisible();
              await expect(willow.getByRole('combobox')).toHaveCount(0);
              await expect(willow.getByRole('button')).toHaveCount(0);
              await expect(willow.locator(':scope > span')).toHaveCount(0);
              if (scenario.name === 'pulled') await expect(willow).toContainText('Pulled');
            }
            await expect(placement).not.toContainText(/\b101\b/);
            await screenshot(secretary.page, info, scenario.name + '-hand-placement');
          }
          expect(await row(client, f.willowId)).toEqual(stored);
          await screenshot(exhibitor.page, info, scenario.name + '-exhibitor');
          await screenshot(judge.page, info, scenario.name + '-judge');
          await screenshot(secretary.page, info, scenario.name + '-secretary');
          await evidence(info, scenario.name, {
            build: testedBuild,
            sql: stored,
            exhibitor: exhibitorText,
            secretary: secretaryText,
            judge: judgeText,
            judgeReplica: await replica(judge.page, f.willowId),
          });
        } finally {
          await secretary.context.close();
          await judge.context.close();
          await exhibitor.context.close();
        }
      });
  } finally {
    await reset(client, f);
  }
});

async function saveScore(page: Page) {
  await page.getByTestId('result-Q').click();
  await page.getByRole('textbox', { name: /time$/i }).first().fill('01:01.23');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /Confirm & Submit/i }).click();
}

test('expired token after 61 real minutes offline still queues and uploads the score (MYK9-1204)', async ({
  browser,
}, info) => {
  test.skip(
    info.project.name !== 'isolated-show-day-proof',
    'Use the dedicated manual proof config'
  );
  test.setTimeout(75 * 60_000);
  const client = isolatedClient();
  const f = await fixture(client);
  await reset(client, f);
  const judge = await rolePage(browser, 'JUDGE', `${classPath(f)}/score/${f.willowId}`);
  const calls: Array<{ status: number; fields: unknown }> = [];
  judge.page.on('response', response => {
    if (response.url().endsWith('/rpc/ringside_update_entry')) {
      const payload = response.request().postDataJSON() as { p_fields?: unknown };
      calls.push({ status: response.status(), fields: payload.p_fields });
    }
  });
  try {
    await expect(judge.page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    // Opening a sheet really marks the dog in-ring; finish that online write first.
    await expect.poll(async () => (await row(client, f.willowId)).check_in_status).toBe('in-ring');
    await expect.poll(async () => (await replica(judge.page, f.willowId)).pending.length).toBe(0);
    const buildResponse = await judge.page.request.get('/build-sha.txt');
    expect(buildResponse.ok()).toBe(true);
    const testedBuild = (await buildResponse.text()).trim();
    expect(testedBuild).toBe(process.env.MYK9_SHOW_DAY_SOURCE_SHA);
    const initial = await sessionIdentity(judge.page);
    const baseline = await row(client, f.willowId);
    expect(baseline.is_scored).toBe(false);
    const offlineCallStart = calls.length;
    const wallStart = Date.now();
    const monotonicStart = performance.now();
    await judge.context.setOffline(true);
    expect(await judge.page.evaluate(() => navigator.onLine)).toBe(false);
    const offlineReceivedFrames = judge.receivedSocketFrames();
    await evidence(info, 'offline-start', {
      build: testedBuild,
      wallStart,
      expiresAt: initial.expiresAt,
      userId: initial.userId,
      baseline,
      socketUrls: judge.socketUrls,
      offlineReceivedFrames,
    });
    for (let minute = 1; minute <= 61; minute++) {
      await new Promise(resolve => setTimeout(resolve, 60_000));
      console.log(
        `OFFLINE ENDURANCE ${minute}/61 minutes; elapsed=${Math.round((performance.now() - monotonicStart) / 1000)}s`
      );
    }
    expect(performance.now() - monotonicStart).toBeGreaterThanOrEqual(61 * 60_000);
    expect(judge.receivedSocketFrames()).toBe(offlineReceivedFrames);
    const expired = await sessionIdentity(judge.page);
    expect(expired.userId).toBe(initial.userId);
    expect(expired.expiresAt * 1000).toBeLessThan(Date.now());
    expect(await judge.page.evaluate(() => navigator.onLine)).toBe(false);
    const saveStart = performance.now();
    await saveScore(judge.page);
    await expect(judge.page.getByText(/Saved on this device.*back online/)).toBeVisible({
      timeout: 15_000,
    });
    expect(performance.now() - saveStart).toBeLessThan(15_000);
    const local = await replica(judge.page, f.willowId);
    expect(local.pending.length).toBeGreaterThan(0);
    expect(local.pending.every(m => m.authUserId === initial.userId)).toBe(true);
    expect(local.row?.data).toMatchObject({
      is_scored: true,
      result_status: 'qualified',
      search_time_seconds: 61.23,
    });
    expect(await row(client, f.willowId)).toEqual(baseline);
    await evidence(info, 'offline-score', {
      wallEnd: Date.now(),
      elapsedMs: performance.now() - monotonicStart,
      receivedFramesWhileOffline: judge.receivedSocketFrames() - offlineReceivedFrames,
      expired,
      local,
      serverStill: baseline,
    });
    await screenshot(judge.page, info, 'expired-offline-local-save');
    await judge.context.setOffline(false);
    await expect
      .poll(async () => (await row(client, f.willowId)).result_status, { timeout: 120_000 })
      .toBe('qualified');
    await expect
      .poll(async () => (await replica(judge.page, f.willowId)).pending.length, {
        timeout: 120_000,
      })
      .toBe(0);
    const uploaded = await row(client, f.willowId);
    expect(uploaded).toMatchObject({
      is_scored: true,
      result_status: 'qualified',
      search_time_seconds: 61.23,
      check_in_status: 'completed',
    });
    expect(uploaded.version).toBeGreaterThan(baseline.version);
    const refreshed = await sessionIdentity(judge.page);
    expect(refreshed.userId).toBe(initial.userId);
    expect(refreshed.expiresAt).toBeGreaterThan(expired.expiresAt);
    expect(refreshed.expiresAt * 1000).toBeGreaterThan(Date.now());
    const scoringCalls = calls.slice(offlineCallStart).filter(call => {
      const fields = call.fields;
      return (
        typeof fields === 'object' &&
        fields !== null &&
        'is_scored' in fields &&
        fields.is_scored === true
      );
    });
    expect(scoringCalls.filter(c => c.status === 409)).toEqual([]);
    expect(scoringCalls.some(c => c.status === 200)).toBe(true);
    const exhibitor = await rolePage(browser, 'DEMO_EXHIBITOR', `/at-show/${f.showId}`);
    const secretary = await rolePage(browser, 'SECRETARY', secretaryPath(f));
    try {
      const ownRow = exhibitor.page.getByTestId(`at-show-my-entry-${f.willowId}`);
      await expect(ownRow).toBeVisible();
      await expect(ownRow.getByRole('group', { name: 'Result', exact: true })).toContainText(/Q/);
      await expect(ownRow.getByRole('group', { name: 'Result', exact: true })).toContainText(
        '61.2s'
      );
      await expect(secretaryRow(secretary.page, 'Willow')).toContainText('Qualified');
      await screenshot(exhibitor.page, info, 'uploaded-exhibitor');
      await screenshot(secretary.page, info, 'uploaded-secretary');
      await evidence(info, 'upload-confirmed', {
        uploaded,
        refreshed,
        offlineCallStart,
        scoringCalls,
        calls,
        queue: await replica(judge.page, f.willowId),
      });
    } finally {
      await exhibitor.context.close();
      await secretary.context.close();
    }
  } finally {
    await judge.context.setOffline(false);
    await judge.context.close();
  }
});
