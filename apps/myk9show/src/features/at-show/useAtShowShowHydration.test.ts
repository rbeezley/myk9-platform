import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { useAtShowShowHydration } from './useAtShowShowHydration';

const IDLE_STATUS = {
  isSyncing: false,
  lastSyncAt: null,
} as unknown as ReplicationSyncContextValue['status'];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useAtShowShowHydration', () => {
  it('reports not-pending for the current show when an earlier show settles last', async () => {
    const a = deferred();
    const b = deferred();
    const refresh = vi.fn<(forceSync: boolean) => Promise<void>>();
    refresh.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

    const { result, rerender } = renderHook(
      ({ showId }: { showId: string }) => useAtShowShowHydration(showId, IDLE_STATUS, refresh),
      { initialProps: { showId: 'A' } }
    );
    expect(result.current).toBe(true);

    rerender({ showId: 'B' });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(true);

    await act(async () => {
      b.resolve();
      await b.promise;
    });
    expect(result.current).toBe(false);

    await act(async () => {
      a.resolve();
      await a.promise;
    });
    expect(result.current).toBe(false);
  });
});
