/**
 * MYK9-429 AC1 (no exhibitor query serves the previous account from cache) and
 * AC4 (offline-first behaviour is unchanged for a single user across a cold
 * boot and a token refresh).
 *
 * The two acceptance criteria pull in opposite directions, which is the whole
 * difficulty: clear too eagerly and every page load and token refresh throws
 * away data an offline user still needs; clear too late and the next account
 * reads the last one's rows. So both directions are asserted here.
 *
 * The token-refresh half of AC4 is NOT here, deliberately. A refresh changes no
 * prop this hook receives, so a re-render does not even re-run its effect and an
 * assertion about it would pass no matter what the hook did. Whether a refresh
 * survives is decided by what AuthProvider derives and passes, and is asserted
 * in `test/auth/AuthContext.queryCacheBoundary.test.tsx`.
 */
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useClearQueryCacheOnAccountChange } from './useClearQueryCacheOnAccountChange';
import { viewerScope } from '@/lib/viewerScopedQueryKey';

const CACHED_KEY = ['exhibitor', 'my-payments', viewerScope('viewer-1'), 'all'] as const;

function setup(initial: { authReady: boolean; userId: string | null }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const view = renderHook(props => useClearQueryCacheOnAccountChange(props), {
    wrapper,
    initialProps: initial,
  });

  return { queryClient, ...view };
}

function seedCache(queryClient: QueryClient) {
  queryClient.setQueryData(CACHED_KEY, [{ reference: 'pi_first_viewer' }]);
  expect(queryClient.getQueryData(CACHED_KEY)).toBeDefined();
}

describe('useClearQueryCacheOnAccountChange', () => {
  it('clears the cache when a different account signs in on the same tab', () => {
    const { queryClient, rerender } = setup({ authReady: true, userId: 'viewer-1' });
    seedCache(queryClient);

    rerender({ authReady: true, userId: 'viewer-2' });

    expect(queryClient.getQueryData(CACHED_KEY)).toBeUndefined();
  });

  it('clears the cache on sign-out, before anyone else can sign in', () => {
    const { queryClient, rerender } = setup({ authReady: true, userId: 'viewer-1' });
    seedCache(queryClient);

    rerender({ authReady: true, userId: null });

    expect(queryClient.getQueryData(CACHED_KEY)).toBeUndefined();
  });

  it('keeps the cache across a cold boot that restores the same session', () => {
    // The offline cold-boot path: auth starts unresolved with no user, then the
    // stored session settles on an id. That null -> id transition is a restore,
    // not a switch of accounts, and the pre-restore null must not be taken as a
    // baseline to compare against - otherwise every page load empties the cache.
    // Seeded BEFORE the transition on purpose: seeding after it would leave an
    // over-eager clear nothing to destroy, and the test would pass either way.
    const { queryClient, rerender } = setup({ authReady: false, userId: null });
    seedCache(queryClient);

    rerender({ authReady: true, userId: 'viewer-1' });

    expect(queryClient.getQueryData(CACHED_KEY)).toEqual([{ reference: 'pi_first_viewer' }]);
  });

  it('still clears when a second account arrives after a cold boot', () => {
    // The baseline must be recorded, not skipped: the boot user is remembered,
    // so the NEXT identity is a change.
    const { queryClient, rerender } = setup({ authReady: false, userId: null });
    rerender({ authReady: true, userId: 'viewer-1' });
    seedCache(queryClient);

    rerender({ authReady: true, userId: 'viewer-2' });

    expect(queryClient.getQueryData(CACHED_KEY)).toBeUndefined();
  });
});
