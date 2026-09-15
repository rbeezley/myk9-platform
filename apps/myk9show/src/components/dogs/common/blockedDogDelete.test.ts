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

  it('detects the refusal from the message when the code was dropped', () => {
    // translateDogDbError returns a plain Error and does NOT carry `code`
    // forward. Anything that routes the failure through it would otherwise
    // read as an ordinary error and lose the override affordance.
    const translated = new Error(
      'This dog has paid or scored entries. Scratch or refund them before deleting.'
    );
    expect(isBlockedByPaidOrScoredEntries(translated)).toBe(true);
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
      { item: dogB, error: { code: '42501', message: 'Permission denied' } },
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
