import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clubFirstShowStateQueryKey } from '../firstShowClub';
import type { ReactNode } from 'react';
import { useFirstShowClub } from '../firstShowClub';
import { ScopeType, UserRole } from '@/types/auth-types';

const harness = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: harness.rpc } }));

const scope = (scopeId: string) => ({
  scopeType: ScopeType.CLUB,
  scopeId,
  roleId: UserRole.CLUB_ADMIN,
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function answers(byClub: Record<string, unknown>) {
  harness.rpc.mockImplementation((_name: string, args: { p_club_id: string }) => {
    const answer = byClub[args.p_club_id];
    return Promise.resolve(
      answer instanceof Error
        ? { data: null, error: answer }
        : { data: answer ?? null, error: null }
    );
  });
}

beforeEach(() => {
  harness.rpc.mockReset();
});

describe('useFirstShowClub (MYK9-2199)', () => {
  it('asks the server with club_first_show_state and offers the draft', async () => {
    answers({ 'club-1': { published_ever: false, draft_show_id: 'show-7' } });
    const { result } = renderHook(() => useFirstShowClub([scope('club-1')]), { wrapper });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(harness.rpc).toHaveBeenCalledWith('club_first_show_state', { p_club_id: 'club-1' });
    expect(result.current).toEqual({ clubId: 'club-1', draftShowId: 'show-7' });
  });

  it('is null for a club that has published, and moves on to the next club', async () => {
    answers({
      'club-1': { published_ever: true, draft_show_id: null },
      'club-2': { published_ever: false, draft_show_id: null },
    });
    const { result } = renderHook(() => useFirstShowClub([scope('club-1'), scope('club-2')]), {
      wrapper,
    });
    await waitFor(() => expect(result.current?.clubId).toBe('club-2'));
  });

  it('is null when every club has published', async () => {
    answers({ 'club-1': { published_ever: true, draft_show_id: 'show-7' } });
    const { result } = renderHook(() => useFirstShowClub([scope('club-1')]), { wrapper });
    await waitFor(() => expect(harness.rpc).toHaveBeenCalled());
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('shows nothing while the answer is still loading', () => {
    harness.rpc.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useFirstShowClub([scope('club-1')]), { wrapper });
    expect(result.current).toBeNull();
  });

  it('shows no card when the call fails, and carries on to the next club', async () => {
    answers({
      'club-1': new Error('boom'),
      'club-2': { published_ever: false, draft_show_id: null },
    });
    const { result } = renderHook(() => useFirstShowClub([scope('club-1'), scope('club-2')]), {
      wrapper,
    });
    await waitFor(() => expect(result.current?.clubId).toBe('club-2'));
  });

  it('shows no card for a failed club on its own', async () => {
    answers({ 'club-1': new Error('boom') });
    const { result } = renderHook(() => useFirstShowClub([scope('club-1')]), { wrapper });
    await waitFor(() => expect(harness.rpc).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(result.current).toBeNull();
  });

  it("hides a warm-cache answer when this visit's recheck fails", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(clubFirstShowStateQueryKey('club-1'), {
      publishedEver: false,
      draftShowId: 'show-7',
    });
    answers({ 'club-1': new Error('boom') });
    const warmWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useFirstShowClub([scope('club-1')]), {
      wrapper: warmWrapper,
    });
    await waitFor(() => expect(harness.rpc).toHaveBeenCalled());
    await waitFor(() =>
      expect(client.getQueryState(clubFirstShowStateQueryKey('club-1'))?.status).toBe('error')
    );
    expect(result.current).toBeNull();
  });

  it('shows the fresh answer once the recheck succeeds over a warm cache', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(clubFirstShowStateQueryKey('club-1'), {
      publishedEver: false,
      draftShowId: 'old-draft',
    });
    answers({ 'club-1': { published_ever: false, draft_show_id: 'show-8' } });
    const warmWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useFirstShowClub([scope('club-1')]), {
      wrapper: warmWrapper,
    });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.draftShowId).toBe('show-8'));
  });
});
