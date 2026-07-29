import { describe, expect, it } from 'vitest';
import { mapWithConcurrency, scoringEntryNumber } from './loadBrowserRunner';

describe('scoringEntryNumber', () => {
  it('creates one bounded five-session overlap while keeping other scores disjoint', () => {
    const firstTargets = Array.from({ length: 55 }, (_, sessionIndex) =>
      scoringEntryNumber(sessionIndex, 0)
    );

    expect(firstTargets.filter(entryNumber => entryNumber === 401)).toHaveLength(5);
    expect(new Set(firstTargets).size).toBe(51);
    expect(firstTargets.slice(49)).toEqual([393, 401, 401, 401, 401, 401]);
    expect(scoringEntryNumber(51, 1)).toBe(410);
    expect(scoringEntryNumber(52, 1)).toBe(418);
  });
});

describe('mapWithConcurrency', () => {
  it('bounds concurrent preparation while preserving assignment order', async () => {
    let active = 0;
    let peak = 0;
    const resolvers: Array<() => void> = [];

    const resultPromise = mapWithConcurrency([1, 2, 3, 4, 5], 2, async value => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>(resolve => resolvers.push(resolve));
      active -= 1;
      return value * 10;
    });

    await expect.poll(() => resolvers.length).toBe(2);
    resolvers.shift()?.();
    await expect.poll(() => resolvers.length).toBe(2);
    resolvers.shift()?.();
    await expect.poll(() => resolvers.length).toBe(2);
    resolvers.shift()?.();
    await expect.poll(() => resolvers.length).toBe(2);
    resolvers.shift()?.();
    await expect.poll(() => resolvers.length).toBe(1);
    resolvers.shift()?.();

    await expect(resultPromise).resolves.toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });

  it('rejects invalid concurrency', async () => {
    await expect(mapWithConcurrency([1], 0, async value => value)).rejects.toThrow(
      'Concurrency must be a positive integer'
    );
  });
});
