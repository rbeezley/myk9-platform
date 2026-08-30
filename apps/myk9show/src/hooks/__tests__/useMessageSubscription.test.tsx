import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMessageSubscription } from '../useMessageSubscription';

const subscribeMock = vi.fn();
const unsubscribeMock = vi.fn();
const setCurrentUserIdMock = vi.fn();

vi.mock('@/store/messageStore', () => ({
  useMessageStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({
        subscribe: subscribeMock,
        unsubscribe: unsubscribeMock,
        setCurrentUserId: setCurrentUserIdMock,
      }),
    { getState: () => ({ error: null }) }
  ),
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
let shows: Array<{ id: string; clubId?: string }> = [];
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
  it('does not refetch threads when replicated rows change but show membership does not', () => {
    const { rerender, unmount } = renderHook(() => useMessageSubscription());
    for (let update = 0; update < 5; update += 1) {
      activeShows = [{ showId: 'today-show' }];
      rerender();
    }

    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(unsubscribeMock).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('does not refetch threads when the same authenticated user is refreshed', () => {
    const { rerender } = renderHook(() => useMessageSubscription());
    for (let update = 0; update < 5; update += 1) {
      authState = {
        ...authState,
        userWithRoles: { id: 'person-1', roles: ['exhibitor'], scopes: [] },
      };
      rerender();
    }

    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(unsubscribeMock).not.toHaveBeenCalled();
  });

  it('does not restart subscriptions for reordered or duplicated show IDs', () => {
    activeShows = [{ showId: 'show-b' }, { showId: 'show-a' }];
    const { rerender } = renderHook(() => useMessageSubscription());
    activeShows = [{ showId: 'show-a' }, { showId: 'show-b' }, { showId: 'show-a' }];
    rerender();

    expect(subscribeMock).toHaveBeenCalledExactlyOnceWith(['show-a', 'show-b']);
    expect(unsubscribeMock).not.toHaveBeenCalled();
  });

  it('releases the old membership and subscribes when a show is added or removed', () => {
    const { rerender } = renderHook(() => useMessageSubscription());
    activeShows = [{ showId: 'today-show' }, { showId: 'new-show' }];
    rerender();
    expect(subscribeMock).toHaveBeenLastCalledWith(['new-show', 'today-show']);
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);

    activeShows = [];
    rerender();
    expect(subscribeMock).toHaveBeenLastCalledWith([]);
    expect(unsubscribeMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    { id: 'other-user' },
    { roles: ['secretary'] },
    { permissions: ['show:read'] },
    { scopes: [{ roleId: 'secretary', scopeType: 'club', scopeId: 'club-2' }] },
    { databaseUserId: 'person-2' },
  ])('refreshes subscriptions when authorization data changes: %j', change => {
    const { rerender } = renderHook(() => useMessageSubscription());
    authState = {
      ...authState,
      userWithRoles: { id: 'person-1', roles: ['exhibitor'], scopes: [], ...change },
    };
    rerender();

    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes on logout and starts again after login', () => {
    const signedIn = authState;
    const { rerender } = renderHook(() => useMessageSubscription());
    authState = { ...authState, user: null, userWithRoles: null };
    rerender();
    expect(unsubscribeMock).toHaveBeenCalled();
    expect(subscribeMock).toHaveBeenCalledTimes(1);

    authState = signedIn;
    rerender();
    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(setCurrentUserIdMock).toHaveBeenLastCalledWith('auth-user-1');
  });

  it('subscribes exhibitors to active show-day shows', () => {
    renderHook(() => useMessageSubscription());
    expect(subscribeMock).toHaveBeenCalledWith(['today-show']);
  });

  it('subscribes staff to shows of clubs they hold a role for', () => {
    // F24: "managed" used to mean every show in the store, gated on the GLOBAL
    // secretary role — so a club secretary subscribed to other clubs' shows. It now
    // mirrors `threads_select`, which asks `is_trial_secretary(s.club_id)`.
    authState = {
      user: { id: 'auth-user-1' },
      userWithRoles: {
        id: 'person-1',
        roles: ['secretary'],
        scopes: [{ scopeType: 'club', scopeId: 'club-1', roleId: 'secretary' }],
      },
      isSecretary: true,
      isAdmin: false,
      hasRole: (role: string) => role === 'secretary',
    };
    shows = [
      { id: 'managed-1', clubId: 'club-1' },
      { id: 'managed-2', clubId: 'club-1' },
    ];

    renderHook(() => useMessageSubscription());
    expect(subscribeMock).toHaveBeenCalledWith(['managed-1', 'managed-2', 'today-show']);
  });

  it('does not subscribe staff to another club’s show', () => {
    authState = {
      user: { id: 'auth-user-1' },
      userWithRoles: {
        id: 'person-1',
        roles: ['secretary'],
        scopes: [{ scopeType: 'club', scopeId: 'club-1', roleId: 'secretary' }],
      },
      isSecretary: true,
      isAdmin: false,
      hasRole: (role: string) => role === 'secretary',
    };
    shows = [
      { id: 'managed-1', clubId: 'club-1' },
      { id: 'rival-1', clubId: 'club-9' },
    ];

    renderHook(() => useMessageSubscription());
    const ids = subscribeMock.mock.calls[0]?.[0] as string[];
    expect(ids).toContain('managed-1');
    expect(ids).not.toContain('rival-1');
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
      userWithRoles: {
        id: 'person-1',
        roles: ['secretary', 'exhibitor'],
        scopes: [{ scopeType: 'club', scopeId: 'club-1', roleId: 'secretary' }],
      },
      isSecretary: true,
      isAdmin: false,
      hasRole: (role: string) => role === 'secretary',
    };
    activeShows = [{ showId: 'show-1' }];
    selectedShowId = 'show-2';
    shows = [
      { id: 'show-1', clubId: 'club-1' },
      { id: 'show-3', clubId: 'club-1' },
    ];

    renderHook(() => useMessageSubscription());
    expect(subscribeMock).toHaveBeenCalledWith(['show-1', 'show-2', 'show-3']);
  });
});
