import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMessageSubscription } from '../useMessageSubscription';

const subscribeMock = vi.fn();
const unsubscribeMock = vi.fn();
const setCurrentUserIdMock = vi.fn();

vi.mock('@/store/messageStore', () => ({
  useMessageStore: (selector: (s: unknown) => unknown) =>
    selector({
      subscribe: subscribeMock,
      unsubscribe: unsubscribeMock,
      setCurrentUserId: setCurrentUserIdMock,
    }),
}));

let authState: Record<string, unknown> = {
  user: { id: 'auth-user-1' },
  userWithRoles: { id: 'person-1', roles: ['exhibitor'], scopes: [] },
  isSecretary: false,
  isAdmin: false,
  hasRole: () => false,
};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => authState,
}));

let activeShows = [{ showId: 'today-show' }];
vi.mock('@/hooks/queries/useShowDayData', () => ({
  useShowDayData: () => ({ activeShows }),
}));

let selectedShowId: string | null = null;
let shows: Array<{ id: string }> = [];
vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (s: unknown) => unknown) => selector({ selectedShowId, shows }),
}));

let storeEntries: Array<{ id: string; showId: string; dogId: string }> = [];
vi.mock('@/store/entryStore', () => ({
  useEntryStore: (selector: (s: unknown) => unknown) => selector({ entries: storeEntries }),
}));

let dogs: Array<{ id: string; ownerId: string }> = [];
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs }),
}));

beforeEach(() => {
  subscribeMock.mockReset();
  unsubscribeMock.mockReset();
  setCurrentUserIdMock.mockReset();
  authState = {
    user: { id: 'auth-user-1' },
    userWithRoles: { id: 'person-1', roles: ['exhibitor'], scopes: [] },
    isSecretary: false,
    isAdmin: false,
    hasRole: () => false,
  };
  activeShows = [{ showId: 'today-show' }];
  selectedShowId = null;
  shows = [];
  storeEntries = [];
  dogs = [];
});

describe('useMessageSubscription', () => {
  it('subscribes exhibitors to active show-day shows', () => {
    renderHook(() => useMessageSubscription());
    expect(subscribeMock).toHaveBeenCalledWith(['today-show']);
  });

  it('subscribes staff to managed shows', () => {
    authState = {
      user: { id: 'auth-user-1' },
      userWithRoles: { id: 'person-1', roles: ['secretary'], scopes: [] },
      isSecretary: true,
      isAdmin: false,
      hasRole: () => false,
    };
    shows = [{ id: 'managed-1' }, { id: 'managed-2' }];

    renderHook(() => useMessageSubscription());
    expect(subscribeMock).toHaveBeenCalledWith(['today-show', 'managed-1', 'managed-2']);
  });

  it('subscribes exhibitors to entered shows beyond active show-day shows', () => {
    activeShows = [];
    authState = {
      user: { id: 'auth-user-1' },
      userWithRoles: {
        id: 'person-1',
        databaseUserId: 'person-1',
        roles: ['exhibitor'],
        scopes: [],
      },
      isSecretary: false,
      isAdmin: false,
      hasRole: () => false,
    };
    dogs = [{ id: 'dog-1', ownerId: 'person-1' }];
    storeEntries = [
      { id: 'entry-1', showId: 'upcoming-show', dogId: 'dog-1' },
      { id: 'entry-2', showId: 'other-owner-show', dogId: 'dog-2' },
    ];

    renderHook(() => useMessageSubscription());
    expect(subscribeMock).toHaveBeenCalledWith(['upcoming-show']);
  });

  it('unions active, selected, and managed shows without duplicates', () => {
    authState = {
      user: { id: 'auth-user-1' },
      userWithRoles: { id: 'person-1', roles: ['secretary', 'exhibitor'], scopes: [] },
      isSecretary: true,
      isAdmin: false,
      hasRole: () => false,
    };
    activeShows = [{ showId: 'show-1' }];
    selectedShowId = 'show-2';
    shows = [{ id: 'show-1' }, { id: 'show-3' }];

    renderHook(() => useMessageSubscription());
    expect(subscribeMock).toHaveBeenCalledWith(['show-1', 'show-2', 'show-3']);
  });
});
