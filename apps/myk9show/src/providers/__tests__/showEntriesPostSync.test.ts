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
  it('an unscoped pass touching shows refetches a mounted show-entries query once', async () => {
    const s = setup();
    const stop = await mountObservers(s);
    expect(s.showEntriesFn).toHaveBeenCalledTimes(1);

    await invalidatePostSyncQueries(s.queryClient, ['shows']);
    refetchShowEntriesAfterScopedSync(s.queryClient, []);
    await new Promise(resolve => setTimeout(resolve, 30));

    expect(s.showEntriesFn).toHaveBeenCalledTimes(2);
    stop();
  });

  it('a pass with a scoped entries target for the show refetches it once, not twice', async () => {
    const s = setup();
    const stop = await mountObservers(s);
    const succeeded = [
      { name: 'entries', scope: 's1' },
      { name: 'shows', scope: '' },
    ];

    await invalidatePostSyncQueries(s.queryClient, ['entries', 'shows'], succeeded);
    refetchShowEntriesAfterScopedSync(s.queryClient, succeeded);
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(s.showEntriesFn).toHaveBeenCalledTimes(2);
    expect(s.showFn).toHaveBeenCalledTimes(2);
    stop();
  });

  it('a scoped pass for another show still refetches this show through the prefix', async () => {
    const s = setup();
    const stop = await mountObservers(s);
    const succeeded = [
      { name: 'entries', scope: 's2' },
      { name: 'shows', scope: '' },
    ];

    await invalidatePostSyncQueries(s.queryClient, ['entries', 'shows'], succeeded);
    await new Promise(resolve => setTimeout(resolve, 30));

    expect(s.showEntriesFn).toHaveBeenCalledTimes(2);
    stop();
  });
});
