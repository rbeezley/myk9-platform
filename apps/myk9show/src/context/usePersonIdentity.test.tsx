/**
 * The durable person pairing must survive exactly as long as the roles it
 * pairs with (LESSONS offline-identity-pairing), stay fresh while the app is
 * open, and not forget a confirmed identity because one background poll
 * failed. Claude review of #2381 (MYK9-601), findings P1-P3.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePersonIdentity } from './usePersonIdentity';
import { loadPersonIdentityCache, savePersonIdentityCache } from './personIdentityCache';
import { RBAC_CACHE_TTL_MS } from './rbacPermissionsCache';

const maybeSingle = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  },
}));

const USER_ID = 'user-1';
const PERSON_ID = 'person-1';
const DAY_MS = 24 * 60 * 60 * 1000;
const profile = {
  id: PERSON_ID,
  first_name: 'Pat',
  last_name: 'Exhibitor',
  email: 'pat@example.com',
  status: 'active',
};

function renderIdentity(queryClient: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => usePersonIdentity(USER_ID), { wrapper });
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('usePersonIdentity durable pairing', () => {
  beforeEach(() => {
    localStorage.clear();
    maybeSingle.mockReset();
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    vi.useRealTimers();
  });

  it('resolves personId offline from a pairing saved three days ago (a show weekend)', () => {
    const now = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now - 3 * DAY_MS);
    savePersonIdentityCache(USER_ID, PERSON_ID);
    vi.setSystemTime(now);
    onlineManager.setOnline(false);

    const { result } = renderIdentity(newClient());

    expect(maybeSingle).not.toHaveBeenCalled();
    expect(result.current.personId).toBe(PERSON_ID);
    expect(result.current.personIdentityState).toBe('unresolved');
  });

  it('ignores a pairing older than the roles cache it pairs with', () => {
    const now = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now - RBAC_CACHE_TTL_MS - 1);
    savePersonIdentityCache(USER_ID, PERSON_ID);
    vi.setSystemTime(now);
    onlineManager.setOnline(false);

    const { result } = renderIdentity(newClient());

    expect(result.current.personId).toBeNull();
  });

  it('refreshes cachedAt on every successful lookup, not once per mount', async () => {
    const start = Date.parse('2099-10-09T12:00:00Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(start);
    maybeSingle.mockResolvedValue({ data: profile, error: null });
    const queryClient = newClient();
    renderIdentity(queryClient);

    await waitFor(() =>
      expect(loadPersonIdentityCache(USER_ID)?.cachedAt).toBe(new Date(start).toISOString())
    );

    const later = start + 2 * 60 * 60 * 1000;
    vi.setSystemTime(later);
    await act(() => queryClient.refetchQueries({ queryKey: ['userProfile', USER_ID] }));

    await waitFor(() =>
      expect(loadPersonIdentityCache(USER_ID)?.cachedAt).toBe(new Date(later).toISOString())
    );
  });

  it('keeps a confirmed identity resolved when a later background refetch fails', async () => {
    maybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    const queryClient = newClient();
    const { result } = renderIdentity(queryClient);

    await waitFor(() => expect(result.current.personIdentityState).toBe('resolved'));

    maybeSingle.mockResolvedValueOnce({ data: null, error: { code: '08006', message: 'network' } });
    await act(() => queryClient.refetchQueries({ queryKey: ['userProfile', USER_ID] }));
    await waitFor(() =>
      expect(queryClient.getQueryState(['userProfile', USER_ID])?.status).toBe('error')
    );

    expect(result.current.personIdentityState).toBe('resolved');
    expect(result.current.personId).toBe(PERSON_ID);
  });

  it('keeps a confirmed missing person missing when a later refetch fails', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const queryClient = newClient();
    const { result } = renderIdentity(queryClient);

    await waitFor(() => expect(result.current.personIdentityState).toBe('missing'));

    maybeSingle.mockResolvedValueOnce({ data: null, error: { code: '08006', message: 'network' } });
    await act(() => queryClient.refetchQueries({ queryKey: ['userProfile', USER_ID] }));
    await waitFor(() =>
      expect(queryClient.getQueryState(['userProfile', USER_ID])?.status).toBe('error')
    );

    expect(result.current.personIdentityState).toBe('missing');
    expect(result.current.personId).toBeNull();
  });
});

describe('usePersonIdentity refresh cadence (MYK9-1308)', () => {
  beforeEach(() => {
    localStorage.clear();
    maybeSingle.mockReset();
    maybeSingle.mockResolvedValue({ data: profile, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not poll: no refetch after five idle minutes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderIdentity(newClient());
    await waitFor(() => expect(result.current.personIdentityState).toBe('resolved'));
    expect(maybeSingle).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it('refetches on window focus once the data is stale, and picks up a suspension', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
    const { result } = renderIdentity(queryClient);
    await waitFor(() => expect(result.current.personIdentityState).toBe('resolved'));

    maybeSingle.mockResolvedValue({ data: { ...profile, status: 'suspended' }, error: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
    });
    await waitFor(() => expect(result.current.userProfile?.status).toBe('suspended'));
    expect(maybeSingle).toHaveBeenCalledTimes(2);
    expect(result.current.personIdentityState).toBe('resolved');
  });
});
