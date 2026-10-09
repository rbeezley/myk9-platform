import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-1071 (owner decision, review round 2): edits to an existing person are
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
import type { User } from '@/types/user-types';
import {
  PERSON_EDIT_NEEDS_CONNECTION_CODE,
  PERSON_EDIT_NEEDS_CONNECTION_MESSAGE,
} from '@/utils/signInEmailMessages';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useUpdatePerson offline (MYK9-1071)', () => {
  it('refuses with the reconnect message and sends or queues nothing', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdatePerson(), { wrapper });

    let failure: unknown;
    await act(async () => {
      failure = await result.current
        .mutateAsync({ id: 'person-1', firstName: 'Pat', lastName: 'Owner' } as User)
        .catch((error: unknown) => error);
    });

    expect(failure).toMatchObject({
      code: PERSON_EDIT_NEEDS_CONNECTION_CODE,
      message: PERSON_EDIT_NEEDS_CONNECTION_MESSAGE,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(queueMutation).not.toHaveBeenCalled();
  });
});
