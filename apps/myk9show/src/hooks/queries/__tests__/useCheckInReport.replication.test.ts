import type { PropsWithChildren } from 'react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const replicationMocks = vi.hoisted(() => ({
  getEntriesByShow: vi.fn(),
  getClassById: vi.fn(),
  getTrialsByShow: vi.fn(),
  getArmbandsByShow: vi.fn(),
  getAllDogs: vi.fn(),
}));

const hydrationMocks = vi.hoisted(() => ({
  loadHandlerPeople: vi.fn(),
  subscribeHandlerPeopleHydration: vi.fn(),
  stopHandlerPeopleHydration: vi.fn(),
  handlerPeopleListener: null as ((event: { ids: readonly string[] }) => void) | null,
}));

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => supabaseMocks.from(...args),
  },
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    getEntriesByShow: (...args: unknown[]) => replicationMocks.getEntriesByShow(...args),
  },
  replicatedClassesTable: {
    getClassById: (...args: unknown[]) => replicationMocks.getClassById(...args),
  },
  replicatedTrialsTable: {
    getTrialsByShow: (...args: unknown[]) => replicationMocks.getTrialsByShow(...args),
  },
  replicatedArmbandsTable: {
    getByShow: (...args: unknown[]) => replicationMocks.getArmbandsByShow(...args),
  },
  replicatedDogsTable: {
    getAllDogs: (...args: unknown[]) => replicationMocks.getAllDogs(...args),
  },
}));

vi.mock('@/services/database/entries/handlerHydration', () => ({
  loadHandlerPeople: (...args: unknown[]) => hydrationMocks.loadHandlerPeople(...args),
  subscribeHandlerPeopleHydration: (listener: (event: { ids: readonly string[] }) => void) => {
    hydrationMocks.handlerPeopleListener = listener;
    hydrationMocks.subscribeHandlerPeopleHydration(listener);
    return hydrationMocks.stopHandlerPeopleHydration;
  },
}));

