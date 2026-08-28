/**
 * Regression test for impeccable p3 audit finding A7.
 *
 * `dispatchBulk` used `Promise.allSettled(items.map(runItem))`, which starts
 * every item immediately. Selecting a whole show and bulk-accepting therefore
 * fired one HTTP write per entry with no bound -- hundreds of concurrent PATCHes
 * against `entries`, which is the shape of the `ringside_update_entry` 40001
 * serialization storm that has already pushed staging past 80% CPU.
 *
 * The bound must not change any OUTCOME: every item still runs, results are
 * still folded by index, and a failing item is still captured rather than
 * rejecting the batch.
 */

import { describe, it, expect } from 'vitest';
import { BULK_DISPATCH_CONCURRENCY, dispatchBulk } from '../bulkDispatch';

/** A deferred promise, so a test can hold writes open and observe the pool. */
function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('dispatchBulk concurrency (audit A7)', () => {
  it('keeps the cap small enough to matter', () => {
    // Asserting only "peak <= BULK_DISPATCH_CONCURRENCY" is self-referential:
    // it stays green if the constant is raised back to something unbounded.
    // This is the absolute bound the finding is actually about.
    expect(BULK_DISPATCH_CONCURRENCY).toBeGreaterThan(0);
    expect(BULK_DISPATCH_CONCURRENCY).toBeLessThanOrEqual(10);
  });

  it('never runs more than the cap at once', async () => {
    const items = Array.from({ length: 50 }, (_, index) => index);
    let inFlight = 0;
    let peak = 0;

    await dispatchBulk(items, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
    });

    expect(peak).toBeLessThanOrEqual(BULK_DISPATCH_CONCURRENCY);
  });

  it('holds later items back while the pool is saturated', async () => {
    const gates = Array.from({ length: 10 }, deferred);
    const started: number[] = [];

    const run = dispatchBulk(
      gates.map((_, index) => index),
      async index => {
        started.push(index);
        await gates[index]!.promise;
      }
    );

    await Promise.resolve();
    // Exactly the cap has begun; the rest are queued behind it.
    expect(started).toHaveLength(BULK_DISPATCH_CONCURRENCY);

    gates.forEach(gate => gate.resolve());
    await run;
    expect(started).toHaveLength(10);
  });

  it('still runs every item, in the presence of the bound', async () => {
    const items = Array.from({ length: 25 }, (_, index) => index);
    const seen: number[] = [];

    const outcome = await dispatchBulk(items, async index => {
      seen.push(index);
    });

    expect(seen.sort((a, b) => a - b)).toEqual(items);
    expect(outcome.succeeded).toHaveLength(25);
    expect(outcome.failed).toHaveLength(0);
  });

  it('folds failures by item rather than rejecting the batch', async () => {
    const outcome = await dispatchBulk([0, 1, 2, 3], async index => {
      if (index % 2 === 1) throw new Error(`item ${index} failed`);
    });

    expect(outcome.succeeded).toEqual([0, 2]);
    expect(outcome.failed.map(entry => entry.item)).toEqual([1, 3]);
    expect((outcome.failed[0]?.error as Error).message).toBe('item 1 failed');
  });

  it('one slow item does not stall the others behind it', async () => {
    const slow = deferred();
    const finished: number[] = [];

    const run = dispatchBulk([0, 1, 2, 3, 4, 5, 6, 7], async index => {
      if (index === 0) await slow.promise;
      finished.push(index);
    });

    // Everything the pool can reach past the blocked worker completes first.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(finished).not.toContain(0);
    expect(finished.length).toBeGreaterThan(0);

    slow.resolve();
    await run;
    expect(finished).toHaveLength(8);
  });

  it('handles an empty batch without spawning workers', async () => {
    const outcome = await dispatchBulk([], async () => {
      throw new Error('should never run');
    });

    expect(outcome.succeeded).toHaveLength(0);
    expect(outcome.failed).toHaveLength(0);
  });
});
