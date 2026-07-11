/**
 * Unit tests for the Phase 1c ringside grant model.
 *
 * Pins the two load-bearing guarantees: the store sets/clears the grant, and
 * the precedence resolver is show-scoped — a passcode for show X must never
 * elevate the account's view of show Y (Locked Decision #8).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  useRingsideGrantStore,
  selectGrantRoleForShow,
  deriveRingsideRoleFromClaim,
  type RingsideGrant,
} from './ringsideGrantStore';

const judgeGrantForX: RingsideGrant = { showId: 'show-X', role: 'judge', source: 'passcode' };

describe('useRingsideGrantStore', () => {
  beforeEach(() => {
    useRingsideGrantStore.getState().clearGrant();
  });

  it('starts with no active grant', () => {
    expect(useRingsideGrantStore.getState().activeGrant).toBeNull();
  });

  it('setGrant attaches the grant; clearGrant removes it', () => {
    useRingsideGrantStore.getState().setGrant(judgeGrantForX);
    expect(useRingsideGrantStore.getState().activeGrant).toEqual(judgeGrantForX);

    useRingsideGrantStore.getState().clearGrant();
    expect(useRingsideGrantStore.getState().activeGrant).toBeNull();
  });

  it('setGrant replaces a prior grant (single active grant, no merge)', () => {
    useRingsideGrantStore.getState().setGrant(judgeGrantForX);
    const adminGrantForY: RingsideGrant = { showId: 'show-Y', role: 'admin', source: 'account' };
    useRingsideGrantStore.getState().setGrant(adminGrantForY);
    expect(useRingsideGrantStore.getState().activeGrant).toEqual(adminGrantForY);
  });

  it('resolves a grant with source "account"', () => {
    const accountGrant: RingsideGrant = { showId: 'show-X', role: 'admin', source: 'account' };
    expect(selectGrantRoleForShow(accountGrant, 'show-X')).toBe('admin');
  });
});

describe('selectGrantRoleForShow', () => {
  it('returns the grant role when scoped to the requested show', () => {
    expect(selectGrantRoleForShow(judgeGrantForX, 'show-X')).toBe('judge');
  });

  it('returns null for a different show (no cross-show elevation)', () => {
    expect(selectGrantRoleForShow(judgeGrantForX, 'show-Y')).toBeNull();
  });

  it('returns null when there is no grant', () => {
    expect(selectGrantRoleForShow(null, 'show-X')).toBeNull();
  });

  it('returns null when the show id is missing', () => {
    expect(selectGrantRoleForShow(judgeGrantForX, undefined)).toBeNull();
  });
});

describe('deriveRingsideRoleFromClaim', () => {
  const judgeClaimUser = {
    is_anonymous: true,
    app_metadata: { kind: 'ringside_passcode', show_id: 'show-X', ringside_role: 'judge' },
  };

  it('returns the claim role when anonymous, marked, and scoped to the show', () => {
    expect(deriveRingsideRoleFromClaim(judgeClaimUser, 'show-X')).toBe('judge');
  });

  it('returns null for a different show (no cross-show elevation via a stale claim)', () => {
    expect(deriveRingsideRoleFromClaim(judgeClaimUser, 'show-Y')).toBeNull();
  });

  it('returns null when the session is not anonymous (a real account is never claim-derived)', () => {
    const accountUser = { is_anonymous: false, app_metadata: judgeClaimUser.app_metadata };
    expect(deriveRingsideRoleFromClaim(accountUser, 'show-X')).toBeNull();
  });

  it('returns null when app_metadata lacks the ringside_passcode marker (F1: unmarked generic keys are inert)', () => {
    const unmarkedUser = {
      is_anonymous: true,
      app_metadata: { show_id: 'show-X', ringside_role: 'judge' },
    };
    expect(deriveRingsideRoleFromClaim(unmarkedUser, 'show-X')).toBeNull();
  });

  it('returns null for an invalid ringside_role value', () => {
    const badRoleUser = {
      is_anonymous: true,
      app_metadata: { kind: 'ringside_passcode', show_id: 'show-X', ringside_role: 'not-a-role' },
    };
    expect(deriveRingsideRoleFromClaim(badRoleUser, 'show-X')).toBeNull();
  });

  it('returns null when there is no user or no showId', () => {
    expect(deriveRingsideRoleFromClaim(null, 'show-X')).toBeNull();
    expect(deriveRingsideRoleFromClaim(judgeClaimUser, undefined)).toBeNull();
  });
});
