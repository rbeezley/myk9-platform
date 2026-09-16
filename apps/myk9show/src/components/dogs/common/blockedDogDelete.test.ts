import { describe, expect, it } from 'vitest';
import { isBlockedByPaidOrScoredEntries, partitionBlockedDogs } from './blockedDogDelete';

describe('isBlockedByPaidOrScoredEntries', () => {
  it('detects the MK002 SQLSTATE on a DatabaseError-shaped object', () => {
    expect(
      isBlockedByPaidOrScoredEntries({
        name: 'DatabaseError',
        code: 'MK002',
        message: 'This dog has paid or scored entries. Scratch or refund them before deleting.',
      })
    ).toBe(true);
  });

  it('does not claim a code-less error is the MK002 refusal (MYK9-600)', () => {
    // The only caller is the bulk bar, whose failures come from
    // `useDeleteDogMutation` -> `deleteDog` -> `createDatabaseError`, which DOES
    // carry `code`. `translateDogDbError` — the function that drops `code` — is
    // never on that path. A message-shape fallback therefore bought nothing and
    // cost accuracy: any error whose text happens to mention paid or scored
    // entries (a wrapped log line, a future copy change, a server message about
    // a DIFFERENT dog) would have been offered an admin override it has no
    // business offering.
    const translated = new Error(
      'This dog has paid or scored entries. Scratch or refund them before deleting.'
    );
    expect(isBlockedByPaidOrScoredEntries(translated)).toBe(false);
  });

  it('does not treat a permission denial as a blocked delete', () => {
    expect(isBlockedByPaidOrScoredEntries({ code: '42501', message: 'Permission denied' })).toBe(
      false
    );
  });

  it('does not treat a network failure as a blocked delete', () => {
    expect(isBlockedByPaidOrScoredEntries(new Error('Failed to fetch'))).toBe(false);
  });

  it('is safe on null, undefined and non-objects', () => {
    expect(isBlockedByPaidOrScoredEntries(null)).toBe(false);
    expect(isBlockedByPaidOrScoredEntries(undefined)).toBe(false);
    expect(isBlockedByPaidOrScoredEntries('MK002')).toBe(false);
  });
});

describe('partitionBlockedDogs', () => {
  const dogA = { id: 'a' };
  const dogB = { id: 'b' };
  const dogC = { id: 'c' };

  it('splits blocked dogs from genuinely failed ones', () => {
    const { blocked, otherFailures } = partitionBlockedDogs([
      { item: dogA, error: { code: 'MK002', message: 'paid or scored' } },
      { item: dogB, error: { message: 'paid or scored entries', code: '42501' } },
      { item: dogC, error: { code: 'MK002', message: 'paid or scored' } },
    ]);

    expect(blocked).toEqual([dogA, dogC]);
    expect(otherFailures).toHaveLength(1);
    expect(otherFailures[0]?.item).toBe(dogB);
  });

  it('returns empty arrays for an empty failure list', () => {
    const { blocked, otherFailures } = partitionBlockedDogs([]);
    expect(blocked).toEqual([]);
    expect(otherFailures).toEqual([]);
  });

  it('keeps every failure when none are MK002', () => {
    const { blocked, otherFailures } = partitionBlockedDogs([
      { item: dogA, error: new Error('Failed to fetch') },
    ]);
    expect(blocked).toEqual([]);
    expect(otherFailures).toHaveLength(1);
  });
});
