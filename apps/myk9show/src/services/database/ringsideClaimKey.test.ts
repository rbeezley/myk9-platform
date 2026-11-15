import { describe, expect, it } from 'vitest';
import { ringsideClaimKey } from './ringsideClaimKey';

describe('ringsideClaimKey (MYK9-2009)', () => {
  it('names the role and the judge of a per-judge code', () => {
    expect(
      ringsideClaimKey({
        kind: 'ringside_passcode',
        ringside_role: 'judge',
        ringside_person_id: 'p-1',
      })
    ).toBe('judge:p-1');
  });

  it('names a code with no judge by its role alone', () => {
    expect(ringsideClaimKey({ kind: 'ringside_passcode', ringside_role: 'admin' })).toBe('admin:');
  });

  it('is undefined for anything that is not a ringside passcode claim', () => {
    expect(ringsideClaimKey({ kind: 'other', ringside_role: 'judge' })).toBeUndefined();
    expect(ringsideClaimKey({ kind: 'ringside_passcode' })).toBeUndefined();
    expect(ringsideClaimKey(undefined)).toBeUndefined();
  });
});
