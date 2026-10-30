import { describe, expect, it } from 'vitest';
import type { OwnReplicaEntryLabel } from '@/services/database/entries/ownReplicaEntries';
import { selectEntriesToday } from './entriesToday';

function label(overrides: Partial<OwnReplicaEntryLabel>): OwnReplicaEntryLabel {
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
});
