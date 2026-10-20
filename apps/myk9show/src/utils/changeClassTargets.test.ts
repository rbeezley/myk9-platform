import { describe, expect, it } from 'vitest';
import {
  entryHoldsDogInClass,
  isClassClosedToChange,
  selectChangeClassTargets,
} from './changeClassTargets';

describe('selectChangeClassTargets', () => {
  const classes = [
    { id: 'a', status: 'upcoming' },
    { id: 'b', status: 'in_progress' },
    { id: 'c', status: 'completed' },
    { id: 'd', status: 'cancelled' },
    { id: 'e' },
    { id: 'f', status: 'upcoming' },
  ];

  it('lists every open class except the current, entered, complete and cancelled ones', () => {
    const ids = selectChangeClassTargets(classes, 'a', new Set(['f']), () => undefined).map(
      t => t.cls.id
    );
    expect(ids).toEqual(['b', 'e']);
  });

  it('flags a full class instead of removing it, and never when capacity is unknown', () => {
    const spots: Record<string, number> = { b: 0, e: 3 };
    const result = selectChangeClassTargets(classes, 'a', new Set(), cls => spots[cls.id]);
    expect(result.map(t => [t.cls.id, t.isFull])).toEqual([
      ['b', true],
      ['e', false],
      ['f', false],
    ]);
  });

  it('offers nothing without a current class', () => {
    expect(selectChangeClassTargets(classes, undefined, new Set(), () => 1)).toEqual([]);
  });
});

describe('entryHoldsDogInClass', () => {
  it('mirrors the server index: only deleted, withdrawn and scratched rows free the class', () => {
    expect(entryHoldsDogInClass({ entry_status: 'confirmed' })).toBe(true);
    expect(entryHoldsDogInClass({ entryStatus: 'moved' })).toBe(true);
    expect(entryHoldsDogInClass({ entry_status: 'withdrawn' })).toBe(false);
    expect(entryHoldsDogInClass({ entry_status: 'scratched' })).toBe(false);
    expect(entryHoldsDogInClass({ entry_status: 'confirmed', deleted_at: 'x' })).toBe(false);
  });
});

describe('isClassClosedToChange', () => {
  it('closes completed and cancelled classes only', () => {
    expect(isClassClosedToChange('completed')).toBe(true);
    expect(isClassClosedToChange('cancelled')).toBe(true);
    expect(isClassClosedToChange('upcoming')).toBe(false);
    expect(isClassClosedToChange(undefined)).toBe(false);
  });
});
