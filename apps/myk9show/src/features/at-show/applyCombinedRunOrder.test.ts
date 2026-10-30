/**
 * Unit tests for applyCombinedRunOrder — the section-aware PRESET run-order
 * persistence for the combined at-show entry list.
 *
 * Assertion-first: the bug was the combined list silently discarding the
 * user's preset choice (`onApplyRunOrder` was a logger.warn stub). These pin
 * that the helper computes the section-aware order and writes the EXACT
 * `{ runOrder }` value per entry to `replicatedEntriesTable.updateEntry`, which
 * the replication layer routes through `ringside_update_entry`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Entry } from '@myk9/ringside';
import { applyCombinedRunOrder } from './applyCombinedRunOrder';

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { updateEntry: vi.fn() },
}));

import { replicatedEntriesTable } from '@/services/replication';

function entry(id: string, armband: number, section: 'A' | 'B'): Entry {
  return { id, armband, section } as unknown as Entry;
}

// Section A armbands 1,3,2 — section B armbands 4,6,5 (deliberately unsorted).
const mixed: Entry[] = [
  entry('a1', 1, 'A'),
  entry('a2', 3, 'A'),
  entry('a3', 2, 'A'),
  entry('b1', 4, 'B'),
  entry('b2', 6, 'B'),
  entry('b3', 5, 'B'),
];

/** Reduce the recorded updateEntry(id, { runOrder }) calls to an id→runOrder map. */
function recordedRunOrders(): Record<string, number> {
  const calls = vi.mocked(replicatedEntriesTable.updateEntry).mock.calls;
  return Object.fromEntries(
    calls.map(([id, patch]) => [id as string, (patch as { runOrder: number }).runOrder])
  );
}

describe('applyCombinedRunOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(replicatedEntriesTable.updateEntry).mockResolvedValue('ok');
  });

  it('persists a whole-class armband-asc order (scope "all")', async () => {
    await applyCombinedRunOrder(mixed, 'armband-asc', 'all');

    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledTimes(6);
    // Sorted by armband across both sections: 1,2,3,4,5,6 → a1,a3,a2,b1,b3,b2.
    expect(recordedRunOrders()).toEqual({
      a1: 1,
      a3: 2,
      a2: 3,
      b1: 4,
      b3: 5,
      b2: 6,
    });
  });

  it('defaults scope to "all" when omitted', async () => {
    await applyCombinedRunOrder(mixed, 'armband-asc');

    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledTimes(6);
    expect(recordedRunOrders().a1).toBe(1);
    expect(recordedRunOrders().b2).toBe(6);
  });

  it('reorders only section A and renumbers the rest (scope "A", renumber)', async () => {
    await applyCombinedRunOrder(mixed, 'armband-asc', 'A', 'renumber');

    const orders = recordedRunOrders();
    // A section sorted asc takes 1..3; B section follows 4..6.
    expect(orders.a1).toBe(1);
    expect(orders.a3).toBe(2);
    expect(orders.a2).toBe(3);
    expect([orders.b1, orders.b2, orders.b3].sort()).toEqual([4, 5, 6]);
  });

  it('reorders only section B, preserving the other section ahead (scope "B", preserve)', async () => {
    await applyCombinedRunOrder(mixed, 'armband-asc', 'B', 'preserve');

    const orders = recordedRunOrders();
    // preserve: the other section (A) is never written; unset, B starts at 1.
    expect(orders).toEqual({ b1: 1, b3: 2, b2: 3 });
  });

  it('maps ringside random-all to a full contiguous renumber (1..N)', async () => {
    await applyCombinedRunOrder(mixed, 'random-all', 'all');

    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledTimes(6);
    const orders = recordedRunOrders();
    // Every entry gets a run order; the set is a contiguous 1..6 permutation.
    expect(Object.keys(orders).sort()).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3']);
    expect(Object.values(orders).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('persists nothing for the manual preset (drag mode handles it)', async () => {
    await applyCombinedRunOrder(mixed, 'manual', 'all');
    expect(replicatedEntriesTable.updateEntry).not.toHaveBeenCalled();
  });

  it.each([
    ['combined-asc', { a1: 1, a3: 2, a2: 3, b1: 4, b3: 5, b2: 6 }],
    ['combined-desc', { b2: 1, b3: 2, b1: 3, a2: 4, a3: 5, a1: 6 }],
    ['a-then-b-desc', { a2: 1, a3: 2, a1: 3, b2: 4, b3: 5, b1: 6 }],
    ['b-then-a-asc', { b1: 1, b3: 2, b2: 3, a1: 4, a3: 5, a2: 6 }],
    ['b-then-a-desc', { b2: 1, b3: 2, b1: 3, a2: 4, a3: 5, a1: 6 }],
  ] as const)('persists %s for the whole class', async (preset, expected) => {
    await applyCombinedRunOrder(mixed, preset, 'all');
    expect(recordedRunOrders()).toEqual(expected);
  });

  it.each(['random', 'random-all', 'random-sections'] as const)(
    'persists a full permutation for %s',
    async preset => {
      await applyCombinedRunOrder(mixed, preset, 'all');
      expect(Object.values(recordedRunOrders()).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    }
  );

  it('writes only rows whose run order changed, comparing against exhibitorOrder', async () => {
    const ordered = mixed.map((e, i) => ({ ...e, exhibitorOrder: i + 1 }) as unknown as Entry);
    // Armbands run 1,3,2 / 4,6,5 in each section, so only those pairs swap.
    await applyCombinedRunOrder(ordered, 'a-then-b-asc', 'all');
    expect(recordedRunOrders()).toEqual({ a3: 2, a2: 3, b3: 5, b2: 6 });
  });

  it('preserve keeps the untouched section in its current relative order', async () => {
    const withOrder = [
      { ...entry('b2', 6, 'B'), exhibitorOrder: 1 },
      { ...entry('b1', 4, 'B'), exhibitorOrder: 2 },
      { ...entry('a2', 3, 'A'), exhibitorOrder: 3 },
      { ...entry('a1', 1, 'A'), exhibitorOrder: 4 },
    ] as unknown as Entry[];
    await applyCombinedRunOrder(withOrder, 'armband-asc', 'A', 'preserve');
    expect(recordedRunOrders()).toEqual({ a1: 3, a2: 4 });
  });

  it('rejects when the replication write fails', async () => {
    vi.mocked(replicatedEntriesTable.updateEntry).mockRejectedValueOnce(new Error('offline'));
    await expect(applyCombinedRunOrder(mixed, 'armband-asc', 'all')).rejects.toThrow('offline');
  });

  it("treats the adapter's 0 sentinel as unset: scoped section gets real orders, none end at 0", async () => {
    const zeroed = mixed.map(e => ({ ...e, exhibitorOrder: 0 }) as Entry);
    await applyCombinedRunOrder(zeroed, 'armband-asc', 'A', 'preserve');

    expect(recordedRunOrders()).toEqual({ a1: 1, a3: 2, a2: 3 });
    expect(Object.values(recordedRunOrders())).not.toContain(0);
  });

  it('gives a lone unset (0) scoped entry a real slot after the other section', async () => {
    const lone = [
      { ...entry('a1', 1, 'A'), exhibitorOrder: 0 },
      { ...entry('b1', 2, 'B'), exhibitorOrder: 1 },
      { ...entry('b2', 3, 'B'), exhibitorOrder: 2 },
    ] as unknown as Entry[];
    await applyCombinedRunOrder(lone, 'armband-asc', 'A', 'preserve');

    expect(recordedRunOrders()).toEqual({ a1: 3 });
  });
});
