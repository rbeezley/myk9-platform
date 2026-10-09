import { describe, expect, it } from 'vitest';

import {
  buildActivityWindows,
  chunk,
  findDuplicateEntryGroups,
  inAnyWindow,
  stuckReasons,
  type LooseEntry,
} from '../diagnostics/looseEndsLogic';

const e = (over: Partial<LooseEntry>): LooseEntry => ({
  id: 'x',
  dog_id: 'd',
  class_id: 'c',
  registration_id: 'r',
  handler_id: 'h',
  entry_status: 'confirmed',
  confirmation_email_status: 'sent',
  created_at: null,
  ...over,
});

describe('buildActivityWindows', () => {
  it('splits sessions on a gap over 2h and pads each side by 30 min', () => {
    const windows = buildActivityWindows([
      '2026-10-01T10:00:00Z',
      '2026-10-01T11:30:00Z',
      '2026-10-01T14:00:00Z',
      null,
    ]);
    expect(windows).toHaveLength(2);
    expect(inAnyWindow('2026-10-01T09:30:00Z', windows)).toBe(true);
    expect(inAnyWindow('2026-10-01T12:00:00Z', windows)).toBe(true);
    expect(inAnyWindow('2026-10-01T12:01:00Z', windows)).toBe(false);
    expect(inAnyWindow('2026-10-01T13:30:00Z', windows)).toBe(true);
    expect(inAnyWindow(null, windows)).toBe(false);
  });

  it('returns no window for no usable timestamps', () => {
    expect(buildActivityWindows([null])).toEqual([]);
  });
});

describe('findDuplicateEntryGroups', () => {
  it('needs the same dog and class, ignores inactive statuses and missing keys', () => {
    const groups = findDuplicateEntryGroups([
      e({ id: '1' }),
      e({ id: '2' }),
      e({ id: '3', entry_status: 'scratched' }),
      e({ id: '4', class_id: 'other' }),
      e({ id: '5', dog_id: null }),
      e({ id: '6', dog_id: null }),
    ]);
    expect(groups.map(g => g.map(x => x.id))).toEqual([['1', '2']]);
  });
});

describe('stuckReasons', () => {
  it('names draft, pending-payment, failed and bounced; leaves normal rows alone', () => {
    expect(stuckReasons(e({ entry_status: 'draft' }))).toHaveLength(1);
    expect(stuckReasons(e({ entry_status: 'pending-payment' }))).toHaveLength(1);
    expect(stuckReasons(e({ confirmation_email_status: 'bounced' }))).toHaveLength(1);
    expect(stuckReasons(e({ confirmation_email_status: 'pending' }))).toEqual([]);
    expect(stuckReasons(e({}))).toEqual([]);
  });
});

describe('chunk', () => {
  it('splits into fixed-size parts', () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
});
