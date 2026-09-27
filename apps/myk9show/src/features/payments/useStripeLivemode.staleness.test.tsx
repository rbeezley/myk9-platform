import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const maybeSingle = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ limit: () => ({ maybeSingle }) }) }) },
}));
vi.mock('@/lib/queryClient', () => ({ cacheStrategies: { moderate: {} } }));

import { useStripeLivemode } from './useClubStripeAccount';

// MYK9-750 (#2270 review): nothing can invalidate an already-open client at the
// MYK9-11 live-mode cutover, so the cache itself must not outlive the flip for
// long. A client that looked up livemode before the cutover has to re-read it
// on its next mount or focus within minutes, not after half an hour of
// checking the club's TEST-mode account (blocking publish, hiding card pay).
describe('useStripeLivemode staleness', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'));
    maybeSingle.mockReset();
    maybeSingle.mockResolvedValue({ data: { stripe_livemode: false }, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-reads platform_settings on a new mount ten minutes after the last read', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const first = renderHook(() => useStripeLivemode(), { wrapper });
    await waitFor(() => expect(first.result.current.data).toBe(false));
    expect(maybeSingle).toHaveBeenCalledTimes(1);

    // The cutover flips the setting; this client is still open.
    maybeSingle.mockResolvedValue({ data: { stripe_livemode: true }, error: null });
    vi.setSystemTime(new Date('2026-10-01T12:10:00Z'));

    const second = renderHook(() => useStripeLivemode(), { wrapper });
    await waitFor(() => expect(second.result.current.data).toBe(true));
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });
});
