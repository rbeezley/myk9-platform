import { describe, it, expect } from 'vitest';
import { assignRunOrderSlots } from './runOrderSlots';

const dog = (id: string, exhibitorOrder?: number | null) => ({ id, exhibitorOrder });

describe('assignRunOrderSlots (MYK9-1808)', () => {
  it('numbers a whole class 1..n, as before', () => {
    const before = [dog('a', 1), dog('b', 2), dog('c', 3)];
    const after = assignRunOrderSlots(before, [before[1], before[2], before[0]]);
    expect(after.map(e => e.exhibitorOrder)).toEqual([1, 2, 3]);
  });

  it('hands a subset its own slots back in the new order', () => {
    const before = [dog('c', 3), dog('g', 7), dog('i', 9)];
    const after = assignRunOrderSlots(before, [before[2], before[0], before[1]]);
    expect(after.map(e => [e.id, e.exhibitorOrder])).toEqual([
      ['i', 3],
      ['c', 7],
      ['g', 9],
    ]);
  });

  it('sorts the held slots, so a subset shown out of run order still keeps them', () => {
    const before = [dog('i', 9), dog('c', 3)];
    const after = assignRunOrderSlots(before, [before[1], before[0]]);
    expect(after.map(e => e.exhibitorOrder)).toEqual([3, 9]);
  });

  it('falls back to 1..n when any dog has no stored run order', () => {
    const before = [dog('a', 4), dog('b', 0), dog('c', null)];
    const after = assignRunOrderSlots(before, [before[2], before[1], before[0]]);
    expect(after.map(e => e.exhibitorOrder)).toEqual([1, 2, 3]);
  });
});
