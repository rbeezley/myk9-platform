import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NetworkStatusContext } from '@/hooks/useNetworkStatus';

// Keep the provider's module-load side effects quiet. We only care about the
// `replication:sync-failed` listener wiring, so stub the heavy dependencies.
vi.mock('@/lib/notifications', () => ({
  notifications: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
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

vi.mock('@/hooks/useStoreSubscriptions', () => ({
  useStoreSubscriptions: () => undefined,
}));

const { retryFailedMutationMock, discardFailedMutationMock, getFailedMutationsMock } = vi.hoisted(
  () => ({
    retryFailedMutationMock: vi.fn().mockResolvedValue(undefined),
    discardFailedMutationMock: vi.fn().mockResolvedValue(undefined),
    getFailedMutationsMock: vi.fn().mockResolvedValue([]),
  })
);

vi.mock(import('@myk9/replication'), async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    MutationManager: class {
      uploadPendingMutations = vi.fn().mockResolvedValue([]);
      getPendingCount = vi.fn().mockResolvedValue(0);
      restoreMutationsFromLocalStorage = vi.fn().mockResolvedValue(undefined);
      getFailedMutations = getFailedMutationsMock;
      retryFailedMutation = retryFailedMutationMock;
      discardFailedMutation = discardFailedMutationMock;
    } as unknown as typeof actual.MutationManager,
  };
});

import { ReplicationSyncProvider } from '../ReplicationSyncProvider';
import { toast } from 'sonner';

type ToastOptions = {
  id?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
  cancel?: { label: string; onClick: () => void };
};

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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

function dispatchSyncFailed() {
  window.dispatchEvent(
    new CustomEvent('replication:sync-failed', {
      detail: {
        count: 1,
        mutations: [
          {
            id: 'mut-1',
            tableName: 'shows',
            operation: 'INSERT',
            error: "new row violates row-level security policy for table 'shows'",
          },
        ],
        message: '',
      },
    })
  );
}

describe('ReplicationSyncProvider — replication:sync-failed listener', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.dismiss).mockClear();
    retryFailedMutationMock.mockClear();
    discardFailedMutationMock.mockClear();
  });

  it('surfaces a persistent toast with Retry/Discard when a sync-failed event fires', () => {
    renderProvider();

    act(() => {
      dispatchSyncFailed();
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "Failed to save 1 change. shows insert: new row violates row-level security policy for table 'shows'",
      expect.objectContaining({
        duration: Infinity,
        action: expect.objectContaining({ label: 'Retry' }),
        cancel: expect.objectContaining({ label: 'Discard' }),
      })
    );
  });

  it('Retry re-queues the failed mutations and dismisses the toast', () => {
    renderProvider();

    act(() => {
      dispatchSyncFailed();
    });

    const options = vi.mocked(toast.error).mock.calls[0]?.[1] as ToastOptions;
    act(() => {
      options.action!.onClick();
    });

    expect(retryFailedMutationMock).toHaveBeenCalledWith('mut-1');
    expect(toast.dismiss).toHaveBeenCalledWith('sync-failed:mut-1');
  });

  it('Discard removes the failed mutations and dismisses the toast', () => {
    renderProvider();

    act(() => {
      dispatchSyncFailed();
    });

    const options = vi.mocked(toast.error).mock.calls[0]?.[1] as ToastOptions;
    act(() => {
      options.cancel!.onClick();
    });

    expect(discardFailedMutationMock).toHaveBeenCalledWith('mut-1');
    expect(retryFailedMutationMock).not.toHaveBeenCalled();
    expect(toast.dismiss).toHaveBeenCalledWith('sync-failed:mut-1');
  });

  it('removes the listener on unmount so late events do not toast', () => {
    const { unmount } = renderProvider();
    unmount();

    act(() => {
      dispatchSyncFailed();
    });

    expect(toast.error).not.toHaveBeenCalled();
  });
});
