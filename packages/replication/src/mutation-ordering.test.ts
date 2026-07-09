import { describe, expect, it } from 'vitest';
import type { PendingMutation } from './types';
import { compareMutationOrder, sortMutationsByDependencies } from './mutation-ordering';

function mutation(overrides: Partial<PendingMutation>): PendingMutation {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    tableName: overrides.tableName ?? 'entries',
    operation: overrides.operation ?? 'UPDATE',
    rowId: overrides.rowId ?? 'entry-1',
    data: overrides.data ?? { id: overrides.rowId ?? 'entry-1' },
    timestamp: overrides.timestamp ?? 1,
    retries: overrides.retries ?? 0,
    status: overrides.status ?? 'pending',
    dependsOn: overrides.dependsOn,
    sequenceNumber: overrides.sequenceNumber,
    serverVersion: overrides.serverVersion,
    nextRetryAt: overrides.nextRetryAt,
  };
}

describe('sortMutationsByDependencies', () => {
  it('orders independent root mutations by timestamp', () => {
    const newest = mutation({ id: 'newest', timestamp: 30 });
    const oldest = mutation({ id: 'oldest', timestamp: 10 });
    const middle = mutation({ id: 'middle', timestamp: 20 });

    const result = sortMutationsByDependencies([newest, oldest, middle]);

    expect(result.sorted.map(m => m.id)).toEqual(['oldest', 'middle', 'newest']);
    expect(result.circularCount).toBe(0);
  });

  // Audit H1: two edits to the SAME row within the same millisecond must upload
  // oldest-first by sequenceNumber, so a stale re-stamped payload can't overwrite
  // a correction. With only timestamp (both = 1), ordering was non-deterministic.
  it('orders same-timestamp edits to one row by sequenceNumber (oldest-first)', () => {
    const correction = mutation({
      id: 'correction',
      rowId: 'entry-7',
      timestamp: 1,
      sequenceNumber: 2,
    });
    const original = mutation({
      id: 'original',
      rowId: 'entry-7',
      timestamp: 1,
      sequenceNumber: 1,
    });

    // Input deliberately reversed to prove insertion order doesn't decide it.
    const result = sortMutationsByDependencies([correction, original]);

    expect(result.sorted.map(m => m.id)).toEqual(['original', 'correction']);
  });

  it('keeps sequence order WITHIN the dependency constraint', () => {
    const parent = mutation({ id: 'parent', timestamp: 1, sequenceNumber: 1 });
    // Two independent children of parent; sequence decides their relative order.
    const childLate = mutation({
      id: 'child-late',
      timestamp: 1,
      sequenceNumber: 3,
      dependsOn: ['parent'],
    });
    const childEarly = mutation({
      id: 'child-early',
      timestamp: 1,
      sequenceNumber: 2,
      dependsOn: ['parent'],
    });

    const result = sortMutationsByDependencies([childLate, childEarly, parent]);

    // Parent first (dependency), then children in sequence order.
    expect(result.sorted.map(m => m.id)).toEqual(['parent', 'child-early', 'child-late']);
    expect(result.circularCount).toBe(0);
  });

  it('compareMutationOrder falls back to timestamp when a sequence is missing', () => {
    const withSeq = mutation({ id: 'a', timestamp: 100, sequenceNumber: 5 });
    const withoutSeq = mutation({ id: 'b', timestamp: 50, sequenceNumber: undefined });
    // Not both assigned → timestamp decides (b is older), so b sorts first.
    expect(compareMutationOrder(withSeq, withoutSeq)).toBeGreaterThan(0);
    expect(compareMutationOrder(withoutSeq, withSeq)).toBeLessThan(0);
  });

  it('uploads dependencies before dependents even when the input is reversed', () => {
    const child = mutation({ id: 'child', timestamp: 1, dependsOn: ['parent'] });
    const grandchild = mutation({ id: 'grandchild', timestamp: 2, dependsOn: ['child'] });
    const parent = mutation({ id: 'parent', timestamp: 3 });

    const result = sortMutationsByDependencies([grandchild, child, parent]);

    expect(result.sorted.map(m => m.id)).toEqual(['parent', 'child', 'grandchild']);
    expect(result.circularCount).toBe(0);
  });

  it('ignores dependencies that are not present in the current upload batch', () => {
    const mutationWithMissingDependency = mutation({
      id: 'child',
      timestamp: 1,
      dependsOn: ['already-uploaded-parent'],
    });
    const independent = mutation({ id: 'independent', timestamp: 2 });

    const result = sortMutationsByDependencies([independent, mutationWithMissingDependency]);

    expect(result.sorted.map(m => m.id)).toEqual(['child', 'independent']);
    expect(result.circularCount).toBe(0);
  });

  it('appends circular mutations using the legacy sequence-when-both-present ordering', () => {
    const root = mutation({ id: 'root', timestamp: 1 });
    const cycleB = mutation({
      id: 'cycle-b',
      timestamp: 50,
      sequenceNumber: 2,
      dependsOn: ['cycle-a'],
    });
    const cycleA = mutation({
      id: 'cycle-a',
      timestamp: 10,
      sequenceNumber: 1,
      dependsOn: ['cycle-b'],
    });
    const cycleNoSequence = mutation({
      id: 'cycle-no-sequence',
      timestamp: 5,
      dependsOn: ['cycle-b'],
    });

    const result = sortMutationsByDependencies([cycleB, cycleA, root, cycleNoSequence]);

    expect(result.sorted.map(m => m.id)).toEqual([
      'root',
      'cycle-no-sequence',
      'cycle-a',
      'cycle-b',
    ]);
    expect(result.circularCount).toBe(3);
  });
});
