/**
 * MYK9-899: the retired Add Classes panel's create mutation invalidated the class caches, so the
 * trial page showed the new classes at once. The wizard's add-classes save writes through
 * replication and must do the same -- offline too -- or the page keeps the old list for the
 * whole staleTime and reopening Add Classes re-offers classes that already exist.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { useWizardStore } from '@/store/wizardStore';
import { classKeys } from '@/hooks/queries/useClassesDatabase';
import { createWizardTrialView } from '@/utils/wizardTrialNames';
import { useShowCreationWizardActions } from '../useShowCreationWizardActions';

// The device's class replica, as the trial page's query reads it.
const replica: { id: string }[] = [];
const createWizardClassesMock = vi.hoisted(() => vi.fn());

vi.mock('../createWizardClasses', () => ({ createWizardClasses: createWizardClassesMock }));
vi.mock('../buildRuleMap', () => ({ buildRuleMap: vi.fn().mockResolvedValue(new Map()) }));
vi.mock('../saveWizardShowJudges', () => ({
  saveWizardShowJudges: vi.fn().mockResolvedValue(true),
  wizardEditJudgeBaseline: () => [],
}));
vi.mock('../grantShowOfficials', () => ({
  grantShowOfficials: vi.fn().mockResolvedValue({ deferredOffline: 0 }),
  officialsDeferredOfflineMessage: () => '',
}));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const show = { id: 'show-1', name: 'Heartland', organization: 'AKC' };
vi.mock('@/store/showStore', () => ({
  useShowStore: Object.assign(
    () => ({
      addShow: vi.fn(),
      updateShow: vi
        .fn()
        .mockResolvedValue({ id: 'show-1', name: 'Heartland', organization: 'AKC' }),
      deleteShowCascading: vi.fn(),
    }),
    { setState: vi.fn() }
  ),
}));
vi.mock('@/store/clubStore', () => ({ useClubStore: () => ({ clubs: [] }) }));
vi.mock('@/store/trialStore', () => ({
  useTrialStore: () => ({
    addTrial: vi.fn(),
    trials: [{ id: 'trial-1', showId: 'show-1' }],
    loadTrialClasses: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({ useClassStoreCompat: () => ({ classes: [] }) }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isOnline: false }) }));
vi.mock('@/hooks/useReplicationSync', () => ({
  // Offline: sync is a no-op, so nothing but our invalidation can refresh the page.
  useReplicationSync: () => ({ triggerSync: vi.fn().mockResolvedValue(undefined) }),
}));

const trialView = createWizardTrialView(
  [{ id: 'trial-1', nameOverride: 'Sat', trialDate: '' }],
  []
);

beforeEach(() => {
  replica.length = 0;
  createWizardClassesMock.mockReset().mockImplementation(async (_showId, classes) => {
    for (const c of classes as { id: string }[]) replica.push({ id: c.id });
  });
  useWizardStore.setState({
    show: { ...useWizardStore.getState().show, ...show } as never,
    trials: [
      {
        id: 'trial-1',
        trialDate: '2026-10-10',
        startTimeDraft: '08:00 AM',
        eventNumber: '',
        trialType: 'scent_work',
        classes: [
          {
            templateId: 't1',
            customizations: {
              className: 'Container Novice A',
              element: 'Container',
              level: 'Novice',
              section: 'A',
            },
          },
        ],
      },
    ] as never,
  });
});

describe('add-classes save refreshes the class caches', () => {
  it('invalidates the class keys offline, so the trial page lists the new class without waiting', async () => {
    const queryClient = new QueryClient();
    // The trial page's class query: a long staleTime, like a warm page.
    const observer = new QueryObserver(queryClient, {
      queryKey: classKeys.byTrial('trial-1'),
      queryFn: async () => [...replica],
      staleTime: 5 * 60 * 1000,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    // The all-classes list the trial page's useClassStoreCompat reads.
    let listFetches = 0;
    const listObserver = new QueryObserver(queryClient, {
      queryKey: classKeys.list('all'),
      queryFn: async () => {
        listFetches += 1;
        return [...replica];
      },
      staleTime: 5 * 60 * 1000,
    });
    const unsubscribeList = listObserver.subscribe(() => undefined);
    await vi.waitFor(() => expect(listFetches).toBe(1));
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
    expect(observer.getCurrentResult().data).toEqual([]);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useShowCreationWizardActions({
          editMode: { showId: 'show-1', mode: 'add-classes' },
          trialView,
          setIsLoading: vi.fn(),
        }),
      { wrapper }
    );

    await act(async () => {
      await result.current.handleCreateShow();
    });

    expect(createWizardClassesMock).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toHaveLength(1));
    // The list refetched too (the same keys the retired mutation hit).
    await vi.waitFor(() => expect(listFetches).toBe(2));
    expect(listObserver.getCurrentResult().data).toHaveLength(1);
    unsubscribe();
    unsubscribeList();
  });
});
