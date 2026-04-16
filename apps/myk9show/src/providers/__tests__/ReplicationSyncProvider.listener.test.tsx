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

vi.mock('@/hooks/useStoreSubscriptions', () => ({
  useStoreSubscriptions: () => undefined,
}));

vi.mock(import('@myk9/replication'), async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    MutationManager: class {
      uploadPendingMutations = vi.fn().mockResolvedValue([]);
      getPendingCount = vi.fn().mockResolvedValue(0);
      restoreMutationsFromLocalStorage = vi.fn().mockResolvedValue(undefined);
    } as unknown as typeof actual.MutationManager,
  };
});

import { ReplicationSyncProvider } from '../ReplicationSyncProvider';
import { notifications } from '@/lib/notifications';

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

describe('ReplicationSyncProvider — replication:sync-failed listener', () => {
  beforeEach(() => {
    vi.mocked(notifications.error).mockClear();
  });

  it('surfaces a toast when a sync-failed event fires while mounted', () => {
    renderProvider();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('replication:sync-failed', {
          detail: {
            count: 1,
            mutations: [
              {
                tableName: 'shows',
                operation: 'INSERT',
                error: "new row violates row-level security policy for table 'shows'",
              },
            ],
            message: '',
          },
        })
      );
    });

    expect(notifications.error).toHaveBeenCalledTimes(1);
    expect(notifications.error).toHaveBeenCalledWith(
      "Failed to save 1 change. shows insert: new row violates row-level security policy for table 'shows'"
    );
  });

  it('removes the listener on unmount so late events do not toast', () => {
    const { unmount } = renderProvider();
    unmount();

    act(() => {
      window.dispatchEvent(
        new CustomEvent('replication:sync-failed', {
          detail: {
            count: 2,
            mutations: [{ tableName: 'trials', operation: 'INSERT' }],
            message: '',
          },
        })
      );
    });

    expect(notifications.error).not.toHaveBeenCalled();
  });
});
