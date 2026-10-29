import { expect, test, type WebSocketRoute } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import { isIsolatedTarget } from '../helpers/isolatedFixtures';

/**
 * Suite category: regression (isolated only). Runs in real time, about 7 minutes.
 *
 * MYK9-1305. While the show's realtime channel is SUBSCRIBED the untargeted sync
 * pass slows to 3–5 minutes (realtime carries the changes). When the channel
 * drops, the device falls back to the 60 s pass within one tick; on rejoin it runs
 * one pass and slows again. A fake clock would also stretch the realtime
 * client's own heartbeats and reconnect backoff, so this measures the real
 * thing: the socket is routed, closed to drop it, and every reconnect refused
 * until it is restored.
 *
 * Everything is read from ONE ordered event log with millisecond timestamps from
 * the same clock: the show channel's join acknowledgements, the test's own drop
 * and restore markers, and every full pass (its `shows` delta read). A phase is
 * "the events after marker X", and a rejoin is "a join logged after the restore",
 * so no assertion depends on two clock readings landing in different seconds.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const FULL_PASS = /\/rest\/v1\/shows\?select=\*&deleted_at=is\.null&updated_at=gt/;
const SECOND = 1_000;

type EventKind = 'join' | 'quiet' | 'drop' | 'restore' | 'pass';
interface LoggedEvent {
  kind: EventKind;
  at: number;
}

test.skip(!isIsolatedTarget(), 'measures the isolated stack realtime socket only');

test('sync cadence follows the show channel: slow, 60 s fallback on drop, one pass on rejoin', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const events: LoggedEvent[] = [];
  const log = (kind: EventKind) => {
    const entry = { kind, at: performance.now() };
    events.push(entry);
    return entry;
  };
  /** Events of `kind` logged after `marker` (by position), optionally within `withinMs` of it. */
  const after = (marker: LoggedEvent, kind: EventKind, withinMs = Infinity) =>
    events
      .slice(events.indexOf(marker) + 1)
      .filter(e => e.kind === kind && e.at - marker.at <= withinMs);

  let down = false;
  const live: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, ws => {
    if (down) {
      void ws.close({ code: 4000, reason: 'regression: uplink down' });
      return;
    }
    const server = ws.connectToServer();
    server.onMessage(message => {
      ws.send(message);
      // The show channel's join acknowledgement: a phx_reply "ok" on a show topic.
      const text = typeof message === 'string' ? message : '';
      if (/realtime:show/.test(text) && text.includes('phx_reply') && text.includes('"ok"')) {
        log('join');
      }
    });
    live.push(ws);
  });
  page.on('request', request => {
    if (request.method() === 'GET' && FULL_PASS.test(request.url())) log('pass');
  });

  await signInAsSecretary(page, `/shows/${SHOW_ID}`);
  await expect
    .poll(() => events.some(e => e.kind === 'join'), {
      timeout: 60_000,
      message: 'the show channel never joined',
    })
    .toBe(true);
  await page.waitForTimeout(25 * SECOND); // let any pass the first join causes land

  // SUBSCRIBED: no full pass for 70 s (the slow cadence is 180–300 s).
  const quiet = log('quiet');
  await page.waitForTimeout(70 * SECOND);

  // CLOSED: a pass within one tick of the drop, then every 60 s.
  down = true;
  const drop = log('drop');
  for (const ws of live.splice(0)) await ws.close({ code: 4000, reason: 'regression: drop' });
  await page.waitForTimeout(160 * SECOND);

  // SUBSCRIBED again: wait for a join logged after the restore. The rejoin pass must land
  // soon after it, and the 60 s fallback must be over: no further pass for 90 s after the
  // rejoin pass. (The next slow tick is not timed from the rejoin pass; it was measured
  // 119 s after it, so only the absence of a 60 s-cadence pass is asserted.)
  down = false;
  const restore = log('restore');
  await expect
    .poll(() => after(restore, 'join').length, {
      timeout: 60_000,
      message: 'the show channel never rejoined',
    })
    .toBeGreaterThan(0);
  const rejoin = after(restore, 'join')[0];
  await expect
    .poll(() => after(rejoin, 'pass').length, {
      timeout: 45_000,
      message: 'no pass after the rejoin',
    })
    .toBeGreaterThan(0);
  const rejoinPass = after(rejoin, 'pass')[0];
  await page.waitForTimeout(90 * SECOND);

  const timeline = events
    .map(e => `${e.kind}@${((e.at - events[0].at) / SECOND).toFixed(1)}s`)
    .join(' ');
  const whileSubscribed = after(quiet, 'pass').filter(e => e.at < drop.at);
  const whileDropped = after(drop, 'pass').filter(e => e.at < restore.at);
  const fallbackAfterRejoin = after(rejoinPass, 'pass', 90 * SECOND);

  expect(whileSubscribed, timeline).toEqual([]);
  expect(whileDropped.length, timeline).toBeGreaterThanOrEqual(2);
  expect(whileDropped[0].at - drop.at, timeline).toBeLessThanOrEqual(75 * SECOND);
  expect(whileDropped[1].at - whileDropped[0].at, timeline).toBeGreaterThanOrEqual(45 * SECOND);
  expect(rejoinPass.at - rejoin.at, timeline).toBeLessThanOrEqual(40 * SECOND);
  expect(fallbackAfterRejoin, timeline).toEqual([]);
});
