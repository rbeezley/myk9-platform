import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildActivityWindows,
  chunk,
  findDuplicateEntryGroups,
  INACTIVE_ENTRY_STATUSES,
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
      e({ id: '7', class_id: 'k' }),
      e({ id: '8', class_id: 'k', entry_status: 'not_accepted' }),
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

describe('INACTIVE_ENTRY_STATUSES', () => {
  it('only holds values the entries CHECK constraint stores (latest definition)', () => {
    const sql = readFileSync(
      new URL(
        '../../../../supabase/migrations/20260924094300_myk9_719_retire_scratch_requested.sql',
        import.meta.url
      ),
      'utf8'
    );
    const check = sql.slice(sql.indexOf('ADD CONSTRAINT entries_entry_status_check'));
    const stored = [...check.slice(0, check.indexOf('));')).matchAll(/'([^']+)'/g)].map(m => m[1]);
    expect(stored.length).toBeGreaterThan(10);
    for (const status of INACTIVE_ENTRY_STATUSES) expect(stored).toContain(status);
    expect(INACTIVE_ENTRY_STATUSES.has('not_accepted')).toBe(true);
  });
});
