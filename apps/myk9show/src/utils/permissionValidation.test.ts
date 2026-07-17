import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  canViewShow,
  canCreateShow,
  canEditShow,
  canDeleteShow,
  canManageEntries,
  canRegisterForShow,
  canViewJudgeAssignments,
  canEnterResults,
  getAccessibleTabs,
  canAccessTab,
  checkPermissionWithAudit,
  checkRoleWithAudit,
  filterShowsByPermissions,
} from './permissionValidation';
import { PERMISSIONS, UserRole, type UserWithRoles } from '@/types/auth-types';
import type { Show } from '@/types/show-types';
import type { ShowWithRelationship } from '@/types/unified-shows-types';

function buildUser(roles: UserRole[], permissions: string[] = [], id = 'user-1'): UserWithRoles {
  return {
    id,
    roles,
    permissions,
    scopes: [],
  } as unknown as UserWithRoles;
}

const SITE_ADMIN = buildUser([UserRole.SITE_ADMIN], Object.values(PERMISSIONS));
const SECRETARY = buildUser(
  [UserRole.SECRETARY],
  [PERMISSIONS.SHOW_UPDATE, PERMISSIONS.SHOW_DELETE, PERMISSIONS.SHOW_MANAGE_ENTRIES]
);
const SECRETARY_NO_UPDATE_PERM = buildUser([UserRole.SECRETARY], []);
const EXHIBITOR = buildUser([UserRole.EXHIBITOR], []);
const JUDGE = buildUser([UserRole.JUDGE], [], 'judge-1');
const CLUB_ADMIN = buildUser([UserRole.CLUB_ADMIN], []);

function buildShow(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    name: 'Test Show',
    organization: 'AKC',
    startDate: '2026-08-01',
    endDate: '2026-08-01',
    location: 'Test Location',
    status: 'Upcoming',
    events: [],
    source: 'myK9Show',
    entryOpenDate: '2026-01-01',
    entryCloseDate: '2026-07-01',
    preEntryFee: '10',
    clubId: 'club-1',
    clubName: 'Test Club',
    clubAddress: '',
    clubEmail: '',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    assignedJudges: [],
    stats: [],
    trials: [],
    ...overrides,
  } as unknown as Show;
}

function buildShowWithRelationship(
  overrides: Partial<ShowWithRelationship> = {}
): ShowWithRelationship {
  return {
    ...buildShow(overrides),
    relationship: [],
    userCanManage: false,
    userIsJudging: false,
    userHasEntries: false,
    ...overrides,
  } as unknown as ShowWithRelationship;
}

describe('canViewShow', () => {
  it.each<[string, UserWithRoles | null, string, boolean]>([
    ['guest, upcoming show -> true', null, 'upcoming', true],
    ['guest, completed show -> true', null, 'completed', true],
    ['guest, published show -> true', null, 'published', true],
    ['guest, in_progress show -> true', null, 'in_progress', true],
    ['guest, draft show -> false', null, 'draft', false],
    ['guest, cancelled show -> false', null, 'cancelled', false],
    ['guest, status is case-insensitive (Upcoming) -> true', null, 'Upcoming', true],
    ['authenticated exhibitor, draft show -> true (all shows visible)', EXHIBITOR, 'draft', true],
  ])('%s', (_label, user, status, expected) => {
    expect(canViewShow(user, buildShow({ status }))).toBe(expected);
  });
});

describe('canCreateShow', () => {
  it.each<[string, UserWithRoles | null, boolean]>([
    ['no user -> false', null, false],
    ['exhibitor without SHOW_CREATE permission or role -> false', EXHIBITOR, false],
    [
      'secretary role (regardless of permission list) -> true',
      buildUser([UserRole.SECRETARY]),
      true,
    ],
    ['club_admin role -> true', buildUser([UserRole.CLUB_ADMIN]), true],
    ['site_admin role -> true', buildUser([UserRole.SITE_ADMIN]), true],
    [
      'judge without SHOW_CREATE permission or qualifying role -> false',
      buildUser([UserRole.JUDGE]),
      false,
    ],
    [
      'exhibitor WITH explicit SHOW_CREATE permission -> true',
      buildUser([UserRole.EXHIBITOR], [PERMISSIONS.SHOW_CREATE]),
      true,
    ],
  ])('%s', (_label, user, expected) => {
    expect(canCreateShow(user)).toBe(expected);
  });
});

