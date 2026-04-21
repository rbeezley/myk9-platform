import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import type { WizardShowData, WizardTrial } from '../showCreationWizardTransformers';

const rpcMock = vi.fn();
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

const showsSetMock = vi.fn();
const trialsSetMock = vi.fn();
const classesSetMock = vi.fn();
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { set: (...a: unknown[]) => showsSetMock(...a) },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { set: (...a: unknown[]) => trialsSetMock(...a) },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { set: (...a: unknown[]) => classesSetMock(...a) },
}));

vi.mock('@/services/sportTemplateService', () => ({
  fetchClassRulesForTemplate: vi.fn().mockResolvedValue([]),
}));

const addShowLegacyMock = vi.fn();
vi.mock('@/store/showStore', () => ({
  useShowStore: { getState: () => ({ addShowLegacy: addShowLegacyMock }) },
}));

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  showQueryKeys: {
    detail: (id: string) => ['shows', id],
    lists: () => ['shows', 'list'],
  },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Import after mocks so the module-under-test picks them up.
import { saveShowAtomicOnline } from '../saveShowAtomicOnline';

const baseShow: WizardShowData = {
  name: 'Test Show',
  organization: 'AKC',
  startDate: '2026-06-01',
  endDate: '2026-06-02',
  location: 'Somewhere',
  clubId: 'aaaaaaaa-0000-4000-8000-000000000001',
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2026-05-15',
  preEntryFee: 30,
  dayOfShowFee: 35,
  startingArmbandNumber: 100,
  officials: { secretary: [], chairman: [], steward: [] },
  judgeIds: [],
  acceptCheckPayments: true,
  acceptCashPayments: false,
};

const baseTrials: WizardTrial[] = [];

function makeQueryClient(): QueryClient {
  return {
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  } as unknown as QueryClient;
}

describe('saveShowAtomicOnline', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    showsSetMock.mockReset();
    trialsSetMock.mockReset();
    classesSetMock.mockReset();
    addShowLegacyMock.mockReset();
  });

  it('calls supabase.rpc with create_show_with_children and the built payload', async () => {
    rpcMock.mockResolvedValue({ error: null });

    await saveShowAtomicOnline({
      show: baseShow,
      trials: baseTrials,
      judgeDetails: {},
      clubs: [],
      status: 'unpublished',
      queryClient: makeQueryClient(),
      triggerSync: vi.fn().mockResolvedValue(undefined),
    });

    expect(rpcMock).toHaveBeenCalledWith(
      'create_show_with_children',
      expect.objectContaining({
        p_show: expect.objectContaining({
          name: 'Test Show',
          club_id: baseShow.clubId,
          status: 'draft',
        }),
        p_trials: [],
        p_classes: [],
        p_judge_ids: [],
      })
    );
  });

  it('seeds IndexedDB with set(id, data, false) after a successful RPC', async () => {
    rpcMock.mockResolvedValue({ error: null });

    await saveShowAtomicOnline({
      show: baseShow,
      trials: baseTrials,
      judgeDetails: {},
      clubs: [],
      status: 'unpublished',
      queryClient: makeQueryClient(),
      triggerSync: vi.fn().mockResolvedValue(undefined),
    });

    expect(showsSetMock).toHaveBeenCalledTimes(1);
    expect(showsSetMock.mock.calls[0]![2]).toBe(false);
  });

  it('rethrows RPC errors so the caller can surface them', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'boom' } });

    await expect(
      saveShowAtomicOnline({
        show: baseShow,
        trials: baseTrials,
        judgeDetails: {},
        clubs: [],
        status: 'unpublished',
        queryClient: makeQueryClient(),
        triggerSync: vi.fn().mockResolvedValue(undefined),
      })
    ).rejects.toThrow('boom');

    expect(showsSetMock).not.toHaveBeenCalled();
  });

  it('does not throw when IndexedDB seeding fails after a successful RPC', async () => {
    rpcMock.mockResolvedValue({ error: null });
    showsSetMock.mockRejectedValueOnce(new Error('indexeddb-down'));
    const triggerSync = vi.fn().mockResolvedValue(undefined);

    await expect(
      saveShowAtomicOnline({
        show: baseShow,
        trials: baseTrials,
        judgeDetails: {},
        clubs: [],
        status: 'unpublished',
        queryClient: makeQueryClient(),
        triggerSync,
      })
    ).resolves.toBeDefined();

    expect(triggerSync).toHaveBeenCalled();
  });
});
