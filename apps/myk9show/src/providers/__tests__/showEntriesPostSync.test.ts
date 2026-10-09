import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queryClient';
import {
  invalidatePostSyncQueries,
  refetchShowEntriesAfterScopedSync,
} from '../showEntriesPostSync';

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const showEntriesFn = vi.fn().mockResolvedValue([]);
  const showFn = vi.fn().mockResolvedValue({});
  queryClient.setQueryDefaults(queryKeys.showEntries('s1'), { staleTime: 60_000 });
  return { queryClient, showEntriesFn, showFn };
}

async function mountObservers(s: ReturnType<typeof setup>): Promise<() => void> {
  const { QueryObserver } = await import('@tanstack/react-query');
  const a = new QueryObserver(s.queryClient, {
    queryKey: queryKeys.showEntries('s1'),
    queryFn: s.showEntriesFn,
  });
  const b = new QueryObserver(s.queryClient, { queryKey: ['shows', 's1'], queryFn: s.showFn });
  const unsubs = [a.subscribe(() => undefined), b.subscribe(() => undefined)];
  await new Promise(resolve => setTimeout(resolve, 20));
  return () => unsubs.forEach(u => u());
}

describe('post-sync show entries refetch (MYK9-1066)', () => {
  it('a shows-table sync refreshes show queries but not the show entries read', async () => {
    const s = setup();
    const stop = await mountObservers(s);
    expect(s.showEntriesFn).toHaveBeenCalledTimes(1);

    await invalidatePostSyncQueries(s.queryClient, ['shows']);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(s.showFn).toHaveBeenCalledTimes(2);
    expect(s.showEntriesFn).toHaveBeenCalledTimes(1);
    stop();
  });

  it('a scoped entries pass plus the table invalidation reads show entries exactly once more', async () => {
    const s = setup();
    const stop = await mountObservers(s);

    await invalidatePostSyncQueries(s.queryClient, ['entries', 'shows']);
    refetchShowEntriesAfterScopedSync(s.queryClient, [{ name: 'entries', scope: 's1' }]);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(s.showEntriesFn).toHaveBeenCalledTimes(2);
    stop();
  });
});
