import { describe, expect, it } from 'vitest';
import {
  canClaimConfirmedEmpty,
  canRenderKnownRows,
  deriveAccountEntryReadState,
} from './accountEntryReadState';

describe('deriveAccountEntryReadState', () => {
  it.each([
    ['unresolved without cache', null, 'unresolved', false, false, undefined, 'identity-unresolved'],
    ['confirmed missing', null, 'missing', false, false, undefined, 'identity-missing'],
    ['cached identity reading', 'person-1', 'unresolved', true, false, undefined, 'read-pending'],
    ['cached confirmed read', 'person-1', 'unresolved', false, false, 'confirmed', 'confirmed'],
    [
      'cached replica fallback',
      'person-1',
      'unresolved',
      false,
      false,
      'replica-after-error',
      'unconfirmed',
    ],
    ['read failure', 'person-1', 'resolved', false, true, undefined, 'error'],
  ])(
    '%s',
    (_name, personId, personIdentityState, isPending, isError, source, expected) => {
      expect(
        deriveAccountEntryReadState({
          hasUser: true,
          personId,
          personIdentityState,
          isPending,
          isError,
          source,
        })
      ).toBe(expected);
    }
  );

  it('does not claim an unconfirmed empty read, but keeps known rows renderable', () => {
    expect(canRenderKnownRows('unconfirmed', 2)).toBe(true);
    expect(canClaimConfirmedEmpty('unconfirmed')).toBe(false);
  });
});
