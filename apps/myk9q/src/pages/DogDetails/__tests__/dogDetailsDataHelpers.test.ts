import { describe, it, expect } from 'vitest';
import { calculateQueuePosition } from '../hooks/dogDetailsDataHelpers';
import type { RawEntryData } from '../hooks/dogDetailsDataHelpers';

function makeEntry(
  overrides: Partial<RawEntryData> & { id: number; class_id: number }
): RawEntryData {
  return {
    armband: overrides.id * 10,
    is_scored: false,
    entry_status: 'checked-in',
    run_order: null,
    ...overrides,
  };
}

describe('calculateQueuePosition', () => {
  it('returns undefined when entry is already scored', () => {
    const entry = makeEntry({ id: 1, class_id: 100, is_scored: true });
    const all = [entry, makeEntry({ id: 2, class_id: 100 })];
    expect(calculateQueuePosition(entry, all)).toBeUndefined();
  });

  it('sorts by run_order ascending and returns 0-indexed position', () => {
    const entry = makeEntry({ id: 1, class_id: 100, run_order: 3 });
    const all = [
      makeEntry({ id: 2, class_id: 100, run_order: 1 }),
      makeEntry({ id: 3, class_id: 100, run_order: 2 }),
      entry,
    ];
    // entry has run_order 3, so 2 dogs ahead
    expect(calculateQueuePosition(entry, all)).toBe(2);
  });

  it('falls back to armband when run_order is null', () => {
    // entry has armband 30, others have 10 and 20
    const entry = makeEntry({ id: 3, class_id: 100, run_order: null, armband: 30 });
    const all = [
      makeEntry({ id: 1, class_id: 100, run_order: null, armband: 10 }),
      makeEntry({ id: 2, class_id: 100, run_order: null, armband: 20 }),
      entry,
    ];
    expect(calculateQueuePosition(entry, all)).toBe(2);
  });

  it('falls back to armband when run_order is 0', () => {
    const entry = makeEntry({ id: 3, class_id: 100, run_order: 0, armband: 15 });
    const all = [
      makeEntry({ id: 1, class_id: 100, run_order: 0, armband: 10 }),
      entry,
      makeEntry({ id: 2, class_id: 100, run_order: 0, armband: 20 }),
    ];
    // armband 15 is between 10 and 20, so 1 dog ahead
    expect(calculateQueuePosition(entry, all)).toBe(1);
  });

  it('places in-ring entry first (0 dogs ahead)', () => {
    const entry = makeEntry({ id: 1, class_id: 100, run_order: 1, entry_status: 'in-ring' });
    const all = [makeEntry({ id: 2, class_id: 100, run_order: 2 }), entry];
    expect(calculateQueuePosition(entry, all)).toBe(0);
  });

  it('excludes pulled entries from the count', () => {
    const entry = makeEntry({ id: 1, class_id: 100, run_order: 1 });
    const all = [
      entry,
      makeEntry({ id: 2, class_id: 100, run_order: 2, entry_status: 'pulled' }),
      makeEntry({ id: 3, class_id: 100, run_order: 3 }),
    ];
    // pulled entry excluded; entry is first among remaining
    expect(calculateQueuePosition(entry, all)).toBe(0);
  });

  it('excludes scored entries from the count', () => {
    const entry = makeEntry({ id: 2, class_id: 100, run_order: 2 });
    const all = [makeEntry({ id: 1, class_id: 100, run_order: 1, is_scored: true }), entry];
    // scored entry excluded; entry is first
    expect(calculateQueuePosition(entry, all)).toBe(0);
  });

  it('only considers entries in the same class', () => {
    const entry = makeEntry({ id: 1, class_id: 100, run_order: 1 });
    const all = [
      entry,
      makeEntry({ id: 2, class_id: 200, run_order: 0, armband: 5 }), // different class
    ];
    expect(calculateQueuePosition(entry, all)).toBe(0);
  });
});
