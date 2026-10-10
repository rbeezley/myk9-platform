/**
 * MYK9-1071 review round 3: ONE invalidation rule for the registrations
 * replica. Resolving a conflict refreshes the registration readers, and
 * discarding an unsent registration add drops it from the list and dog caches.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NetworkStatusContext } from '@/hooks/useNetworkStatus';

vi.mock('@/lib/notifications', () => ({
  notifications: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
  }),
}));
vi.mock('@/hooks/useStoreSubscriptions', () => ({ useStoreSubscriptions: () => undefined }));

const { discardFailedMutation, discardPendingMutationsForRow, resolveReplicationConflict } =
  vi.hoisted(() => ({
    discardFailedMutation: vi.fn().mockResolvedValue(undefined),
    discardPendingMutationsForRow: vi.fn().mockResolvedValue(undefined),
    resolveReplicationConflict: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: {
    setMutationManager: vi.fn(),
    sync: vi.fn(),
    resolveReplicationConflict,
    getConflictedRows: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock(import('@myk9/replication'), async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    MutationManager: class {
      rowRefetchers = { register: () => () => undefined };
      uploadPendingMutations = vi.fn().mockResolvedValue([]);
      getPendingCount = vi.fn().mockResolvedValue(0);
      restoreMutationsFromLocalStorage = vi.fn().mockResolvedValue(undefined);
      getFailedMutations = vi.fn().mockResolvedValue([]);
      retryFailedMutation = vi.fn().mockResolvedValue(undefined);
      discardFailedMutation = discardFailedMutation;
      discardPendingMutationsForRow = discardPendingMutationsForRow;
    } as unknown as typeof actual.MutationManager,
  };
});

import { ReplicationSyncProvider } from '../ReplicationSyncProvider';
import { toast } from 'sonner';

const akc = { id: 'r1', dog_id: 'dog-1', organization: 'AKC', registration_number: 'A1' };
const added = { id: 'r-new', dog_id: 'dog-1', organization: 'ASCA', registration_number: 'S1' };

let queryClient: QueryClient;
function renderProvider() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['registrations', 'dog', 'dog-1'], [akc, added]);
  queryClient.setQueryData(['dogs', 'roster'], [{ id: 'dog-1', registrations: [akc, added] }]);
  return render(
    <QueryClientProvider client={queryClient}>
      <NetworkStatusContext.Provider
        value={{
          isOnline: true,
          quality: null,
          showOfflineMessage: false,
          retryConnection: vi.fn(),
        }}
      >
        <ReplicationSyncProvider autoSync={false} syncOnReconnect={false}>
          <div />
        </ReplicationSyncProvider>
      </NetworkStatusContext.Provider>
    </QueryClientProvider>
  );
}

type Options = { action: { onClick: () => void }; cancel: { onClick: () => void } };

describe('registration caches follow replica changes (MYK9-1071 round 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Take theirs refreshes the registration list and the dog caches', async () => {
    renderProvider();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    act(() => {
      window.dispatchEvent(
        new CustomEvent('replication:conflict', {
          detail: { tableName: 'dog_registrations', rowId: 'r1', fields: ['registered_name'] },
        })
      );
    });
    const options = vi.mocked(toast.warning).mock.calls[0]?.[1] as unknown as Options;
    act(() => options.action.onClick());

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['registrations'] }));
    expect(resolveReplicationConflict).toHaveBeenCalledWith('r1', 'take-remote');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dogs'] });
  });

  it('discarding an unsent add drops it from the list and the dog cache', async () => {
    renderProvider();
    act(() => {
      window.dispatchEvent(
        new CustomEvent('replication:sync-failed', {
          detail: {
            count: 1,
            message: '',
            mutations: [
              {
                id: 'm-1',
                tableName: 'dog_registrations',
                operation: 'INSERT',
                rowId: 'r-new',
                data: added,
                error: 'duplicate',
              },
            ],
          },
        })
      );
    });
    const options = vi.mocked(toast.error).mock.calls[0]?.[1] as unknown as Options;
    act(() => options.cancel.onClick());

    await waitFor(() =>
      expect(queryClient.getQueryData(['registrations', 'dog', 'dog-1'])).toEqual([akc])
    );
    expect(discardFailedMutation).toHaveBeenCalledWith('m-1');
    expect(queryClient.getQueryData(['dogs', 'roster'])).toEqual([
      { id: 'dog-1', registrations: [akc] },
    ]);
  });
});
