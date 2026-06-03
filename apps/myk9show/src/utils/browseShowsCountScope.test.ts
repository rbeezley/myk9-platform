import { describe, it, expect } from 'vitest';
import { UserRole } from '@/types/auth-types';
import type { UserWithRoles } from '@/types/auth-types';
import type { Show } from '@/types/show-types';
import type { SyncableShowEntry } from '@/store/entry-store-types';
import { getUserEntries } from './show-relationships';
import { getUserShowContext, getTabsForUser } from './unified-shows-config';
import { getBrowseShowsCountUserId, getBrowseShowsTabCount } from './browseShowsUtils';

function makeUser(overrides: Partial<UserWithRoles> = {}): UserWithRoles {
  return {
    id: 'auth-user',
    databaseUserId: 'person-1',
    email: 'exhibitor@example.com',
    roles: [UserRole.EXHIBITOR],
    permissions: [],
    scopes: [],
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as UserWithRoles;
}

function makeShow(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    name: 'Test Show',
    organization: 'AKC',
    startDate: '2026-10-01',
    endDate: '2026-10-02',
    location: 'Test City, CA',
    status: 'Upcoming',
    events: [],
    source: 'myK9Show',
    entryOpenDate: '2026-08-01',
    entryCloseDate: '2026-09-01',
    preEntryFee: '25',
    clubId: 'club-1',
    clubName: 'Test Club',
    clubAddress: '123 Main St',
    clubEmail: 'club@example.com',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    assignedJudges: [],
    stats: [],
    trials: [],
    ...overrides,
  };
}

function makeEntry(overrides: Partial<SyncableShowEntry> = {}): SyncableShowEntry {
  return {
    id: 'entry-1',
    showId: 'show-1',
    classId: 'class-1',
    dogId: 'dog-1',
    status: 'accepted',
    registrationData: {
      handler: 'Current Owner',
      handlerId: 'person-1',
      submittedAt: '2026-08-15T00:00:00Z',
      entryFee: 2500,
      paymentStatus: 'paid',
    },
    statusHistory: [],
    createdAt: '2026-08-15T00:00:00Z',
    updatedAt: '2026-08-15T00:00:00Z',
    _version: 1,
    _lastModified: new Date('2026-08-15T00:00:00Z'),
    _lastModifiedBy: 'person-1',
    _syncStatus: 'synced',
    ...overrides,
  };
}

describe('browse show count scope', () => {
  it('uses databaseUserId for My Entries relationships instead of the auth id', () => {
    const user = makeUser();
    const show = makeShow();
    const entry = makeEntry();

    const context = getUserShowContext(user, [show], [entry]);

    expect(context?.userId).toBe('person-1');
    expect(context?.entries).toEqual(['show-1']);
  });

  it('passes the database user id into tab count derivation', () => {
    const user = makeUser();

    expect(getBrowseShowsCountUserId(user)).toBe('person-1');
  });

  it('uses the selected tab display scope for the selected tab badge count', () => {
    const config = getTabsForUser(makeUser());
    const allTab = config.tabs.find(tab => tab.id === 'all');
    const shows = Array.from({ length: 9 }, (_, index) => makeShow({ id: `show-${index + 1}` }));

    const count = getBrowseShowsTabCount({
      tab: allTab,
      selectedTab: 'all',
      selectedTabCount: 5,
      shows,
      entries: [],
      userId: 'person-1',
    });

    expect(count).toBe(5);
  });

  it('does not infer ownership from a dog id containing the user id', () => {
    const show = makeShow();
    const entry = makeEntry({
      registrationData: {
        handler: 'Someone Else',
        submittedAt: '2026-08-15T00:00:00Z',
        entryFee: 2500,
        paymentStatus: 'paid',
      },
      dogId: 'dog-auth-user-not-owned',
    });

    expect(getUserEntries('auth-user', [show], [entry])).toEqual([]);
  });
});
