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
const existingShowsMock: { current: unknown[] } = { current: [] };
vi.mock('@/store/showStore', () => ({
  useShowStore: {
    getState: () => ({ shows: existingShowsMock.current, addShowLegacy: addShowLegacyMock }),
  },
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

const notificationsWarningMock = vi.fn();
vi.mock('@/lib/notifications', () => ({
  notifications: {
    warning: (...a: unknown[]) => notificationsWarningMock(...a),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
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
  style: 'monogram',
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
    notificationsWarningMock.mockReset();
    existingShowsMock.current = [];
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
          style: 'monogram',
        }),
        p_trials: [],
        p_classes: [],
        p_judge_ids: [],
      })
    );
  });

  it('returns and caches the selected premium list style on the saved show', async () => {
    rpcMock.mockResolvedValue({ error: null });
    const queryClient = makeQueryClient();

    const result = await saveShowAtomicOnline({
      show: { ...baseShow, style: 'heritage' },
      trials: baseTrials,
      judgeDetails: {},
      clubs: [],
      status: 'unpublished',
      queryClient,
      triggerSync: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.savedShow.style).toBe('heritage');
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ style: 'heritage' })
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

  it('throws when grant_show_official fails so the wizard surfaces a real save error', async () => {
    rpcMock.mockImplementation(async (fn: string) => {
      if (fn === 'grant_show_official') return { error: { message: 'forbidden' } };
      return { error: null };
    });

    const showWithOfficial: WizardShowData = {
      ...baseShow,
      officials: { secretary: ['11111111-0000-4000-8000-000000000001'], chairman: [], steward: [] },
    };

    await expect(
      saveShowAtomicOnline({
        show: showWithOfficial,
        trials: baseTrials,
        judgeDetails: {},
        clubs: [],
        status: 'unpublished',
        queryClient: makeQueryClient(),
        triggerSync: vi.fn().mockResolvedValue(undefined),
      })
    ).rejects.toThrow(/Failed to assign 1 official role/);
  });

  it('calls insert_show_passcodes(p_show_id) with no codes payload and surfaces the returned plaintexts', async () => {
    const serverPlaintexts = {
      admin: 'aq8m2',
      judge: 'j7xk0',
      steward: 's4nf3',
      exhibitor: 'eh2p9',
    };
    rpcMock.mockImplementation(async (fn: string) => {
      if (fn === 'insert_show_passcodes') return { data: [serverPlaintexts], error: null };
      return { error: null };
    });

    const result = await saveShowAtomicOnline({
      show: baseShow,
      trials: baseTrials,
      judgeDetails: {},
      clubs: [],
      status: 'unpublished',
      queryClient: makeQueryClient(),
      triggerSync: vi.fn().mockResolvedValue(undefined),
    });

    const passcodeCall = rpcMock.mock.calls.find((c) => c[0] === 'insert_show_passcodes');
    expect(passcodeCall).toBeDefined();
    // The new signature takes ONLY p_show_id — generation is server-side so
    // there's no p_codes payload (client can't detect UNIQUE collisions).
    expect(passcodeCall![1]).toEqual({ p_show_id: result.showId });

    // Server-generated plaintexts flow back to the caller via result.passcodes.
    expect(result.passcodes).toEqual(serverPlaintexts);
  });

  it('returns passcodes: null and warns when insert_show_passcodes fails (show still created)', async () => {
    rpcMock.mockImplementation(async (fn: string) => {
      if (fn === 'insert_show_passcodes') return { data: null, error: { message: 'pepper missing' } };
      return { error: null };
    });

    const result = await saveShowAtomicOnline({
      show: baseShow,
      trials: baseTrials,
      judgeDetails: {},
      clubs: [],
      status: 'unpublished',
      queryClient: makeQueryClient(),
      triggerSync: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.passcodes).toBeNull();
    expect(result.showId).toBeTruthy();
    expect(result.savedShow.name).toBe('Test Show');
  });

  it('skips addShowLegacy when the show is already in the store (idempotent retry)', async () => {
    rpcMock.mockResolvedValue({ error: null });

    // Seed the store with the id that buildCreateShowPayload will generate next
    // so the dedup guard trips. baseTrials is empty, so randomUUID is only
    // called once (for the showId).
    const seededId = '22222222-0000-4000-8000-000000000002';
    const uuidSpy = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(seededId as `${string}-${string}-${string}-${string}-${string}`);
    existingShowsMock.current = [{ id: seededId }];

    await saveShowAtomicOnline({
      show: baseShow,
      trials: baseTrials,
      judgeDetails: {},
      clubs: [],
      status: 'unpublished',
      queryClient: makeQueryClient(),
      triggerSync: vi.fn().mockResolvedValue(undefined),
    });

    expect(addShowLegacyMock).not.toHaveBeenCalled();
    uuidSpy.mockRestore();
  });
});