describe('fetchReplicatedCheckInEntries', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    hydrationMocks.handlerPeopleListener = null;
    hydrationMocks.loadHandlerPeople.mockResolvedValue(
      new Map([
        ['owner-1', { id: 'owner-1', first_name: 'Olivia', last_name: 'Owner' }],
        ['handler-1', { id: 'handler-1', first_name: 'Harper', last_name: 'Handler' }],
      ])
    );
    replicationMocks.getAllDogs.mockResolvedValue([]);
  });

  it('builds the check-in report rows from replicated show-day tables', async () => {
    replicationMocks.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-1',
        showId: 'show-1',
        dogId: 'dog-1',
        handlerId: 'handler-1',
        dogOwnerId: 'owner-1',
        handler: null,
        dogCallName: 'Buddy',
        dogBreed: 'Golden Retriever',
        classId: 'class-1',
        checkInStatus: 'checked-in',
      },
      {
        id: 'entry-2',
        showId: 'show-1',
        dogId: 'dog-1',
        handlerId: 'handler-1',
        dogOwnerId: 'owner-1',
        handler: null,
        dogCallName: 'Buddy',
        dogBreed: 'Golden Retriever',
        classId: 'class-2',
        checkInStatus: 'no-status',
      },
      {
        id: 'deleted-entry',
        showId: 'show-1',
        dogId: 'dog-2',
        handlerId: 'handler-2',
        classId: 'class-1',
        deletedAt: '2026-06-01T00:00:00.000Z',
      },
    ]);
    replicationMocks.getClassById.mockImplementation((classId: string) =>
      Promise.resolve(
        classId === 'class-1'
          ? {
              id: 'class-1',
              trialId: 'trial-1',
              element: 'Buried',
              level: 'Novice',
              section: 'A',
            }
          : {
              id: 'class-2',
              trialId: 'trial-2',
              element: 'Interior',
              level: 'Advanced',
              section: 'B',
            }
      )
    );
    replicationMocks.getTrialsByShow.mockResolvedValue([
      { id: 'trial-1', date: '2026-04-12', trialNumber: '1' },
      { id: 'trial-2', date: '2026-04-13', trialNumber: '2' },
    ]);
    replicationMocks.getArmbandsByShow.mockResolvedValue([
      {
        id: 'armband-1',
        showId: 'show-1',
        dogId: 'dog-1',
        armbandNumber: '142',
        isAvailable: false,
      },
    ]);

    const { fetchReplicatedCheckInEntries } = await import('../useCheckInReportReplication');

    const rows = await fetchReplicatedCheckInEntries('show-1');

    expect(replicationMocks.getEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(replicationMocks.getTrialsByShow).toHaveBeenCalledWith('show-1');
    expect(replicationMocks.getArmbandsByShow).toHaveBeenCalledWith('show-1');
    expect(hydrationMocks.loadHandlerPeople).toHaveBeenCalledWith(['handler-1', 'owner-1']);
    expect(replicationMocks.getClassById).toHaveBeenCalledTimes(2);
    expect(supabaseMocks.from).not.toHaveBeenCalled();
    const { groupEntriesByExhibitor } = await import('../useCheckInReport');
    expect(groupEntriesByExhibitor(rows)[0]?.handlerName).toBe('Harper Handler');
    expect(rows).toEqual([
      {
        id: 'entry-1',
        dog_id: 'dog-1',
        handler_id: 'handler-1',
        check_in_status: 'checked-in',
        armband_number: 142,
        handler_first_name: 'Harper',
        handler_last_name: 'Handler',
        handler_identity_ids: ['handler-1', 'owner-1'],
        dog_call_name: 'Buddy',
        dog_breed_name: 'Golden Retriever',
        class_id: 'class-1',
        element: 'Buried',
        level: 'Novice',
        section: 'A',
        trial_id: 'trial-1',
        trial_date: '2026-04-12',
        trial_number: 1,
      },
      {
        id: 'entry-2',
        dog_id: 'dog-1',
        handler_id: 'handler-1',
        check_in_status: 'no-status',
        armband_number: 142,
        handler_first_name: 'Harper',
        handler_last_name: 'Handler',
        handler_identity_ids: ['handler-1', 'owner-1'],
        dog_call_name: 'Buddy',
        dog_breed_name: 'Golden Retriever',
        class_id: 'class-2',
        element: 'Interior',
        level: 'Advanced',
        section: 'B',
        trial_id: 'trial-2',
        trial_date: '2026-04-13',
        trial_number: 2,
      },
    ]);
  });

  it('ignores armbands that are not explicitly assigned', async () => {
    replicationMocks.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-1',
        showId: 'show-1',
        dogId: 'dog-1',
        handlerId: 'handler-1',
        handler: 'Cher',
        dogCallName: 'Buddy',
        classId: 'class-1',
      },
    ]);
    replicationMocks.getClassById.mockResolvedValue({
      id: 'class-1',
      trialId: 'trial-1',
      element: 'Buried',
      level: 'Novice',
    });
    replicationMocks.getTrialsByShow.mockResolvedValue([
      { id: 'trial-1', date: '2026-04-12', trialNumber: '1' },
    ]);
    replicationMocks.getArmbandsByShow.mockResolvedValue([
      {
        id: 'pool-armband',
        showId: 'show-1',
        dogId: 'dog-1',
        armbandNumber: '999',
        isAvailable: undefined,
      },
    ]);

    const { fetchReplicatedCheckInEntries } = await import('../useCheckInReportReplication');

    const rows = await fetchReplicatedCheckInEntries('show-1');

    expect(rows[0].armband_number).toBeNull();
    expect(rows[0].handler_first_name).toBe('Cher');
    expect(rows[0].handler_last_name).toBeNull();
  });

  it('uses the projected owner identity when no handler text or id exists', async () => {
    replicationMocks.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-owner',
        showId: 'show-1',
        dogId: 'dog-1',
        dogOwnerId: 'owner-1',
        handlerId: null,
        handler: null,
        dogCallName: 'Buddy',
        classId: 'class-1',
      },
    ]);
    replicationMocks.getClassById.mockResolvedValue({
      id: 'class-1',
      trialId: 'trial-1',
      element: 'Buried',
      level: 'Novice',
    });
    replicationMocks.getTrialsByShow.mockResolvedValue([
      { id: 'trial-1', date: '2026-04-12', trialNumber: '1' },
    ]);
    replicationMocks.getArmbandsByShow.mockResolvedValue([]);

    const { fetchReplicatedCheckInEntries } = await import('../useCheckInReportReplication');

    const rows = await fetchReplicatedCheckInEntries('show-1');

    const { groupEntriesByExhibitor } = await import('../useCheckInReport');
    expect(groupEntriesByExhibitor(rows)[0]?.handlerName).toBe('Olivia Owner');
    expect(rows[0]).toMatchObject({
      handler_first_name: 'Olivia',
      handler_last_name: 'Owner',
      handler_identity_ids: ['owner-1'],
    });
  });

  it('attaches a cold dog owner before collecting identity dependencies', async () => {
    replicationMocks.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-owner-from-dog',
        showId: 'show-1',
        dogId: 'dog-1',
        handlerId: null,
        handler: null,
        dogCallName: 'Buddy',
        classId: 'class-1',
      },
    ]);
    replicationMocks.getAllDogs.mockResolvedValue([
      {
        id: 'dog-1',
        name: 'Buddy',
        callName: 'Buddy',
        breed: 'Golden Retriever',
        ownerId: 'owner-1',
      },
    ]);
    replicationMocks.getClassById.mockResolvedValue({
      id: 'class-1',
      trialId: 'trial-1',
      element: 'Buried',
      level: 'Novice',
    });
    replicationMocks.getTrialsByShow.mockResolvedValue([
      { id: 'trial-1', date: '2026-04-12', trialNumber: '1' },
    ]);
    replicationMocks.getArmbandsByShow.mockResolvedValue([]);

    const { fetchReplicatedCheckInEntries } = await import('../useCheckInReportReplication');

    const rows = await fetchReplicatedCheckInEntries('show-1');

    expect(hydrationMocks.loadHandlerPeople).toHaveBeenCalledWith(['owner-1']);
    expect(rows[0]).toMatchObject({
      handler_first_name: 'Olivia',
      handler_last_name: 'Owner',
      handler_identity_ids: ['owner-1'],
    });
  });

  it('refreshes once when delayed handler hydration completes for this report', async () => {
    replicationMocks.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-owner',
        showId: 'show-1',
        dogId: 'dog-1',
        handlerId: null,
        handler: null,
        dogCallName: 'Buddy',
        classId: 'class-1',
      },
    ]);
    replicationMocks.getAllDogs.mockResolvedValue([
      {
        id: 'dog-1',
        name: 'Buddy',
        callName: 'Buddy',
        breed: 'Golden Retriever',
        ownerId: 'owner-1',
      },
    ]);
    replicationMocks.getClassById.mockResolvedValue({
      id: 'class-1',
      trialId: 'trial-1',
      element: 'Buried',
      level: 'Novice',
    });
    replicationMocks.getTrialsByShow.mockResolvedValue([
      { id: 'trial-1', date: '2026-04-12', trialNumber: '1' },
    ]);
    replicationMocks.getArmbandsByShow.mockResolvedValue([]);
    hydrationMocks.loadHandlerPeople
      .mockResolvedValueOnce(new Map())
      .mockResolvedValue(
        new Map([['owner-1', { id: 'owner-1', first_name: 'Olivia', last_name: 'Owner' }]])
      );

    const { useCheckInReport } = await import('../useCheckInReport');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
    });
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result, unmount } = renderHook(() => useCheckInReport('show-1'), { wrapper });

    await waitFor(() => expect(result.current.data?.[0]?.handlerName).toBe('Unknown'));
    expect(hydrationMocks.handlerPeopleListener).toBeTypeOf('function');
    const readsBeforeCompletion = hydrationMocks.loadHandlerPeople.mock.calls.length;

    act(() => hydrationMocks.handlerPeopleListener?.({ ids: ['unrelated-person'] }));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(hydrationMocks.loadHandlerPeople.mock.calls.length).toBe(readsBeforeCompletion);

    act(() => hydrationMocks.handlerPeopleListener?.({ ids: ['owner-1'] }));
    await waitFor(() => expect(result.current.data?.[0]?.handlerName).toBe('Olivia Owner'));
    expect(hydrationMocks.loadHandlerPeople).toHaveBeenCalledTimes(readsBeforeCompletion + 1);

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(hydrationMocks.loadHandlerPeople).toHaveBeenCalledTimes(readsBeforeCompletion + 1);

    unmount();
    expect(hydrationMocks.stopHandlerPeopleHydration).toHaveBeenCalledTimes(1);
  });
});
