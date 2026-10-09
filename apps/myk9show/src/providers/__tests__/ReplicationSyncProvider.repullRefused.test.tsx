/**
 * MYK9-1071 (D3): when the server finally refuses a queued write, the provider
 * re-pulls the rows behind it, and Discard re-pulls them too, so the local copy
 * stops claiming a value the server rejected.
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

const { repullRowsForMutations, discardFailedMutationMock } = vi.hoisted(() => ({
  repullRowsForMutations: vi.fn().mockResolvedValue(undefined),
  discardFailedMutationMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/replication/repullRefusedRows', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication/repullRefusedRows')>()),
  repullRowsForMutations,
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
      discardFailedMutation = discardFailedMutationMock;
    } as unknown as typeof actual.MutationManager,
  };
});

import { ReplicationSyncProvider } from '../ReplicationSyncProvider';
import { toast } from 'sonner';

const refused = {
  id: 'mut-1',
  tableName: 'people',
  rowId: 'person-1',
  operation: 'UPDATE',
  error: 'Permission denied',
  failureKind: 'authorization',
};
const exhausted = { ...refused, id: 'mut-2', rowId: 'person-2', failureKind: 'max-retries' };

function renderProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

function dispatchSyncFailed(mutations: unknown[]) {
  window.dispatchEvent(
    new CustomEvent('replication:sync-failed', {
      detail: { count: mutations.length, mutations, message: '' },
    })
  );
}

describe('ReplicationSyncProvider re-pulls refused rows (MYK9-1071)', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    repullRowsForMutations.mockClear();
    discardFailedMutationMock.mockClear();
  });

  it('re-pulls the rows of final refusals only, as soon as the failure arrives', () => {
    renderProvider();
    act(() => dispatchSyncFailed([refused, exhausted]));

    expect(repullRowsForMutations).toHaveBeenCalledWith([refused]);
  });

  it('re-pulls the discarded mutations after Discard', async () => {
    renderProvider();
    act(() => dispatchSyncFailed([exhausted]));
    repullRowsForMutations.mockClear();

    const options = vi.mocked(toast.error).mock.calls[0]?.[1] as {
      cancel: { onClick: () => void };
    };
    act(() => options.cancel.onClick());

    expect(discardFailedMutationMock).toHaveBeenCalledWith('mut-2');
    await waitFor(() => expect(repullRowsForMutations).toHaveBeenCalledWith([exhausted]));
  });
});
