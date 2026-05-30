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
