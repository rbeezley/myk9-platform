import { expect, test, type WebSocketRoute } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import { isIsolatedTarget } from '../helpers/isolatedFixtures';

/**
 * Suite category: regression (isolated only). Runs in real time, about 6.5 minutes.
 *
 * MYK9-1305. While the show's realtime channel is SUBSCRIBED the untargeted sync
 * pass slows to 3–5 minutes (realtime carries the changes). When the channel
 * drops, the device falls back to the 60 s pass within one tick; on rejoin it runs
 * one pass and slows again. A fake clock would also stretch the realtime
 * client's own heartbeats and reconnect backoff, so this measures the real
 * thing: the socket is routed, closed to drop it, and every reconnect refused
 * until it is restored. A full pass is marked by its `shows` delta read.
 */

const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const FULL_PASS = /\/rest\/v1\/shows\?select=\*&deleted_at=is\.null&updated_at=gt/;

test.skip(!isIsolatedTarget(), 'measures the isolated stack realtime socket only');

test('sync cadence follows the show channel: slow, 60 s fallback on drop, one pass on rejoin', async ({
  page,
}) => {
  test.setTimeout(480_000);
  let down = false;
  const live: WebSocketRoute[] = [];
  const t0 = Date.now();
  const seconds = () => Math.round((Date.now() - t0) / 1000);

  // The show channel's join acknowledgement (a phx_reply "ok" on a show topic), as the
  // server sends it: the evidence of SUBSCRIBED, rather than a fixed wait.
  let joinedAt = -1;
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, ws => {
    if (down) {
      void ws.close({ code: 4000, reason: 'regression: uplink down' });
      return;
    }
    const server = ws.connectToServer();
    server.onMessage(message => {
      ws.send(message);
      const text = typeof message === 'string' ? message : '';
      if (/realtime:show/.test(text) && text.includes('phx_reply') && text.includes('"ok"')) {
        joinedAt = seconds();
      }
    });
    live.push(ws);
  });
  const passes: number[] = [];
  page.on('request', request => {
    if (request.method() === 'GET' && FULL_PASS.test(request.url())) passes.push(seconds());
  });

  await signInAsSecretary(page, `/shows/${SHOW_ID}`);
  await expect
    .poll(() => joinedAt, { timeout: 60_000, message: 'the show channel never joined' })
    .toBeGreaterThan(-1);
  await page.waitForTimeout(25_000); // let any pass the join itself causes land first

  // SUBSCRIBED: no full pass for 70 s (the slow cadence is 180–300 s).
  const subscribedFrom = seconds();
  await page.waitForTimeout(70_000);
  const whileSubscribed = passes.filter(p => p > subscribedFrom);

  // CLOSED: a pass within one tick of the drop, then every 60 s.
  down = true;
  const droppedAt = seconds();
  for (const ws of live.splice(0)) await ws.close({ code: 4000, reason: 'regression: drop' });
  await page.waitForTimeout(160_000);
  const whileDropped = passes.filter(p => p >= droppedAt);

  // SUBSCRIBED again: a pass on rejoin, then slow again. A 60 s tick that falls due during
  // the reconnect backoff can land just before the rejoin pass, so allow one or two.
  down = false;
  const restoredAt = seconds();
  await page.waitForTimeout(90_000);
  const afterRejoin = passes.filter(p => p > restoredAt);

  const timeline = `passes at [${passes.join(', ')}]s; joined ${joinedAt}s, subscribed window from ${subscribedFrom}s, dropped ${droppedAt}s, restored ${restoredAt}s`;
  expect(whileSubscribed, timeline).toEqual([]);
  expect(whileDropped.length, timeline).toBeGreaterThanOrEqual(2);
  expect(whileDropped[0] - droppedAt, timeline).toBeLessThanOrEqual(75);
  expect(whileDropped[1] - whileDropped[0], timeline).toBeGreaterThanOrEqual(45);
  expect(afterRejoin.length, timeline).toBeGreaterThanOrEqual(1);
  expect(afterRejoin.length, timeline).toBeLessThanOrEqual(2);
});
