import { expect, test, type WebSocketRoute } from '@playwright/test';
import { signInAsSecretary } from '../uat/shared/auth';
import { isIsolatedTarget } from '../helpers/isolatedFixtures';

/**
 * Suite category: regression (isolated only). Runs in real time, about 8 minutes.
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
  test.setTimeout(600_000);
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

  // SUBSCRIBED again. Wait for a NEW join acknowledgement, so the rejoin is proven rather
  // than assumed, then watch 150 s from it: longer than two 60 s fallback ticks, shorter
  // than the slow cadence's 180 s minimum. Exactly one pass in that window, soon after the
  // rejoin, is the rejoin pass with the slow cadence back; a fallback still running would
  // put two or more there, and a missing rejoin pass would leave none.
  down = false;
  const restoredAt = seconds();
  await expect
    .poll(() => joinedAt, { timeout: 60_000, message: 'the show channel never rejoined' })
    .toBeGreaterThan(restoredAt);
  const rejoinedAt = joinedAt;
  await page.waitForTimeout(150_000);
  const afterRejoin = passes.filter(p => p >= rejoinedAt && p <= rejoinedAt + 150);

  const timeline = `passes at [${passes.join(', ')}]s; subscribed window from ${subscribedFrom}s, dropped ${droppedAt}s, restored ${restoredAt}s, rejoined ${rejoinedAt}s`;
  expect(whileSubscribed, timeline).toEqual([]);
  expect(whileDropped.length, timeline).toBeGreaterThanOrEqual(2);
  expect(whileDropped[0] - droppedAt, timeline).toBeLessThanOrEqual(75);
  expect(whileDropped[1] - whileDropped[0], timeline).toBeGreaterThanOrEqual(45);
  expect(afterRejoin, timeline).toHaveLength(1);
  expect(afterRejoin[0] - rejoinedAt, timeline).toBeLessThanOrEqual(40);
});
