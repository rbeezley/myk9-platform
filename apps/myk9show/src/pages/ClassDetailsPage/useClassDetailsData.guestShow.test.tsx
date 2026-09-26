import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderHook } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// MYK9-783: the public class results page (/shows/:showId/trials/:trialId/
// classes/:classId/results) is reachable signed out. Its parent show came from
// the device's show store first, so a guest on a device a secretary used saw
// the secretary's draft, or a show deleted on the server since, in the page
// header and section links.

const mocks = vi.hoisted(() => ({
  useAuthContext: vi.fn(),
  useShowStore: vi.fn(),
  useShowQuery: vi.fn(),
}));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: [], updateClass: vi.fn(), deleteClass: vi.fn() }),
  useClassEntriesWithQuery: () => ({ entries: [], isLoading: false, error: null }),
}));
vi.mock('@/hooks/queries/useClassEntriesRaw', () => ({
  useClassEntriesRaw: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock('@/hooks/queries/usePublicClassById', () => ({
  usePublicClassById: () => ({ data: { id: 'class-1', trialId: 'trial-1' } }),
}));
// The guest's class and trial are the server's (MYK9-785, its own test file).
vi.mock('@/hooks/queries/publicClassContextQuery', () => ({
  usePublicClassContextQuery: () => ({
    read: {
      kind: 'ready',
      data: {
        currentClass: { id: 'class-1', trialId: 'trial-1' },
        parentTrial: { id: 'trial-1', showId: 'show-1' },
        trialClasses: [{ id: 'class-1', trialId: 'trial-1' }],
      },
    },
    refetch: vi.fn(),
  }),
}));
vi.mock('@/store/trialStore', () => ({ useTrialStore: () => ({ trials: [], trialClasses: {} }) }));
vi.mock('@/store/showStore', () => ({ useShowStore: mocks.useShowStore }));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: () => ({ dogs: [] }) }));
vi.mock('@/hooks/useFilteredEntries', () => ({ useEntriesByClass: () => [] }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: mocks.useAuthContext }));
vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useSecretaryShowEntriesQuery: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({ useShowQuery: mocks.useShowQuery }));

import { useClassDetailsData } from './useClassDetailsData';

const PUBLISHED = { id: 'show-1', name: 'Spring Scent Trial', clubId: 'club-1' };

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/shows/show-1/trials/trial-1/classes/class-1/results']}>
      <Routes>
        <Route path="/shows/:showId/trials/:trialId/classes/:classId/results" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

function signedOut() {
  mocks.useAuthContext.mockReturnValue({
    user: null,
    loading: false,
    hasRole: () => false,
    userWithRoles: null,
  });
}

describe('useClassDetailsData parent show for a signed-out guest (MYK9-783)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedOut();
    // useShowQuery is the guest's server read: anon gets nothing for these.
    mocks.useShowQuery.mockReturnValue({ data: undefined, isPlaceholderData: false });
  });

  it.each([
    ['a draft', { ...PUBLISHED, name: 'Secret Draft Trial', status: 'draft' }],
    ['a show deleted on the server', { ...PUBLISHED, name: 'Cancelled Trial' }],
  ])('never takes %s from the device show store', (_label, replicaShow) => {
    mocks.useShowStore.mockReturnValue({ shows: [replicaShow] });

    const { result } = renderHook(() => useClassDetailsData(), { wrapper });

    expect(result.current.parentShow).toBeUndefined();
    expect(mocks.useShowQuery).toHaveBeenCalledWith('show-1');
  });

  it("shows the server's answer when anon may see the show", () => {
    mocks.useShowStore.mockReturnValue({ shows: [{ ...PUBLISHED, name: 'Stale Name' }] });
    mocks.useShowQuery.mockReturnValue({ data: PUBLISHED, isPlaceholderData: false });

    const { result } = renderHook(() => useClassDetailsData(), { wrapper });

    expect(result.current.parentShow).toEqual(PUBLISHED);
  });

  it('a ringside passcode session never takes the parent show from the store', () => {
    mocks.useAuthContext.mockReturnValue({
      user: { id: 'anon-1', is_anonymous: true },
      loading: false,
      hasRole: () => false,
      userWithRoles: { scopes: [] },
    });
    mocks.useShowStore.mockReturnValue({
      shows: [{ ...PUBLISHED, name: 'Secret Draft Trial', status: 'draft' }],
    });

    const { result } = renderHook(() => useClassDetailsData(), { wrapper });

    expect(result.current.parentShow).toBeUndefined();
    expect(mocks.useShowQuery).toHaveBeenCalledWith('show-1');
  });

  it('a signed-in viewer still reads the store first', () => {
    mocks.useAuthContext.mockReturnValue({
      user: { id: 'user-1' },
      loading: false,
      hasRole: () => false,
      userWithRoles: { scopes: [] },
    });
    const stored = { ...PUBLISHED, name: 'Stored Show' };
    mocks.useShowStore.mockReturnValue({ shows: [stored] });

    const { result } = renderHook(() => useClassDetailsData(), { wrapper });

    expect(result.current.parentShow).toEqual(stored);
  });
});
