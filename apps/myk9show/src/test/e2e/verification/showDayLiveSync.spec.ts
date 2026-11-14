import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { performance } from 'node:perf_hooks';
import { disposableClass, registerDisposableProofHooks } from './disposableClass';
import {
  evidence,
  guardedContext,
  isolatedClient,
  judgeRow,
  rolePage,
  row,
  setState,
  type Client,
} from './showDayProof.helpers';
import { signIn, TEST_USERS } from '../helpers/testUsers';

/**
 * MYK9-1939: a judge's change reaches the secretary's Show Desk with no navigation.
 *
 * Two browser contexts on the isolated stack: a secretary on Show Desk with a class selected
 * and a judge at Ringside. The judge checks a dog in, puts another in the ring and saves its
 * score. Each change must show on the secretary's In ring tile, Next up list, entries table and
 * schedule row without the secretary touching the page (no reload, no navigation).
 *
 * Variant 1: realtime up, so the nudge delivers it within about 10 seconds.
 * Variant 2: the secretary's realtime websocket is closed, so only the per-show fallback poll
 * (60 s while the channel is down, MYK9-1923) can deliver it.
 */
registerDisposableProofHooks();

const LIVE_WITHIN_MS = 10_000;
// The fallback poll is 60 s; the margin covers the sync itself and a poll tick just missed.
const FALLBACK_WITHIN_MS = 75_000;
// A realtime nudge lands in 1-2 s, so a change still absent after this was not delivered by it.
const NOT_INSTANT_MS = 1_500;

interface Setup {
  showId: string;
  classId: string;
  willowId: string;
  cooperId: string;
}

/** Willow (#200, run order 1) is checked in; Cooper (#201, run order 2) is not. */
async function seed(client: Client): Promise<Setup> {
  const f = await disposableClass(client, 2);
  const [willowId, cooperId] = f.ids as [string, string];
  const { error } = await client
    .from('classes')
    .update({ status: 'in_progress', status_source: 'manual' })
    .eq('id', f.classId);
  if (error) throw error;
  await setState(client, cooperId, { check_in_status: 'no-status' });
  return { showId: f.showId, classId: f.classId, willowId, cooperId };
}

/** Everything the secretary's page shows about the walk, scoped to one class. */
function desk(page: Page) {
  const entries = page.getByTestId('class-entries-table').getByTestId('class-entry-row');
  return {
    inRingTile: page.getByTestId('in-ring-tile'),
    nextUp: page.getByRole('list', { name: 'Next up' }).getByRole('listitem'),
    entryRow: (dog: string): Locator => entries.filter({ hasText: dog }),
    // The focused class's schedule row: its title button is the one pressed (`?focus=`). The row
    // label is built from element, level and section, so the class's name cannot find it.
    scheduleLine: page
      .locator('button[data-selects-row][aria-pressed="true"]')
      .locator('xpath=ancestor::div[.//*[@data-testid="class-status-line"]][1]')
      .getByTestId('class-status-line'),
  };
}

async function secretaryOnShowDesk(browser: Browser, s: Setup, blockRealtime: boolean) {
  const context = await guardedContext(browser);
  let blockedSockets = 0;
  if (blockRealtime)
    await context.routeWebSocket(/\/realtime\/v1\/websocket/, ws => {
      blockedSockets++;
      void ws.close();
    });
  const page = await context.newPage();
  let realtimeFrames = 0;
  page.on('websocket', socket => {
    if (!/\/realtime\/v1\/websocket/.test(socket.url())) return;
    socket.on('framereceived', () => realtimeFrames++);
  });
  const account = TEST_USERS.SECRETARY;
  await signIn(page, account.email, account.password, `/shows/${s.showId}?focus=${s.classId}`, {
    reuseSession: false,
  });
  return {
    context,
    page,
    blockedSockets: () => blockedSockets,
    realtimeFrames: () => realtimeFrames,
  };
}

