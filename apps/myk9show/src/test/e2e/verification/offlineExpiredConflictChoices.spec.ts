import { expect, test, type Page } from '@playwright/test';
import { performance } from 'node:perf_hooks';
import { disposableClass, registerDisposableProofHooks } from './disposableClass';
import {
  evidence,
  expectDeviceQueueDrained,
  isolatedClient,
  queueSnapshot,
  replica,
  rolePage,
  row,
  sessionIdentity,
} from './showDayProof.helpers';
import { fillEveryAreaTime } from '../helpers/scoresheetTimes';

/**
 * MYK9-2502 (proof for MYK9-2337): two devices score the same dog two ways, the second to
 * reconnect is told, and then goes offline for over an hour, until its sign-in token has really
 * expired. Both answers to the notice are given while offline and while expired, then the device
 * reconnects. Two dogs, so both answers share one hour of waiting:
 *
 *   - dog 1 (Willow): device A scores Q, device B scores NQ; B answers "Keep my score" (the
 *     notice's "Keep my change" for a score). The server must end on NQ.
 *   - dog 2 (Cooper): the same two scores; B answers "Keep the saved score" (the notice's "Keep
 *     the other change"). The server must stay on Q.
 *
 * Each dog has its own pair of devices (four browser contexts) so no step needs to navigate
 * while offline. Real clock and real token expiry, like showDayReliability.spec.ts (MYK9-1204):
 * the server, not a mock, decides the expired token needs a refresh. Runs only in the isolated
 * show-day proof (playwright.show-day.config.ts); never against shared staging.
 */

const CONFLICT_TITLE = /was scored two ways/;
const KEEP_MINE = /^Keep my score/;
const KEEP_SAVED = /^Keep the saved score/;
const OFFLINE_MINUTES = 61;

type Device = Awaited<ReturnType<typeof rolePage>>;

async function goOffline(device: Device) {
  await device.context.setOffline(true);
  await device.page.evaluate(() => window.dispatchEvent(new Event('offline')));
}

async function goOnline(device: Device) {
  await device.context.setOffline(false);
  await device.page.evaluate(() => window.dispatchEvent(new Event('online')));
}

async function scoreOffline(page: Page, result: 'Q' | 'NQ', classUrl: RegExp) {
  if (result === 'Q') await fillEveryAreaTime(page);
  await page.getByTestId(`result-${result}`).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /Confirm & Submit/i }).click();
  await expect(page).toHaveURL(classUrl, { timeout: 15_000 });
}

async function pendingCount(page: Page, entryId: string) {
  return (await replica(page, entryId)).pending.length;
}

/** The stored row and queued writes with the replication fields this proof reads. */
async function storedState(page: Page, entryId: string) {
  const { row: stored, pending } = await replica(page, entryId);
  const record = stored as {
    syncStatus?: string;
    conflict?: unknown;
    serverVersion?: number;
  } | null;
  return {
    syncStatus: record?.syncStatus ?? null,
    hasConflict: record?.conflict !== undefined,
    serverVersion: record?.serverVersion ?? null,
    queuedServerVersions: (pending as Array<{ serverVersion?: number }>).map(m => m.serverVersion),
  };
}

async function localResult(page: Page, entryId: string) {
  const { row: stored } = await replica(page, entryId);
  return (stored?.data as { result_status?: string } | undefined)?.result_status ?? null;
}