describe('canEditShow', () => {
  it('no user -> false', () => {
    expect(canEditShow(null, buildShowWithRelationship())).toBe(false);
  });

  it('site_admin -> true even without SHOW_UPDATE permission or management relationship', () => {
    const user = buildUser([UserRole.SITE_ADMIN], []);
    expect(canEditShow(user, buildShowWithRelationship({ userCanManage: false }))).toBe(true);
  });

  it('non-admin without SHOW_UPDATE permission -> false even if userCanManage is true', () => {
    expect(
      canEditShow(SECRETARY_NO_UPDATE_PERM, buildShowWithRelationship({ userCanManage: true }))
    ).toBe(false);
  });

  it('non-admin with SHOW_UPDATE permission but no management relationship -> false', () => {
    expect(canEditShow(SECRETARY, buildShowWithRelationship({ userCanManage: false }))).toBe(false);
  });

  it('non-admin with SHOW_UPDATE permission AND management relationship -> true', () => {
    expect(canEditShow(SECRETARY, buildShowWithRelationship({ userCanManage: true }))).toBe(true);
  });
});

describe('canDeleteShow', () => {
  it('no user -> false', () => {
    expect(canDeleteShow(null, buildShowWithRelationship())).toBe(false);
  });

  it('site_admin -> true regardless of permission or relationship', () => {
    expect(canDeleteShow(buildUser([UserRole.SITE_ADMIN]), buildShowWithRelationship())).toBe(true);
  });

  it('non-admin without SHOW_DELETE permission -> false', () => {
    expect(
      canDeleteShow(SECRETARY_NO_UPDATE_PERM, buildShowWithRelationship({ userCanManage: true }))
    ).toBe(false);
  });

  it('non-admin with SHOW_DELETE permission but not managing the show -> false', () => {
    expect(canDeleteShow(SECRETARY, buildShowWithRelationship({ userCanManage: false }))).toBe(
      false
    );
  });

  it('non-admin with SHOW_DELETE permission and managing the show -> true', () => {
    expect(canDeleteShow(SECRETARY, buildShowWithRelationship({ userCanManage: true }))).toBe(true);
  });
});

describe('canManageEntries', () => {
  it('no user -> false', () => {
    expect(canManageEntries(null, buildShowWithRelationship())).toBe(false);
  });

  it('site_admin -> true regardless of relationship', () => {
    expect(canManageEntries(buildUser([UserRole.SITE_ADMIN]), buildShowWithRelationship())).toBe(
      true
    );
  });

  it('non-admin without SHOW_MANAGE_ENTRIES permission -> false', () => {
    expect(
      canManageEntries(SECRETARY_NO_UPDATE_PERM, buildShowWithRelationship({ userCanManage: true }))
    ).toBe(false);
  });

  it('non-admin with permission but not managing the show -> false', () => {
    expect(canManageEntries(SECRETARY, buildShowWithRelationship({ userCanManage: false }))).toBe(
      false
    );
  });

  it('non-admin with permission and managing relationship -> true', () => {
    expect(canManageEntries(SECRETARY, buildShowWithRelationship({ userCanManage: true }))).toBe(
      true
    );
  });
});