async function walk(browser: Browser, info: TestInfo, blockRealtime: boolean) {
  const client = isolatedClient();
  const s = await seed(client);
  const secretary = await secretaryOnShowDesk(browser, s, blockRealtime);
  const judge = await rolePage(browser, 'JUDGE', `/at-show/${s.showId}/class/${s.classId}`);
  const sec = desk(secretary.page);
  const arrivals: Record<string, number> = {};
  const deadline = blockRealtime ? FALLBACK_WITHIN_MS : LIVE_WITHIN_MS;

  /** Starts the clock once the judge's change is committed, then times the secretary's page. */
  async function arrives(
    name: string,
    committed: () => Promise<unknown>,
    shown: () => Promise<void>,
    notYet?: () => Promise<void>
  ) {
    await committed();
    const start = performance.now();
    if (notYet) {
      await expect
        .poll(() => performance.now() - start, { intervals: [100] })
        .toBeGreaterThan(NOT_INSTANT_MS);
      await notYet();
    }
    // Blocked variant: a realtime leak on any step would make the arrival look like the poll's.
    if (blockRealtime) expect(secretary.realtimeFrames()).toBe(0);
    await expect(shown).toPass({ timeout: deadline, intervals: [250, 500, 1_000] });
    arrivals[name] = Math.round(performance.now() - start);
    // No navigation: the secretary is still on the Show Desk URL for this class.
    await expect(secretary.page).toHaveURL(new RegExp(`/shows/${s.showId}\\?.*focus=${s.classId}`));
  }

  try {
    // The secretary's starting picture, read from the page, with the channel in the expected state.
    await expect(sec.inRingTile).toContainText('Nobody in the ring');
    await expect(sec.nextUp).toHaveCount(2);
    await expect(sec.entryRow('Cooper')).toContainText('Not checked in');
    await expect(sec.scheduleLine).toContainText('Running');
    await expect(sec.scheduleLine).toContainText('0 of 2 scored');
    if (blockRealtime) await expect.poll(() => secretary.blockedSockets()).toBeGreaterThan(0);
    else await expect.poll(() => secretary.realtimeFrames()).toBeGreaterThan(0);
    // The judge's list must have loaded before anything is tapped.
    const cooperCard = judgeRow(judge.page, 'Cooper');
    await expect(cooperCard).toBeVisible({ timeout: 60_000 });

    // 1. The judge checks Cooper in.
    await judge.page.locator('[data-testid="check-in-button"][aria-label$=" for Cooper"]').click();
    const statusDialog = judge.page.getByRole('dialog', { name: 'Change Status' });
    await statusDialog.getByRole('button', { name: /Checked-in/ }).click();
    await arrives(
      'check-in',
      () =>
        expect
          .poll(async () => (await row(client, s.cooperId)).check_in_status, { timeout: 30_000 })
          .toBe('checked-in'),
      async () => {
        await expect(sec.entryRow('Cooper')).toContainText('Waiting', { timeout: 1_000 });
        await expect(sec.entryRow('Cooper')).not.toContainText('Not checked in');
      },
      blockRealtime
        ? async () => expect(sec.entryRow('Cooper')).toContainText('Not checked in')
        : undefined
    );

    // 2. The judge starts Willow's run, which puts the dog in the ring.
    await judgeRow(judge.page, 'Willow')
      .getByRole('heading', { name: 'Willow', exact: true })
      .click();
    const actionBar = judge.page.getByTestId('scoresheet-action-bar');
    await expect(actionBar).toBeVisible({ timeout: 60_000 });
    await judge.page.getByTestId('timer-start').click();
    await arrives(
      'in-ring',
      () =>
        expect
          .poll(async () => (await row(client, s.willowId)).check_in_status, { timeout: 30_000 })
          .toBe('in-ring'),
      async () => {
        await expect(sec.inRingTile).toContainText('Willow', { timeout: 1_000 });
        await expect(sec.nextUp).toHaveCount(1, { timeout: 1_000 });
        await expect(sec.nextUp.first()).toContainText('Cooper', { timeout: 1_000 });
        await expect(sec.scheduleLine).toContainText('Willow in ring', { timeout: 1_000 });
      },
      blockRealtime
        ? async () => expect(sec.inRingTile).toContainText('Nobody in the ring')
        : undefined
    );

    // 3. The judge saves Willow's score.
    await judge.page.getByTestId('result-Q').click();
    await judge.page.getByRole('textbox', { name: /time$/i }).first().fill('01:02.03');
    await judge.page.getByRole('button', { name: 'Save', exact: true }).click();
    await judge.page.getByRole('button', { name: /Confirm & Submit/i }).click();
    await arrives(
      'score',
      () =>
        expect
          .poll(async () => (await row(client, s.willowId)).is_scored, { timeout: 30_000 })
          .toBe(true),
      async () => {
        await expect(sec.inRingTile).toContainText('Nobody in the ring', { timeout: 1_000 });
        await expect(sec.entryRow('Willow')).toContainText('Q', { timeout: 1_000 });
        await expect(sec.scheduleLine).toContainText('1 of 2 scored', { timeout: 1_000 });
        await expect(sec.scheduleLine).not.toContainText('Willow in ring', { timeout: 1_000 });
      },
      blockRealtime
        ? async () => expect(sec.scheduleLine).toContainText('Willow in ring')
        : undefined
    );
    if (blockRealtime) expect(secretary.realtimeFrames()).toBe(0);

    await evidence(info, blockRealtime ? 'fallback-poll' : 'realtime', {
      withinMs: deadline,
      arrivalsMs: arrivals,
      realtimeFramesOnSecretary: secretary.realtimeFrames(),
      blockedSocketsOnSecretary: secretary.blockedSockets(),
    });
  } finally {
    await secretary.context.close();
    await judge.context.close();
  }
}

test('a judge change reaches Show Desk within 10 seconds with no navigation (MYK9-1939)', async ({
  browser,
}, info) => {
  test.setTimeout(5 * 60_000);
  await walk(browser, info, false);
});

test('with realtime blocked, the fallback poll still delivers the change within 75 seconds (MYK9-1939)', async ({
  browser,
}, info) => {
  test.setTimeout(10 * 60_000);
  await walk(browser, info, true);
});