// Gate before the hooks: the ordinary suites list this file and must not look for a build or preview.
test.describe('offline past token expiry', () => {
  // A skip thrown here ends the hook chain, so the build and preview checks below never run.
  test.beforeAll(({ browserName }, info) => {
    test.skip(
      info.project.name !== 'isolated-show-day-proof',
      `Use the dedicated manual proof config (this run: ${browserName}, ${info.project.name})`
    );
  });
  registerDisposableProofHooks();

  test('both conflict answers settle offline past token expiry, then the server and queues converge (MYK9-2502)', async ({
    browser,
  }, info) => {
    test.setTimeout(80 * 60_000);
    const client = isolatedClient();
    const f = await disposableClass(client, 2);
    const [mineId, savedId] = f.ids as [string, string];
    // The class list itself: the starting `/score/<entry>` URL must not satisfy this.
    const classUrl = new RegExp(
      `^https?://[^/]+/at-show/${f.showId}/class/${f.classId}/?(?:[?#].*)?$`
    );
    const scorePath = (id: string) => `/at-show/${f.showId}/class/${f.classId}/score/${id}`;
    const devices: Device[] = [];
    const open = async (id: string) => {
      const device = await rolePage(browser, 'JUDGE', scorePath(id));
      devices.push(device);
      await expect(device.page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
      return device;
    };
    const rpcStatuses = new Map<string, number[]>();
    const watch = (device: Device, label: string) =>
      device.page.on('response', response => {
        if (response.request().method() !== 'POST') return;
        if (!response.url().endsWith('/rpc/ringside_update_entry')) return;
        rpcStatuses.set(label, [...(rpcStatuses.get(label) ?? []), response.status()]);
      });

    try {
      const aMine = await open(mineId);
      const bMine = await open(mineId);
      const aSaved = await open(savedId);
      const bSaved = await open(savedId);
      watch(bMine, 'bMine');
      watch(bSaved, 'bSaved');
      const baseline = await Promise.all([row(client, mineId), row(client, savedId)]);
      const initial = await sessionIdentity(bMine.page);

      // Two devices score the same dog two ways while offline.
      for (const device of devices) await goOffline(device);
      await scoreOffline(aMine.page, 'Q', classUrl);
      await scoreOffline(bMine.page, 'NQ', classUrl);
      await scoreOffline(aSaved.page, 'Q', classUrl);
      await scoreOffline(bSaved.page, 'NQ', classUrl);
      await expect.poll(() => pendingCount(bMine.page, mineId)).toBeGreaterThan(0);
      await expect.poll(() => pendingCount(bSaved.page, savedId)).toBeGreaterThan(0);

      // A reconnects first and wins; the server holds Q for both dogs.
      await goOnline(aMine);
      await goOnline(aSaved);
      for (const id of [mineId, savedId]) {
        await expect
          .poll(async () => (await row(client, id)).result_status, { timeout: 60_000 })
          .toBe('qualified');
      }
      await expectDeviceQueueDrained(aMine.page, 60_000);
      await expectDeviceQueueDrained(aSaved.page, 60_000);

      // B reconnects second: its stale write is refused and each B device is asked.
      await goOnline(bMine);
      await goOnline(bSaved);
      for (const device of [bMine, bSaved]) {
        await expect(device.page.getByText(CONFLICT_TITLE)).toBeVisible({ timeout: 60_000 });
      }
      // Parked, not dropped.
      expect(await pendingCount(bMine.page, mineId)).toBeGreaterThan(0);
      expect(await pendingCount(bSaved.page, savedId)).toBeGreaterThan(0);

      // The server version A's write left: the kept write must be rebased onto it.
      const wonVersion = (await row(client, mineId)).version;

      // B goes offline again, for longer than the token lives. The notices stay up.
      await goOffline(bMine);
      await goOffline(bSaved);
      const monotonicStart = performance.now();
      const offlineCalls = {
        bMine: rpcStatuses.get('bMine')?.length ?? 0,
        bSaved: rpcStatuses.get('bSaved')?.length ?? 0,
      };
      await evidence(info, 'offline-start', { initial, offlineCalls, baseline });
      for (let minute = 1; minute <= OFFLINE_MINUTES; minute++) {
        await new Promise(resolve => setTimeout(resolve, 60_000));
        console.log(`CONFLICT OFFLINE ${minute}/${OFFLINE_MINUTES} minutes`);
      }
      expect(performance.now() - monotonicStart).toBeGreaterThanOrEqual(OFFLINE_MINUTES * 60_000);
      const expired = await sessionIdentity(bMine.page);
      expect(expired.userId).toBe(initial.userId);
      expect(expired.expiresAt * 1000).toBeLessThan(Date.now());
      expect((await sessionIdentity(bSaved.page)).expiresAt * 1000).toBeLessThan(Date.now());
      for (const device of [bMine, bSaved]) {
        expect(await device.page.evaluate(() => navigator.onLine)).toBe(false);
        await expect(device.page.getByText(CONFLICT_TITLE)).toBeVisible();
      }
      expect(rpcStatuses.get('bMine')?.length ?? 0).toBe(offlineCalls.bMine);
      expect(rpcStatuses.get('bSaved')?.length ?? 0).toBe(offlineCalls.bSaved);

      // Keep my score: the notice goes, the device keeps its NQ and still has it queued.
      await bMine.page.getByRole('button', { name: KEEP_MINE }).click();
      await expect(bMine.page.getByText(CONFLICT_TITLE)).toHaveCount(0);
      // The notice goes before the choice is applied, so wait for the stored row itself: no longer
      // in conflict, queued again, and the write rebased onto A's server version.
      await expect
        .poll(() => storedState(bMine.page, mineId), { timeout: 15_000 })
        .toEqual({
          syncStatus: 'pending',
          hasConflict: false,
          serverVersion: wonVersion,
          queuedServerVersions: expect.arrayContaining([wonVersion]),
        });
      expect((await storedState(bMine.page, mineId)).queuedServerVersions).not.toContain(
        baseline[0].version
      );
      expect(await localResult(bMine.page, mineId)).toBe('nq');

      // Keep the saved score: the queued NQ is dropped and the saved Q shows, with nothing sent.
      await bSaved.page.getByRole('button', { name: KEEP_SAVED }).click();
      await expect(bSaved.page.getByText(CONFLICT_TITLE)).toHaveCount(0);
      await expect.poll(() => pendingCount(bSaved.page, savedId)).toBe(0);
      await expect.poll(() => localResult(bSaved.page, savedId)).toBe('qualified');

      // Nothing reached the server while offline.
      expect((await row(client, mineId)).result_status).toBe('qualified');
      const savedBefore = await row(client, savedId);
      expect(savedBefore.result_status).toBe('qualified');
      await evidence(info, 'offline-resolved', {
        expired,
        mine: await replica(bMine.page, mineId),
        saved: await replica(bSaved.page, savedId),
        queues: await Promise.all([queueSnapshot(bMine.page), queueSnapshot(bSaved.page)]),
      });

      // Reconnect: the token refreshes, B's kept change uploads, the dropped one never does.
      await goOnline(bMine);
      await goOnline(bSaved);
      await expect
        .poll(async () => (await row(client, mineId)).result_status, { timeout: 120_000 })
        .toBe('nq');
      await expectDeviceQueueDrained(bMine.page, 120_000);
      await expectDeviceQueueDrained(bSaved.page, 120_000);
      const mine = await row(client, mineId);
      const saved = await row(client, savedId);
      expect(mine.version).toBeGreaterThan(baseline[0].version);
      expect(saved.result_status).toBe('qualified');
      // The dropped NQ never reached the server: B sent no score call for it, and its score fields
      // are unchanged. The row's version is not compared: the two dogs tie on time, so the kept NQ
      // landing makes the server's placement recalculation clear this row's tie marker, which bumps
      // its version with no write from B (run 46096755917).
      expect(rpcStatuses.get('bSaved')?.length ?? 0).toBe(offlineCalls.bSaved);
      expect({
        is_scored: saved.is_scored,
        result_status: saved.result_status,
        search_time_seconds: saved.search_time_seconds,
        total_faults: saved.total_faults,
      }).toEqual({
        is_scored: savedBefore.is_scored,
        result_status: savedBefore.result_status,
        search_time_seconds: savedBefore.search_time_seconds,
        total_faults: savedBefore.total_faults,
      });
      // The kept NQ was accepted after the token refreshed (as in showDayReliability).
      const keptCalls = (rpcStatuses.get('bMine') ?? []).slice(offlineCalls.bMine);
      await evidence(info, 'reconnect-calls', { keptCalls });
      expect(keptCalls.some(status => status === 200)).toBe(true);
      const refreshed = await sessionIdentity(bMine.page);
      expect(refreshed.userId).toBe(initial.userId);
      expect(refreshed.expiresAt).toBeGreaterThan(expired.expiresAt);

      // Every replica agrees with the server.
      await expect.poll(() => localResult(bMine.page, mineId), { timeout: 60_000 }).toBe('nq');
      expect(await localResult(bSaved.page, savedId)).toBe('qualified');
      // A learns of B's write on its next download pass; the visibility trigger forces one.
      await expect
        .poll(
          async () => {
            await aMine.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
            return localResult(aMine.page, mineId);
          },
          { timeout: 90_000, intervals: [1_000, 2_000, 5_000] }
        )
        .toBe('nq');
      expect(await localResult(aSaved.page, savedId)).toBe('qualified');
      for (const device of devices) expect(device.nonLocalSocketUrls).toEqual([]);
      await evidence(info, 'converged', { mine, saved, refreshed, rpcStatuses: [...rpcStatuses] });
    } finally {
      for (const device of devices) {
        await device.context.setOffline(false).catch(() => undefined);
        await device.context.close().catch(() => undefined);
      }
    }
  });
});