describe('canRegisterForShow', () => {
  const fixedNow = new Date('2026-06-15T12:00:00');

  afterEach(() => {
    vi.useRealTimers();
  });

  function withFixedNow<T>(fn: () => T): T {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    try {
      return fn();
    } finally {
      vi.useRealTimers();
    }
  }

  it.each<[string, Partial<Show>, boolean]>([
    [
      'entries not yet open -> false',
      {
        entryOpenDate: '2026-07-01',
        entryCloseDate: '2026-08-01',
        startDate: '2026-08-05',
        status: 'Upcoming',
      },
      false,
    ],
    [
      'entries open, show upcoming, before close -> true',
      {
        entryOpenDate: '2026-01-01',
        entryCloseDate: '2026-08-01',
        startDate: '2026-08-05',
        status: 'Upcoming',
      },
      true,
    ],
    [
      'entry close date has passed -> false',
      {
        entryOpenDate: '2026-01-01',
        entryCloseDate: '2026-06-01',
        startDate: '2026-08-05',
        status: 'Upcoming',
      },
      false,
    ],
    [
      'show has already started -> false',
      {
        entryOpenDate: '2026-01-01',
        entryCloseDate: '2026-08-01',
        startDate: '2026-06-01',
        status: 'Upcoming',
      },
      false,
    ],
    [
      'show is not in Upcoming status -> false',
      {
        entryOpenDate: '2026-01-01',
        entryCloseDate: '2026-08-01',
        startDate: '2026-08-05',
        status: 'Completed',
      },
      false,
    ],
    [
      'entry close date is today (inclusive through end of day) -> true',
      {
        entryOpenDate: '2026-01-01',
        entryCloseDate: '2026-06-15',
        startDate: '2026-08-05',
        status: 'Upcoming',
      },
      true,
    ],
  ])('%s', (_label, overrides, expected) => {
    withFixedNow(() => {
      expect(canRegisterForShow(EXHIBITOR, buildShow(overrides))).toBe(expected);
    });
  });

  it('no user -> false', () => {
    withFixedNow(() => {
      expect(
        canRegisterForShow(
          null,
          buildShow({
            entryOpenDate: '2026-01-01',
            entryCloseDate: '2026-08-01',
            startDate: '2026-08-05',
            status: 'Upcoming',
          })
        )
      ).toBe(false);
    });
  });
});

describe('canViewJudgeAssignments', () => {
  it('no user -> false', () => {
    expect(canViewJudgeAssignments(null, buildShowWithRelationship())).toBe(false);
  });

  it('site_admin -> true', () => {
    expect(
      canViewJudgeAssignments(buildUser([UserRole.SITE_ADMIN]), buildShowWithRelationship())
    ).toBe(true);
  });

  it('secretary -> true', () => {
    expect(
      canViewJudgeAssignments(buildUser([UserRole.SECRETARY]), buildShowWithRelationship())
    ).toBe(true);
  });

  it('judge assigned to this show -> true', () => {
    const show = buildShowWithRelationship({
      assignedJudges: [{ judgeId: 'judge-1' }] as unknown as Show['assignedJudges'],
    });
    expect(canViewJudgeAssignments(JUDGE, show)).toBe(true);
  });

  it('judge NOT assigned to this show -> false', () => {
    const show = buildShowWithRelationship({
      assignedJudges: [{ judgeId: 'someone-else' }] as unknown as Show['assignedJudges'],
    });
    expect(canViewJudgeAssignments(JUDGE, show)).toBe(false);
  });

  it('judge role with no assignedJudges array -> false', () => {
    const show = buildShowWithRelationship({ assignedJudges: undefined });
    expect(canViewJudgeAssignments(JUDGE, show)).toBe(false);
  });

  it('show manager (userCanManage + SHOW_READ) with no special role -> true', () => {
    const manager = buildUser([UserRole.CLUB_ADMIN], [PERMISSIONS.SHOW_READ]);
    const show = buildShowWithRelationship({ userCanManage: true });
    expect(canViewJudgeAssignments(manager, show)).toBe(true);
  });

  it('non-manager without SHOW_READ -> false', () => {
    expect(
      canViewJudgeAssignments(CLUB_ADMIN, buildShowWithRelationship({ userCanManage: false }))
    ).toBe(false);
  });
});

describe('canEnterResults', () => {
  it('no user -> false', () => {
    expect(canEnterResults(null, buildShowWithRelationship())).toBe(false);
  });

  it('assigned judge -> true', () => {
    const show = buildShowWithRelationship({
      assignedJudges: [{ judgeId: 'judge-1' }] as unknown as Show['assignedJudges'],
    });
    expect(canEnterResults(JUDGE, show)).toBe(true);
  });

  it('judge not assigned to this show -> false', () => {
    const show = buildShowWithRelationship({
      assignedJudges: [{ judgeId: 'someone-else' }] as unknown as Show['assignedJudges'],
    });
    expect(canEnterResults(JUDGE, show)).toBe(false);
  });

  it('secretary managing the show -> true', () => {
    expect(canEnterResults(SECRETARY, buildShowWithRelationship({ userCanManage: true }))).toBe(
      true
    );
  });

  it('secretary NOT managing the show -> false', () => {
    expect(canEnterResults(SECRETARY, buildShowWithRelationship({ userCanManage: false }))).toBe(
      false
    );
  });

  it('site_admin -> true', () => {
    expect(canEnterResults(SITE_ADMIN, buildShowWithRelationship())).toBe(true);
  });

  it('exhibitor -> false', () => {
    expect(canEnterResults(EXHIBITOR, buildShowWithRelationship())).toBe(false);
  });
});

