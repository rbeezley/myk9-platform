import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderHook, waitFor } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// MYK9-785: the public class results page (/shows/:showId/trials/:trialId/
// classes/:classId/results) is reachable signed out. After MYK9-783 its parent
// show was the server's, but the CLASS, its TRIAL and the trial's class list
// still came from stores fed by the device replica, so a guest on a device a
// secretary used saw a stale or unpublished class and trial.

const mocks = vi.hoisted(() => ({
  useAuthContext: vi.fn(),
  useClassStoreCompat: vi.fn(),
  useTrialStore: vi.fn(),
  getPublicClassById: vi.fn(),
  getClassesByTrialId: vi.fn(),
  getPublicTrialsByShow: vi.fn(),
}));

vi.mock('@/services/database/classes', () => ({
  getPublicClassById: mocks.getPublicClassById,
  getClassesByTrialId: mocks.getClassesByTrialId,
}));
vi.mock('@/services/database/trials', () => ({
  getPublicTrialsByShow: mocks.getPublicTrialsByShow,
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: mocks.useClassStoreCompat,
  useClassEntriesWithQuery: () => ({ entries: [], isLoading: false, error: null }),
}));
vi.mock('@/hooks/queries/useClassEntriesRaw', () => ({
  useClassEntriesRaw: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock('@/store/trialStore', () => ({ useTrialStore: mocks.useTrialStore }));
vi.mock('@/store/showStore', () => ({ useShowStore: () => ({ shows: [] }) }));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: () => ({ dogs: [] }) }));
vi.mock('@/hooks/useFilteredEntries', () => ({ useEntriesByClass: () => [] }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: mocks.useAuthContext }));
vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useSecretaryShowEntriesQuery: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowQuery: () => ({ data: undefined, isPlaceholderData: false }),
}));

import { useClassDetailsData } from './useClassDetailsData';

// What the device replica still holds from an earlier signed-in session.
const STALE_CLASS = { id: 'class-1', trialId: 'trial-1', className: 'Stale Draft Class' };
const STALE_SIBLING = { id: 'class-9', trialId: 'trial-1', className: 'Unpublished Sibling' };
const STALE_TRIAL = { id: 'trial-1', showId: 'show-1', name: 'Stale Trial' };

// What the server returns to anon.
const SERVER_CLASS = { id: 'class-1', trialId: 'trial-1', className: 'Interior Novice A' };
const SERVER_TRIAL_ROW = { id: 'trial-1', show_id: 'show-1', name: 'Saturday Trial 1' };
const SERVER_CLASS_ROWS = [
  { id: 'class-1', trial_id: 'trial-1', name: 'Interior Novice A' },
  { id: 'class-2', trial_id: 'trial-1', name: 'Container Novice A' },
];

type HookResult = ReturnType<typeof useClassDetailsData>;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/shows/show-1/trials/trial-1/classes/class-1/results']}>
        <Routes>
          <Route
            path="/shows/:showId/trials/:trialId/classes/:classId/results"
            element={children}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const renders: HookResult[] = [];
  const hook = renderHook(
    () => {
      const value = useClassDetailsData();
      renders.push(value);
      return value;
    },
    { wrapper }
  );
  return { ...hook, renders };
}

/** No render, at any point, may show a guest what the device replica holds. */
function expectNoReplicaContent(renders: HookResult[]) {
  for (const value of renders) {
    expect(value.currentClass?.className).not.toBe(STALE_CLASS.className);
    expect(value.parentTrial?.name).not.toBe(STALE_TRIAL.name);
    expect(value.trialClasses.map(cls => cls.id)).not.toContain(STALE_SIBLING.id);
    expect(value.classes.map(cls => cls.id)).not.toContain(STALE_SIBLING.id);
  }
}

function signedOut() {
  mocks.useAuthContext.mockReturnValue({
    user: null,
    loading: false,
    hasRole: () => false,
    userWithRoles: null,
  });
}

