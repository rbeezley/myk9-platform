import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-1071: a registration added from the add-entry flow is queued through the
 * replication mutation queue, so it survives a show-desk connection drop. It
 * used to go straight to PostgREST.
 */
const { replica, dogsReplica, mutateAsync } = vi.hoisted(() => ({
  replica: {
    addRegistration: vi.fn(),
    isCold: vi.fn(),
    getRegistrationsForDog: vi.fn(),
  },
  dogsReplica: { getDogById: vi.fn(), getPendingMutationIdsForRow: vi.fn() },
  mutateAsync: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: replica,
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: dogsReplica,
}));
vi.mock('@/hooks/queries/useRegistrationsDatabase', () => ({
  useCreateRegistrationMutation: () => ({ mutateAsync }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useInlineDogRegistration } from './useInlineDogRegistration';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useInlineDogRegistration queues the add (MYK9-1071)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replica.addRegistration.mockResolvedValue({ id: 'reg-new' });
    replica.isCold.mockResolvedValue(false);
    replica.getRegistrationsForDog.mockResolvedValue([]);
    dogsReplica.getDogById.mockResolvedValue({ id: 'dog-1', _localOnly: true });
    dogsReplica.getPendingMutationIdsForRow.mockResolvedValue(['dog-insert']);
  });

  it('queues the registration behind the local dog INSERT and never writes directly', async () => {
    const onSaved = vi.fn();
    const { result } = renderHook(() => useInlineDogRegistration(onSaved), { wrapper });
    act(() => result.current.openRegistrationEditor('dog-1'));

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.saveRegistration({
        id: 'form-row',
        organization: 'UKC',
        registeredName: 'Official Name',
        registrationNumber: 'UKC-123',
        breed: 'Beagle',
        variety: '13 inch',
        status: 'Active',
        registrationDate: '2026-08-21',
      });
    });

    expect(saved).toBe(true);
    expect(replica.addRegistration).toHaveBeenCalledWith(
      'dog-1',
      expect.objectContaining({
        organization: 'UKC',
        registrationNumber: 'UKC-123',
        registeredName: 'Official Name',
        breed: 'Beagle',
        variety: '13 inch',
        status: 'Active',
        registrationDate: '2026-08-21',
      }),
      { dependsOn: ['dog-insert'] }
    );
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });
});