describe('getAccessibleTabs / canAccessTab', () => {
  it.each<[string, UserWithRoles | null, string[]]>([
    ['guest -> only all/past', null, ['all', 'past']],
    ['exhibitor -> all/past/entries', EXHIBITOR, ['all', 'past', 'entries']],
    [
      'secretary -> all/past/managing',
      buildUser([UserRole.SECRETARY]),
      ['all', 'past', 'managing'],
    ],
    [
      'club_admin -> all/past/managing',
      buildUser([UserRole.CLUB_ADMIN]),
      ['all', 'past', 'managing'],
    ],
    ['judge -> all/past/assignments', JUDGE, ['all', 'past', 'assignments']],
    [
      'user with exhibitor + secretary + judge roles gets every tab',
      buildUser([UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.JUDGE]),
      ['all', 'past', 'entries', 'managing', 'assignments'],
    ],
  ])('%s', (_label, user, expectedTabs) => {
    expect(getAccessibleTabs(user)).toEqual(expectedTabs);
  });

  it('canAccessTab delegates to getAccessibleTabs', () => {
    expect(canAccessTab(EXHIBITOR, 'entries')).toBe(true);
    expect(canAccessTab(EXHIBITOR, 'managing')).toBe(false);
    expect(canAccessTab(null, 'all')).toBe(true);
    expect(canAccessTab(null, 'managing')).toBe(false);
  });
});

describe('checkPermissionWithAudit', () => {
  it('no user -> false', () => {
    expect(checkPermissionWithAudit(PERMISSIONS.SHOW_CREATE, null, 'show', 'show-1')).toBe(false);
  });

  it('user missing the permission -> false', () => {
    expect(checkPermissionWithAudit(PERMISSIONS.SHOW_CREATE, EXHIBITOR, 'show', 'show-1')).toBe(
      false
    );
  });

  it('user with the permission -> true', () => {
    const user = buildUser([UserRole.SECRETARY], [PERMISSIONS.SHOW_CREATE]);
    expect(checkPermissionWithAudit(PERMISSIONS.SHOW_CREATE, user, 'show', 'show-1')).toBe(true);
  });
});

describe('checkRoleWithAudit', () => {
  it('no user -> false', () => {
    expect(checkRoleWithAudit(UserRole.SECRETARY, null, 'show', 'show-1')).toBe(false);
  });

  it('user without the role -> false', () => {
    expect(checkRoleWithAudit(UserRole.SECRETARY, EXHIBITOR, 'show', 'show-1')).toBe(false);
  });

  it('user with the role -> true', () => {
    expect(checkRoleWithAudit(UserRole.SECRETARY, SECRETARY, 'show', 'show-1')).toBe(true);
  });
});

describe('filterShowsByPermissions', () => {
  const shows: Show[] = [
    buildShow({ id: 'draft-1', status: 'draft' }),
    buildShow({ id: 'upcoming-1', status: 'upcoming' }),
    buildShow({ id: 'completed-1', status: 'completed' }),
  ];

  it('guest -> only public-status shows', () => {
    const result = filterShowsByPermissions(shows, null);
    expect(result.map(s => s.id)).toEqual(['upcoming-1', 'completed-1']);
  });

  it('site_admin -> all shows including drafts', () => {
    const result = filterShowsByPermissions(shows, SITE_ADMIN);
    expect(result.map(s => s.id)).toEqual(['draft-1', 'upcoming-1', 'completed-1']);
  });

  it('other authenticated user -> all shows returned unfiltered too', () => {
    const result = filterShowsByPermissions(shows, EXHIBITOR);
    expect(result.map(s => s.id)).toEqual(['draft-1', 'upcoming-1', 'completed-1']);
  });
});
