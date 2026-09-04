import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Page, Request } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForAppApiRequestsToSettle, watchAppApiRequests } from './appApiRequestTracker';

type RequestEvent = 'request' | 'requestfinished' | 'requestfailed';

function createRequest(url: string) {
  return { url: () => url } as Request;
}

function createPageHarness() {
  const listeners = new Map<RequestEvent, Array<(request: Request) => void>>();
  const page = {
    on(event: RequestEvent, listener: (request: Request) => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return page;
    },
    waitForTimeout(ms: number) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },
  } as unknown as Page;

  return {
    page,
    emit(event: RequestEvent, request: Request) {
      for (const listener of listeners.get(event) ?? []) listener(request);
    },
  };
}

describe('app API request tracker', () => {
  afterEach(() => vi.useRealTimers());

  it('waits for an app API request to finish and remain idle', async () => {
    vi.useFakeTimers();
    const harness = createPageHarness();
    const tracker = watchAppApiRequests(harness.page);
    const request = createRequest('https://example.supabase.co/rest/v1/clubs?select=*');

    setTimeout(() => harness.emit('request', request), 5);
    setTimeout(() => harness.emit('requestfinished', request), 10);

    let resolved = false;
    const settlementPromise = waitForAppApiRequestsToSettle(harness.page, tracker, {
      idleMs: 15,
      timeoutMs: 100,
    }).then(settlement => {
      resolved = true;
      return settlement;
    });

    await vi.advanceTimersByTimeAsync(29);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const settlement = await settlementPromise;

    expect(settlement).toEqual({ settled: true, pendingUrls: [] });
    expect(tracker.pending.size).toBe(0);
  });

  it('tracks an app API request that started before the route sweep', async () => {
    const harness = createPageHarness();
    const tracker = watchAppApiRequests(harness.page);
    const request = createRequest('https://example.supabase.co/rest/v1/clubs?select=*');

    harness.emit('request', request);
    setTimeout(() => harness.emit('requestfinished', request), 5);

    const settlement = await waitForAppApiRequestsToSettle(harness.page, tracker, {
      idleMs: 5,
      timeoutMs: 100,
    });

    expect(settlement).toEqual({ settled: true, pendingUrls: [] });
    expect(tracker.pending.size).toBe(0);
  });

  it('reports an app API request that never settles', async () => {
    const harness = createPageHarness();
    const tracker = watchAppApiRequests(harness.page);
    const request = createRequest('https://example.supabase.co/rest/v1/clubs?select=*');

    harness.emit('request', request);

    const settlement = await waitForAppApiRequestsToSettle(harness.page, tracker, {
      idleMs: 5,
      timeoutMs: 20,
    });

    expect(settlement).toEqual({
      settled: false,
      pendingUrls: ['https://example.supabase.co/rest/v1/clubs?select=*'],
    });
  });

  it('does not accept a request that finishes just before the timeout', async () => {
    // Fake timers keep "just before the timeout" exact. On a real clock the 15ms
    // poll can wake late, and its await continuation (a microtask) runs before the
    // 18ms requestfinished callback -- so the tracker reports the request as still
    // pending and the assertion fails only under full-suite CPU contention.
    vi.useFakeTimers();
    const harness = createPageHarness();
    const tracker = watchAppApiRequests(harness.page);
    const request = createRequest('https://example.supabase.co/rest/v1/clubs?select=*');

    harness.emit('request', request);
    setTimeout(() => harness.emit('requestfinished', request), 18);

    const settlementPromise = waitForAppApiRequestsToSettle(harness.page, tracker, {
      idleMs: 15,
      timeoutMs: 20,
    });

    await vi.advanceTimersByTimeAsync(30);
    const settlement = await settlementPromise;

    expect(settlement).toEqual({ settled: false, pendingUrls: [] });
  });

  it('ignores assets and document requests', async () => {
    const harness = createPageHarness();
    const tracker = watchAppApiRequests(harness.page);

    harness.emit('request', createRequest('http://127.0.0.1:5173/admin/dashboard'));
    harness.emit('request', createRequest('http://127.0.0.1:5173/assets/app.js'));

    const settlement = await waitForAppApiRequestsToSettle(harness.page, tracker, {
      idleMs: 5,
      timeoutMs: 20,
    });

    expect(settlement).toEqual({ settled: true, pendingUrls: [] });
    expect(tracker.pending.size).toBe(0);
  });

  /**
   * The navigation boundary — the case that made Nightly Health red on 5 of 7
   * runs while containing no product bug.
   *
   * A request whose document is torn down by `page.goto` may emit NEITHER
   * `requestfinished` NOR `requestfailed`. Since one tracker spans a whole
   * role sweep, that request stayed in `pending` forever and failed the settle
   * assertion on every later route, naming the same stranded URLs each time.
   */
  describe('reset at a navigation boundary', () => {
    const stranded = 'https://example.supabase.co/rest/v1/dog_registrations?select=*';
    const nextRoute = 'https://example.supabase.co/rest/v1/people?select=id';

    it('a stranded request fails the NEXT route until the tracker is reset', async () => {
      const harness = createPageHarness();
      const tracker = watchAppApiRequests(harness.page);

      // Route 1 issues a request that never completes — no finished, no failed.
      harness.emit('request', createRequest(stranded));

      const routeOne = await waitForAppApiRequestsToSettle(harness.page, tracker, {
        idleMs: 5,
        timeoutMs: 20,
      });
      expect(routeOne.settled).toBe(false);
      expect(routeOne.pendingUrls).toEqual([stranded]);

      // Route 2's own request completes cleanly. WITHOUT a reset the route
      // still fails, and blames route 1's URL — the exact false cascade.
      const live = createRequest(nextRoute);
      harness.emit('request', live);
      harness.emit('requestfinished', live);

      const routeTwoUnreset = await waitForAppApiRequestsToSettle(harness.page, tracker, {
        idleMs: 5,
        timeoutMs: 20,
      });
      expect(routeTwoUnreset.settled).toBe(false);
      expect(routeTwoUnreset.pendingUrls).toEqual([stranded]);

      // The fix. Same tracker, same completed request, now settles.
      tracker.reset();
      const liveAgain = createRequest(nextRoute);
      harness.emit('request', liveAgain);
      harness.emit('requestfinished', liveAgain);

      const routeTwoReset = await waitForAppApiRequestsToSettle(harness.page, tracker, {
        idleMs: 5,
        timeoutMs: 20,
      });
      expect(routeTwoReset).toEqual({ settled: true, pendingUrls: [] });
    });

    it('still fails the route that OWNS a slow request', async () => {
      // The reset must not turn every never-settling request into a pass. A
      // request issued after the reset, on the route being measured, is that
      // route's own problem and has to be reported.
      const harness = createPageHarness();
      const tracker = watchAppApiRequests(harness.page);

      tracker.reset();
      harness.emit('request', createRequest(stranded));

      const settlement = await waitForAppApiRequestsToSettle(harness.page, tracker, {
        idleMs: 5,
        timeoutMs: 20,
      });

      expect(settlement.settled).toBe(false);
      expect(settlement.pendingUrls).toEqual([stranded]);
    });

    it('does not report settled on a stale idle window after a reset', async () => {
      // `reset()` must clear `lastActivityAt` as well as `pending`. If it only
      // cleared `pending`, a tracker last touched longer ago than `idleMs`
      // would already satisfy the idle condition, so the very first poll would
      // return settled — before the new route issued anything. That trades a
      // false failure for a false pass, which is worse.
      vi.useFakeTimers();
      const harness = createPageHarness();
      const tracker = watchAppApiRequests(harness.page);

      // Let the clock run well past the idle window with nothing in flight.
      await vi.advanceTimersByTimeAsync(500);
      tracker.reset();

      let resolved = false;
      const settlementPromise = waitForAppApiRequestsToSettle(harness.page, tracker, {
        idleMs: 50,
        timeoutMs: 500,
      }).then(settlement => {
        resolved = true;
        return settlement;
      });

      // Must still wait out a full idle window measured from the reset.
      await vi.advanceTimersByTimeAsync(25);
      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(50);
      await expect(settlementPromise).resolves.toEqual({ settled: true, pendingUrls: [] });
    });
  });
});

