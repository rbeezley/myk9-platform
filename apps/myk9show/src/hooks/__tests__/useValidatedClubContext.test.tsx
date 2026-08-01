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

describe('selectValidatedClubContext — club admin', () => {
  it('returns one live club when the other scope is stale', () => {
    expect(
      selectValidatedClubContext({
        roles: [UserRole.CLUB_ADMIN],
        scopes: [scope('missing-club'), scope('club-a')],
        clubs,
        readiness: 'fresh',
      })
    ).toEqual({ status: 'ready', clubId: 'club-a', clubName: 'Alpha Club', clubs: [clubs[0]] });
  });

  it('deduplicates repeated scopes for one live club', () => {
    expect(
      selectValidatedClubContext({
        roles: [UserRole.CLUB_ADMIN],
        scopes: [scope('club-a'), scope('club-a')],
        clubs,
        readiness: 'fresh',
      })
    ).toEqual({ status: 'ready', clubId: 'club-a', clubName: 'Alpha Club', clubs: [clubs[0]] });
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

  it('offers a CHOICE for two live scopes rather than an error (MYK9-138)', () => {
    // Previously 'ambiguous', surfaced as "ask an administrator to correct the
    // club access". Administering two clubs is ordinary, not misconfiguration.
    expect(
      selectValidatedClubContext({
        roles: [UserRole.CLUB_ADMIN],
        scopes: [scope('club-a'), scope('club-b')],
        clubs,
        readiness: 'fresh',
      })
    ).toEqual({ status: 'choose', clubs });
  });

  it('resolves the choice once a club is selected', () => {
    expect(
      selectValidatedClubContext({
        roles: [UserRole.CLUB_ADMIN],
        scopes: [scope('club-a'), scope('club-b')],
        clubs,
        readiness: 'fresh',
        selectedClubId: 'club-b',
      })
    ).toEqual({ status: 'ready', clubId: 'club-b', clubName: 'Beta Club', clubs });
  });

  it('ignores a selection the caller is not scoped to', () => {
    expect(
      selectValidatedClubContext({
        roles: [UserRole.CLUB_ADMIN],
        scopes: [scope('club-a'), scope('club-b')],
        clubs,
        readiness: 'fresh',
        selectedClubId: 'club-never-scoped',
      })
    ).toEqual({ status: 'choose', clubs });
  });
});

describe('selectValidatedClubContext — site admin (MYK9-138)', () => {
  // The defect: a site admin administers every club by definition, but the
  // selector only ever consulted CLUB_ADMIN scopes. The platform owner could
  // not open any club-scoped page on their own platform.
  it('admits a site admin holding NO club_admin scope at all', () => {
    expect(
      selectValidatedClubContext({
        roles: [UserRole.SITE_ADMIN],
        scopes: [],
        clubs: [clubs[0]],
        readiness: 'fresh',
      })
    ).toEqual({ status: 'ready', clubId: 'club-a', clubName: 'Alpha Club', clubs: [clubs[0]] });
  });

  it('offers every live club to a site admin', () => {
    expect(
      selectValidatedClubContext({
        roles: [UserRole.SITE_ADMIN],
        scopes: [],
        clubs,
        readiness: 'fresh',
      })
    ).toEqual({ status: 'choose', clubs });
  });

  it('lets a site admin select any club, not only scoped ones', () => {
    expect(
      selectValidatedClubContext({
        roles: [UserRole.SITE_ADMIN],
        scopes: [],
        clubs,
        readiness: 'fresh',
        selectedClubId: 'club-b',
      })
    ).toEqual({ status: 'ready', clubId: 'club-b', clubName: 'Beta Club', clubs });
  });

  it('is not narrowed by its own club_admin scopes', () => {
    // An account holding both roles must still see every club — otherwise
    // granting a site admin one club_admin row would REDUCE their reach.
    expect(
      selectValidatedClubContext({
        roles: [UserRole.SITE_ADMIN, UserRole.CLUB_ADMIN],
        scopes: [scope('club-a')],
        clubs,
        readiness: 'fresh',
      })
    ).toEqual({ status: 'choose', clubs });
  });

  it('reports missing with no scopes when the platform has no clubs', () => {
    expect(
      selectValidatedClubContext({
        roles: [UserRole.SITE_ADMIN],
        scopes: [],
        clubs: [],
        readiness: 'fresh',
      })
    ).toEqual({ status: 'missing', scopeIds: [] });
  });
});

describe('selectValidatedClubContext — readiness and eligibility', () => {
  it('is not-applicable for a caller with neither admin role', () => {
    expect(
      selectValidatedClubContext({
        roles: [UserRole.EXHIBITOR],
        scopes: [],
        clubs,
        readiness: 'fresh',
      })
    ).toEqual({ status: 'not-applicable' });
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

  it('gates a site admin on freshness too', () => {
    expect(
      selectValidatedClubContext({
        roles: [UserRole.SITE_ADMIN],
        scopes: [],
        clubs,
        readiness: 'offline',
      })
    ).toEqual({ status: 'unavailable' });
  });
});

describe('selectValidatedClubContext — switching and session scope (MYK9-138)', () => {
  const twoClubAdmin = {
    roles: [UserRole.CLUB_ADMIN],
    scopes: [scope('club-a'), scope('club-b')],
    clubs,
    readiness: 'fresh' as const,
  };

  it('carries every candidate on ready so the page can offer a switcher', () => {
    // Without this the selection is a ONE-WAY DOOR: the gate never renders
    // again and the operator must reload the app to manage another club.
    const result = selectValidatedClubContext({ ...twoClubAdmin, selectedClubId: 'club-a' });
    expect(result).toMatchObject({ status: 'ready', clubId: 'club-a' });
    expect(result.status === 'ready' && result.clubs).toEqual(clubs);
  });

  it('carries the single candidate on ready too, so the switcher can hide itself', () => {
    const result = selectValidatedClubContext({
      roles: [UserRole.CLUB_ADMIN],
      scopes: [scope('club-a')],
      clubs,
      readiness: 'fresh',
    });
    expect(result.status === 'ready' && result.clubs).toHaveLength(1);
  });

  it('ignores a selection made by a DIFFERENT user', () => {
    // The club store is a singleton and is not reset on sign-out, so without
    // this the next operator silently inherits the previous one's club.
    expect(
      selectValidatedClubContext({
        ...twoClubAdmin,
        selectedClubId: 'club-b',
        selectedClubUserId: 'user-1',
        currentUserId: 'user-2',
      })
    ).toEqual({ status: 'choose', clubs });
  });

  it('honours a selection made by the same user', () => {
    expect(
      selectValidatedClubContext({
        ...twoClubAdmin,
        selectedClubId: 'club-b',
        selectedClubUserId: 'user-1',
        currentUserId: 'user-1',
      })
    ).toMatchObject({ status: 'ready', clubId: 'club-b' });
  });

  it('honours an unattributed selection, so the store default is not a blocker', () => {
    expect(
      selectValidatedClubContext({ ...twoClubAdmin, selectedClubId: 'club-b' })
    ).toMatchObject({ status: 'ready', clubId: 'club-b' });
  });
});
