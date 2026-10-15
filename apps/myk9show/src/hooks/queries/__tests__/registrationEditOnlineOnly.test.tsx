/**
 * Registration EDITS are online-only (MYK9-1090, narrowed after six Codex
 * rounds of concurrency P1s in the offline edit path). Online, an edit of a
 * server-backed row goes straight to the server. Offline, or while the row
 * has unsent work on this device, it is refused before anything is written.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { databaseManager, NOTIFY_DEBOUNCE_MS } from '@myk9/replication';
import { createTestQueryClient, renderHook, waitFor } from '@/test/utils/testUtils';
import { useUpdateRegistrationMutation } from '@/hooks/queries/useRegistrationsDatabase';
import { replicatedDogRegistrationsTable as table } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { REGISTRATION_STILL_SAVING } from '@/services/database/registrations/editGuard';
import { serverRow } from '@/services/replication/__tests__/dogRegistrationFixtures';
import {
  createRegistrationQueueHarness,
  setDeviceOnline,
  type RegistrationQueueHarness,
} from '@/services/replication/__tests__/registrationQueueHarness';

const direct = vi.hoisted(() => ({ updateRegistration: vi.fn() }));
vi.mock('@/services/database/registrations', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/registrations')>()),
  updateRegistration: direct.updateRegistration,
}));

let queue: RegistrationQueueHarness;

function renderEdit() {
  const queryClient = createTestQueryClient();
  return renderHook(() => useUpdateRegistrationMutation(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(async () => {
  await databaseManager.reset();
  queue = createRegistrationQueueHarness();
  direct.updateRegistration.mockReset();
  direct.updateRegistration.mockResolvedValue({
    data: { id: 'reg-1', registered_name: 'New' },
    error: null,
  });
  await table.applyServerRows([serverRow({ id: 'reg-1', registered_name: 'Old', version: 3 })]);
  setDeviceOnline(true);
});

afterEach(async () => {
  await new Promise(resolve => setTimeout(resolve, NOTIFY_DEBOUNCE_MS + 50));
  setDeviceOnline(true);
  await queue.destroy();
  await databaseManager.reset();
});

describe('a registration edit', () => {
  it('online, goes straight to the server and queues nothing', async () => {
    const { result } = renderEdit();

    await act(async () => {
      await result.current.mutateAsync({ id: 'reg-1', updates: { registered_name: 'New' } });
    });

    expect(direct.updateRegistration).toHaveBeenCalledWith('reg-1', { registered_name: 'New' });
    expect(await queue.pending()).toEqual([]);
  });

  it('offline, is refused with nothing written or queued', async () => {
    setDeviceOnline(false);
    const { result } = renderEdit();

    act(() => result.current.mutate({ id: 'reg-1', updates: { registered_name: 'New' } }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(String(result.current.error)).toMatch(/Reconnect to save registration changes/);
    expect(direct.updateRegistration).not.toHaveBeenCalled();
    expect(await queue.pending()).toEqual([]);
    expect(await table.getReplicatedRow('reg-1')).toMatchObject({
      isDirty: false,
      data: { registeredName: 'Old' },
    });
  });

  it('of an add that has not been confirmed, is refused even online', async () => {
    // addRegistration arms the manager's 100ms auto-upload. Once the device is
    // online that timer would upload (confirm) the INSERT, and on a slow run it
    // fires before the assertions: the add is then no longer unconfirmed. The
    // test needs the INSERT to stay queued, so the upload is held off.
    vi.spyOn(queue.manager, 'uploadPendingMutations').mockResolvedValue([]);
    setDeviceOnline(false);
    const added = await table.addRegistration({ dog_id: 'dog-1', registration_number: 'N1' });
    setDeviceOnline(true);
    const { result } = renderEdit();

    act(() => result.current.mutate({ id: added.id, updates: { registered_name: 'New' } }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(String(result.current.error)).toContain(REGISTRATION_STILL_SAVING);
    expect(direct.updateRegistration).not.toHaveBeenCalled();
    expect((await queue.pending()).map(m => m.operation)).toEqual(['INSERT']);
  });
});