/**
 * `reset()` existing is not the fix — CALLING it is. The sweep in
 * `route-health-by-role.spec.ts` is its only consumer, and that spec runs only
 * in Nightly Health against a live server, so deleting the call breaks nothing
 * any local or PR check would notice. The cascade would simply come back, and
 * would once again read as a product bug.
 *
 * This is a wiring assertion, which is fair as source text: deleting the wiring
 * deletes the string. But comment lines are stripped first, because the block
 * explaining that call necessarily says "reset" several times — a plain
 * `includes('pendingAppApiRequests.reset()')` would be satisfied by the prose
 * with the call itself removed.
 */
describe('the route sweep actually calls reset()', () => {
  const sweepSource = readFileSync(
    resolve(import.meta.dirname, '../e2e/route-health-by-role.spec.ts'),
    'utf8'
  );

  /** Source lines with comment-only lines removed. */
  const codeLines = sweepSource
    .split('\n')
    .map(line => line.trim())
    .filter(line => !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*'));

  it('resets the tracker between routes, in code and not only in a comment', () => {
    expect(codeLines).toContain('pendingAppApiRequests.reset();');
  });

  it('resets BEFORE navigating, so the new route is measured from zero', () => {
    const resetAt = codeLines.indexOf('pendingAppApiRequests.reset();');
    const gotoAt = codeLines.findIndex(line => line.startsWith('await page.goto(route.path'));
    expect(resetAt).toBeGreaterThan(-1);
    expect(gotoAt).toBeGreaterThan(-1);
    // Resetting after the navigation would discard the very requests the route
    // under test had just issued, turning the false failure into a false pass.
    expect(resetAt).toBeLessThan(gotoAt);
  });
});
