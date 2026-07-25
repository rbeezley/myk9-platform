import { describe, it, expect } from 'vitest';
import { toQuickAdvanceChips, formatChipLabel } from './quickAdvanceReplicated';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

function entry(over: Partial<ReplicatedEntry> & { id: string }): ReplicatedEntry {
  return {
    classId: 'class-1',
    armband: over.id,
    dogCallName: `Dog ${over.id}`,
    dogBreed: 'Golden Retriever',
    runOrder: Number(over.id),
    isScored: false,
    ...over,
  };
}

const paperGateClass: ReplicatedEntry[] = [
  entry({ id: '3' }),
  entry({ id: '1' }),
  entry({ id: '4' }),
  entry({ id: '2' }),
];

describe('toQuickAdvanceChips — no check-in status data (paper gate)', () => {
  it('offers the next three pending dogs in run order with armband, name and breed', () => {
    const chips = toQuickAdvanceChips(paperGateClass);
    expect(chips.map(c => c.entryId)).toEqual(['1', '2', '3']);
    expect(chips[0]).toEqual({
      entryId: '1',
      armband: '1',
      callName: 'Dog 1',
      breed: 'Golden Retriever',
      gateLabel: null,
    });
    expect(formatChipLabel(chips[0]!)).toBe('#1 Dog 1 — Golden Retriever');
  });

  it('never offers the dog just scored', () => {
    const chips = toQuickAdvanceChips(paperGateClass, { excludeEntryId: '1' });
    expect(chips.map(c => c.entryId)).toEqual(['2', '3', '4']);
  });
});

describe('toQuickAdvanceChips — opportunistic gate statuses', () => {
  it('leads with at-gate, then come-to-gate, and labels them', () => {
    const chips = toQuickAdvanceChips([
      entry({ id: '1' }),
      entry({ id: '2' }),
      entry({ id: '8', checkInStatus: 'come-to-gate' }),
      entry({ id: '9', checkInStatus: 'at-gate' }),
    ]);
    expect(chips.map(c => c.entryId)).toEqual(['9', '8', '1']);
    expect(chips.map(c => c.gateLabel)).toEqual(['At gate', 'Called to gate', null]);
  });

  it('reads the snake_case check-in alias too', () => {
    const chips = toQuickAdvanceChips([
      entry({ id: '1' }),
      entry({ id: '7', check_in_status: 'at-gate' }),
    ]);
    expect(chips.map(c => c.entryId)).toEqual(['7', '1']);
  });
});

describe('toQuickAdvanceChips — end of class and queue exclusions', () => {
  it('excludes the in-ring dog, scored dogs and pulled dogs', () => {
    const chips = toQuickAdvanceChips([
      entry({ id: '1', isInRing: true }),
      entry({ id: '2', isScored: true }),
      entry({ id: '3', checkInStatus: 'pulled' }),
      entry({ id: '4' }),
    ]);
    expect(chips.map(c => c.entryId)).toEqual(['4']);
  });

  it('returns fewer than three when fewer remain', () => {
    expect(toQuickAdvanceChips([entry({ id: '1' }), entry({ id: '2' })])).toHaveLength(2);
  });

  it('returns nothing when the last dog in the class was the one just scored', () => {
    expect(toQuickAdvanceChips([entry({ id: '1' })], { excludeEntryId: '1' })).toEqual([]);
  });
});

describe('formatChipLabel', () => {
  it('degrades gracefully when display fields are missing', () => {
    expect(
      formatChipLabel({ entryId: 'x', armband: '', callName: '', breed: '', gateLabel: null })
    ).toBe('Next dog');
    expect(
      formatChipLabel({ entryId: 'x', armband: '12', callName: '', breed: '', gateLabel: null })
    ).toBe('#12');
    expect(
      formatChipLabel({
        entryId: 'x',
        armband: '',
        callName: 'Bella',
        breed: 'Poodle',
        gateLabel: null,
      })
    ).toBe('Bella — Poodle');
  });
});
