import { describe, expect, it } from 'vitest';

import type { ResultsEntryRow } from './buildResultsClassRows';
import { deriveClassTies, hasUnresolvedTie } from './coinFlipRows';

const dog = (id: string, fields: Partial<ResultsEntryRow> = {}): ResultsEntryRow => ({
  entryId: id,
  armband: id.replace(/\D/g, '') || '1',
  dogName: `Dog ${id}`,
  handlerName: '',
  placement: null,
  resultLabel: 'Q',
  qualified: true,
  timeLabel: '',
  faults: 0,
  scored: true,
  pointsEarned: null,
  timeSeconds: 40,
  placementTie: null,
  ...fields,
});

const unresolved = (id: string, fields: Partial<ResultsEntryRow> = {}) =>
  dog(id, { placementTie: 'unresolved', ...fields });

describe('deriveClassTies', () => {
  it('groups dogs with the same faults and time, with the place they share', () => {
    const groups = deriveClassTies(
      [
        unresolved('a1', { placement: 1 }),
        unresolved('a2', { placement: 2 }),
        unresolved('b3', { placement: 3, faults: 1, timeSeconds: 50 }),
        unresolved('b4', { placement: 4, faults: 1, timeSeconds: 50 }),
        dog('c5', { placement: 5, faults: 2 }),
      ],
      false
    );
    expect(groups.map(group => [group.rank, group.entries.map(e => e.entryId)])).toEqual([
      [1, ['a1', 'a2']],
      [3, ['b3', 'b4']],
    ]);
    expect(groups.every(group => !group.byPoints)).toBe(true);
  });

  it('at an ordinary show, same faults and time with different points is ONE group', () => {
    const groups = deriveClassTies(
      [
        unresolved('a1', { placement: 1, pointsEarned: 90 }),
        unresolved('a2', { placement: 2, pointsEarned: 75 }),
      ],
      false
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries).toHaveLength(2);
  });

  it('at nationals, same points and time with different faults is ONE group', () => {
    const groups = deriveClassTies(
      [
        unresolved('a1', { placement: 1, pointsEarned: 90, faults: 0 }),
        unresolved('a2', { placement: 2, pointsEarned: 90, faults: 2 }),
      ],
      true
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ rank: 1, byPoints: true });
  });

  it('at nationals, the same faults and time with different points are separate groups', () => {
    const groups = deriveClassTies(
      [
        unresolved('a1', { placement: 1, pointsEarned: 90 }),
        unresolved('a2', { placement: 2, pointsEarned: 90 }),
        unresolved('b3', { placement: 3, pointsEarned: 80 }),
        unresolved('b4', { placement: 4, pointsEarned: 80 }),
      ],
      true
    );
    expect(groups.map(group => group.rank)).toEqual([1, 3]);
  });

  it('keeps a tie straddling 4th as one group of every dog the server marked', () => {
    const groups = deriveClassTies(
      [
        dog('a1', { placement: 1, timeSeconds: 10 }),
        dog('a2', { placement: 2, timeSeconds: 11 }),
        unresolved('t3', { placement: 3 }),
        unresolved('t4', { placement: 4 }),
        unresolved('t5', { placement: 5 }),
      ],
      false
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ rank: 3 });
    expect(groups[0]?.entries.map(e => e.entryId)).toEqual(['t3', 't4', 't5']);
  });

  it('does not offer a shared tie below 4th, nor a dog that is not rank-eligible', () => {
    const groups = deriveClassTies(
      [
        dog('s5', { placement: 5, placementTie: 'shared' }),
        dog('s6', { placement: 5, placementTie: 'shared' }),
        unresolved('nq', { qualified: false, resultLabel: 'NQ' }),
        unresolved('open', { scored: false }),
      ],
      false
    );
    expect(groups).toEqual([]);
  });

  it('treats a missing score or time as its own value, like the server', () => {
    const groups = deriveClassTies(
      [
        unresolved('a1', { placement: 1, timeSeconds: null }),
        unresolved('a2', { placement: 2, timeSeconds: null }),
        unresolved('b3', { placement: 3, timeSeconds: 0 }),
      ],
      false
    );
    expect(groups.map(group => group.entries.map(e => e.entryId))).toEqual([['a1', 'a2'], ['b3']]);
  });
});

describe('deriveClassTies before the show row is read', () => {
  it('offers no group while the ranking key is unknown', () => {
    expect(deriveClassTies([unresolved('a1', { placement: 1 })], null)).toEqual([]);
  });
});

describe('hasUnresolvedTie', () => {
  it('is true only while a ribbon tie is unresolved', () => {
    expect(hasUnresolvedTie([dog('a'), unresolved('b')])).toBe(true);
    expect(hasUnresolvedTie([dog('a'), dog('b', { placementTie: 'shared' })])).toBe(false);
    expect(hasUnresolvedTie([])).toBe(false);
  });
});
