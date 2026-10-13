import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-1090 (plan-offline-record-edits §5): edits to an existing person are
 * online-only. Offline, a save is refused at once with the reconnect message:
 * it is not queued, not sent, and does not sit as a paused mutation.
 */
const { rpc, from, queueMutation } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  queueMutation: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/supabaseClient')>()),
  supabase: { rpc, from },
}));
vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: { queueMutation },
}));

import { useUpdatePerson } from '@/hooks/useUsers';
import { useUpdateUserMutation } from '@/hooks/queries/useUsersQuery';
import type { User } from '@/types/user-types';
import {
  PERSON_EDIT_NEEDS_CONNECTION_CODE,
  PERSON_EDIT_NEEDS_CONNECTION_MESSAGE,
} from '@/utils/signInEmailMessages';

function goOffline() {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
  // React Query's own view of the network, which pauses an 'online' mutation.
  onlineManager.setOnline(false);
}

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const REFUSAL = {
  code: PERSON_EDIT_NEEDS_CONNECTION_CODE,
  message: PERSON_EDIT_NEEDS_CONNECTION_MESSAGE,
};

afterEach(() => {
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('person saves offline (MYK9-1090)', () => {
  it('useUpdatePerson refuses with the reconnect message and sends or queues nothing', async () => {
    goOffline();
    const { result } = renderHook(() => useUpdatePerson(), { wrapper: makeWrapper() });

    act(() => {
      result.current.mutate({ id: 'person-1', firstName: 'Pat', lastName: 'Owner' } as User);
    });

    // A paused mutation never errors; the refusal must reach the caller.
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isPaused).toBe(false);
    expect(result.current.error).toMatchObject(REFUSAL);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(queueMutation).not.toHaveBeenCalled();
  });

  it('useUpdateUserMutation refuses with the reconnect message instead of pausing', async () => {
    goOffline();
    const { result } = renderHook(() => useUpdateUserMutation(), { wrapper: makeWrapper() });

    act(() => {
      result.current.mutate({ id: 'person-1', updates: { phone: '555' } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isPaused).toBe(false);
    expect(result.current.error).toMatchObject(REFUSAL);
    expect(rpc).not.toHaveBeenCalled();
    expect(queueMutation).not.toHaveBeenCalled();
  });
});
