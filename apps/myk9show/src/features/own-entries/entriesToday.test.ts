import { describe, expect, it } from 'vitest';
import type { OwnEntryLabel } from './entriesToday';
import { selectEntriesToday } from './entriesToday';

function label(overrides: Partial<OwnEntryLabel>): OwnEntryLabel {
  return {
    entryId: 'e1',
    showId: 'show-today',
    entryStatus: 'confirmed',
    checkInStatus: 'no-status',
    dogCallName: 'Scout',
    classLabel: 'Container Novice A',
    ...overrides,
  };
}

describe('selectEntriesToday', () => {
  const today = new Set(['show-today']);

  it('keeps entries in a show happening today, with a Check in line until checked in', () => {
    expect(selectEntriesToday([label({})], today)).toEqual([
      {
        entryId: 'e1',
        showId: 'show-today',
        dogCallName: 'Scout',
        classLabel: 'Container Novice A',
        statusLabel: 'Check in',
      },
    ]);
  });

  it('words a checked-in entry as checked in', () => {
    const [line] = selectEntriesToday([label({ checkInStatus: 'checked-in' })], today);
    expect(line?.statusLabel).toBe('Checked in');
  });

  it('drops entries in shows that are not today', () => {
    expect(selectEntriesToday([label({ showId: 'show-next-month' })], today)).toEqual([]);
  });

  it('drops pulled and withdrawn entries', () => {
    expect(
      selectEntriesToday(
        [
          label({ entryId: 'pulled', checkInStatus: 'pulled' }),
          label({ entryId: 'withdrawn', entryStatus: 'withdrawn' }),
        ],
        today
      )
    ).toEqual([]);
  });

  it('keeps a completed entry as Done, but not a pending-payment or cancelled one', () => {
    const lines = selectEntriesToday(
      [
        label({ entryId: 'done', entryStatus: 'completed' }),
        label({ entryId: 'done-ring', checkInStatus: 'completed' }),
        label({ entryId: 'unpaid', entryStatus: 'pending-payment' }),
        label({ entryId: 'cancelled', entryStatus: 'cancelled' }),
      ],
      today
    );
    expect(lines.map(l => [l.entryId, l.statusLabel])).toEqual([
      ['done', 'Done'],
      ['done-ring', 'Done'],
    ]);
  });
});
