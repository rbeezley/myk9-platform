import { describe, expect, it } from 'vitest';
import { scopesHoldClubRole } from '../clubRoleLoaded';
import { ScopeType, UserRole } from '@/types/auth-types';

const scope = (scopeId: string, roleId: string, scopeType = ScopeType.CLUB) => ({
  scopeType,
  scopeId,
  roleId,
});

describe('scopesHoldClubRole (MYK9-2214)', () => {
  it('is true for a club admin or secretary scope on the club', () => {
    expect(scopesHoldClubRole([scope('club-9', UserRole.CLUB_ADMIN)], 'club-9')).toBe(true);
    expect(scopesHoldClubRole([scope('club-9', UserRole.SECRETARY)], 'club-9')).toBe(true);
  });

  it('is false for another club, another role, another scope type, or no scopes', () => {
    expect(scopesHoldClubRole([scope('club-1', UserRole.CLUB_ADMIN)], 'club-9')).toBe(false);
    expect(scopesHoldClubRole([scope('club-9', UserRole.EXHIBITOR)], 'club-9')).toBe(false);
    expect(
      scopesHoldClubRole([scope('club-9', UserRole.CLUB_ADMIN, ScopeType.SHOW)], 'club-9')
    ).toBe(false);
    expect(scopesHoldClubRole(undefined, 'club-9')).toBe(false);
  });
});
