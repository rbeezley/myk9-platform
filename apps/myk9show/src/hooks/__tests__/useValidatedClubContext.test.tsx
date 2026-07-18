import { describe, expect, it } from 'vitest';
import { ScopeType, UserRole } from '@/types/auth-types';
import { selectValidatedClubContext } from '../useValidatedClubContext';

const clubs = [
  { id: 'club-a', name: 'Alpha Club' },
  { id: 'club-b', name: 'Beta Club' },
];

const scope = (scopeId: string, roleId = UserRole.CLUB_ADMIN) => ({
  scopeId,
  roleId,
  scopeType: ScopeType.CLUB,
});

describe('selectValidatedClubContext', () => {
  it('returns one live club when the other scope is stale', () => {
    expect(
      selectValidatedClubContext({
        roles: [UserRole.CLUB_ADMIN],
        scopes: [scope('missing-club'), scope('club-a')],
        clubs,
        readiness: 'fresh',
      })
    ).toEqual({ status: 'ready', clubId: 'club-a', clubName: 'Alpha Club' });
  });

  it('deduplicates repeated scopes for one live club', () => {
    expect(
      selectValidatedClubContext({
        roles: [UserRole.CLUB_ADMIN],
        scopes: [scope('club-a'), scope('club-a')],
        clubs,
        readiness: 'fresh',
      })
    ).toEqual({ status: 'ready', clubId: 'club-a', clubName: 'Alpha Club' });
  });

  it('does not select the first club when no scope is live', () => {
    expect(
      selectValidatedClubContext({
        roles: [UserRole.CLUB_ADMIN],
        scopes: [scope('missing-club')],
        clubs,
        readiness: 'fresh',
      })
    ).toEqual({ status: 'missing', scopeIds: ['missing-club'] });
  });

  it('keeps multiple live scopes non-actionable', () => {
    expect(
      selectValidatedClubContext({
        roles: [UserRole.CLUB_ADMIN],
        scopes: [scope('club-a'), scope('club-b')],
        clubs,
        readiness: 'fresh',
      })
    ).toEqual({ status: 'ambiguous', scopeIds: ['club-a', 'club-b'] });
  });

  it('does not validate cached scopes before freshness settles', () => {
    expect(
      selectValidatedClubContext({
        roles: [UserRole.CLUB_ADMIN],
        scopes: [scope('club-a')],
        clubs,
        readiness: 'loading',
      })
    ).toEqual({ status: 'loading' });

    expect(
      selectValidatedClubContext({
        roles: [UserRole.CLUB_ADMIN],
        scopes: [scope('club-a')],
        clubs,
        readiness: 'offline',
      })
    ).toEqual({ status: 'unavailable' });
  });
});