describe('useClassDetailsData class and trial for a signed-out guest (MYK9-785)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedOut();
    mocks.useClassStoreCompat.mockReturnValue({
      classes: [STALE_CLASS, STALE_SIBLING],
      updateClass: vi.fn(),
      deleteClass: vi.fn(),
    });
    mocks.useTrialStore.mockReturnValue({
      trials: [STALE_TRIAL],
      trialClasses: { 'trial-1': [STALE_CLASS, STALE_SIBLING] },
    });
    mocks.getPublicClassById.mockResolvedValue(SERVER_CLASS);
    mocks.getPublicTrialsByShow.mockResolvedValue({ data: [SERVER_TRIAL_ROW], error: null });
    mocks.getClassesByTrialId.mockResolvedValue({ data: SERVER_CLASS_ROWS, error: null });
  });

  it("shows only the server's class, trial and class list", async () => {
    const { result, renders } = renderPage();

    await waitFor(() => expect(result.current.currentClass?.className).toBe('Interior Novice A'));
    expectNoReplicaContent(renders);
    expect(result.current.guestClassState).toBe('ready');
    expect(result.current.parentTrial?.name).toBe('Saturday Trial 1');
    expect(result.current.trialClasses.map(cls => cls.className)).toEqual([
      'Interior Novice A',
      'Container Novice A',
    ]);
    expect(mocks.getPublicClassById).toHaveBeenCalledWith('class-1');
    expect(mocks.getPublicTrialsByShow).toHaveBeenCalledWith('show-1');
    expect(mocks.getClassesByTrialId).toHaveBeenCalledWith('trial-1');
  });

  it('renders nothing cached while the server read is in flight', () => {
    mocks.getPublicClassById.mockReturnValue(new Promise(() => {}));

    const { result, renders } = renderPage();

    expectNoReplicaContent(renders);
    expect(result.current.currentClass).toBeNull();
    expect(result.current.guestClassState).toBe('loading');
  });

  it('is not found when anon may not see the class', async () => {
    mocks.getPublicClassById.mockResolvedValue(null);

    const { result, renders } = renderPage();

    await waitFor(() => expect(result.current.guestClassState).toBe('ready'));
    expect(result.current.currentClass).toBeNull();
    expect(result.current.parentTrial).toBeUndefined();
    expectNoReplicaContent(renders);
  });

  it("is not found when the class's trial is not one anon sees in this show", async () => {
    mocks.getPublicTrialsByShow.mockResolvedValue({ data: [], error: null });

    const { result, renders } = renderPage();

    await waitFor(() => expect(result.current.guestClassState).toBe('ready'));
    expect(result.current.currentClass).toBeNull();
    expectNoReplicaContent(renders);
  });

  it('is an error, not cached content, when a server read fails', async () => {
    mocks.getClassesByTrialId.mockResolvedValue({ data: [], error: new Error('boom') });

    const { result, renders } = renderPage();

    await waitFor(() => expect(result.current.guestClassState).toBe('error'));
    expect(result.current.currentClass).toBeNull();
    expectNoReplicaContent(renders);
  });

  it('reads nothing from the device while auth is still resolving', () => {
    mocks.useAuthContext.mockReturnValue({
      user: null,
      loading: true,
      hasRole: () => false,
      userWithRoles: null,
    });

    const { result, renders } = renderPage();

    expectNoReplicaContent(renders);
    expect(result.current.currentClass).toBeNull();
    expect(result.current.guestClassState).toBe('loading');
  });

  // Owner decision: a ringside passcode session is a guest on this public
  // page. It used to read the stores, so on a shared device it saw a previous
  // secretary's stale or unpublished class.
  it("a ringside passcode session shows only the server's class, never the stores", async () => {
    mocks.useAuthContext.mockReturnValue({
      user: { id: 'anon-1', is_anonymous: true },
      loading: false,
      hasRole: () => false,
      userWithRoles: { scopes: [] },
    });

    const { result, renders } = renderPage();

    await waitFor(() => expect(result.current.currentClass?.className).toBe('Interior Novice A'));
    expectNoReplicaContent(renders);
    expect(result.current.guestClassState).toBe('ready');
    expect(result.current.parentTrial?.name).toBe('Saturday Trial 1');
    expect(mocks.getPublicClassById).toHaveBeenCalledWith('class-1');
    expect(mocks.getPublicTrialsByShow).toHaveBeenCalledWith('show-1');
  });

  it.each([
    ['a signed-in viewer', { scopes: [] }],
    // Raw session user present, roles not resolved: still not a guest.
    ['a signed-in viewer whose roles have not resolved', null],
  ])('%s still reads the class and trial from the stores', (_label, userWithRoles) => {
    mocks.useAuthContext.mockReturnValue({
      user: { id: 'user-1' },
      loading: false,
      hasRole: () => false,
      userWithRoles,
    });

    const { result } = renderPage();

    expect(result.current.currentClass).toEqual(STALE_CLASS);
    expect(result.current.parentTrial).toEqual(STALE_TRIAL);
    expect(result.current.trialClasses).toEqual([STALE_CLASS, STALE_SIBLING]);
    expect(result.current.classes).toEqual([STALE_CLASS, STALE_SIBLING]);
    expect(mocks.getPublicTrialsByShow).not.toHaveBeenCalled();
    expect(mocks.getClassesByTrialId).not.toHaveBeenCalled();
    expect(result.current.guestClassState).toBeNull();
  });
});
