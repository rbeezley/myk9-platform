/**
 * MYK9-134 — the invitation must report what actually happened.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useSendUserInvitation } from './useSendUserInvitation';
import { mockSupabase } from '@/test/mocks/supabase';
import { notifications } from '@/lib/notifications';

vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn() },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const ARGS = {
  personId: 'p1',
  email: 'pat@example.test',
  firstName: 'Pat',
  roleNames: ['secretary'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.functions.invoke.mockReset();
  mockSupabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('useSendUserInvitation', () => {
  it('calls admin-invite-user with the saved identity details', async () => {
    const { result } = renderHook(() => useSendUserInvitation(), { wrapper });

    act(() => result.current.sendInvitation(ARGS));

    await waitFor(() =>
      expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('admin-invite-user', {
        body: { email: 'pat@example.test', firstName: 'Pat', roleLabels: ['secretary'] },
      })
    );
  });

  it('says "invitation" for a first-time invite', async () => {
    mockSupabase.functions.invoke.mockResolvedValue({
      data: { outcome: 'invited' },
      error: null,
    });
    const { result } = renderHook(() => useSendUserInvitation(), { wrapper });

    act(() => result.current.sendInvitation(ARGS));

    await waitFor(() =>
      expect(notifications.success).toHaveBeenCalledWith(
        expect.stringMatching(/invitation sent to pat@example\.test/i)
      )
    );
  });

  it('says "sign-in link" when the address already had an account', async () => {
    // The outcome the edge function reports back; claiming "invitation sent"
    // here would be the MYK9-131 failure all over again.
    mockSupabase.functions.invoke.mockResolvedValue({
      data: { outcome: 'reinvited' },
      error: null,
    });
    const { result } = renderHook(() => useSendUserInvitation(), { wrapper });

    act(() => result.current.sendInvitation(ARGS));

    await waitFor(() =>
      expect(notifications.success).toHaveBeenCalledWith(
        expect.stringMatching(/sign-in link sent/i)
      )
    );
  });

  it('refuses to call the function when there is no email on file', async () => {
    const { result } = renderHook(() => useSendUserInvitation(), { wrapper });

    act(() => result.current.sendInvitation({ ...ARGS, email: null }));

    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(
        expect.stringMatching(/add an email address/i)
      )
    );
    expect(mockSupabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('reports a failure as a failure', async () => {
    mockSupabase.functions.invoke.mockResolvedValue({
      data: null,
      error: new Error('boom'),
    });
    const { result } = renderHook(() => useSendUserInvitation(), { wrapper });

    act(() => result.current.sendInvitation(ARGS));

    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(expect.stringMatching(/could not send/i))
    );
    expect(notifications.success).not.toHaveBeenCalled();
  });

  it('does not send twice on a double click', async () => {
    // isPending lags a render behind, so the component-level guard is a ref.
    const { result } = renderHook(() => useSendUserInvitation(), { wrapper });

    act(() => {
      result.current.sendInvitation(ARGS);
      result.current.sendInvitation(ARGS);
    });

    await waitFor(() => expect(notifications.success).toHaveBeenCalled());
    expect(mockSupabase.functions.invoke).toHaveBeenCalledTimes(1);
  });
});
