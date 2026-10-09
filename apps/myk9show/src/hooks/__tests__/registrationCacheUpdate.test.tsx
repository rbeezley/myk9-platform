import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-1071 review round 2: every registration write goes through ONE cache
 * update that MERGES into the registrations list AND every dog read carrying
 * registrations (the entry wizard's class step reads the dog roster).
 */
const { replica, dogsReplica } = vi.hoisted(() => ({
  replica: { addRegistration: vi.fn(), getRegistrationsForDog: vi.fn() },
  dogsReplica: { getDogById: vi.fn(), getPendingMutationIdsForRow: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: replica,
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({ replicatedDogsTable: dogsReplica }));

import { useQueuedRegistrationWrites } from '@/hooks/useQueuedRegistrationWrites';
import { applyRegistrationCacheUpdate } from '@/hooks/registrationCacheUpdate';
import { queryKeys } from '@/lib/queryClient';

const akc = {
  id: 'r1',
  dog_id: 'dog-1',
  organization: 'AKC',
  registration_number: 'A1',
  registered_name: 'Old',
};
const ukc = { id: 'r2', dog_id: 'dog-1', organization: 'UKC', registration_number: 'U1' };
const added = { id: 'r3', dog_id: 'dog-1', organization: 'ASCA', registration_number: 'S1' };

function seeded() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, networkMode: 'online' } },
  });
  // The roster as the class step reads it: dog rows carrying registrations.
  client.setQueryData(
    [...queryKeys.dogs, 'roster'],
    [
      { id: 'dog-1', call_name: 'Bea', registrations: [akc, ukc] },
      { id: 'dog-2', call_name: 'Other', registrations: [] },
    ]
  );
  client.setQueryData(queryKeys.registrationsByDog('dog-1'), [akc, ukc]);
  return client;
}

describe('registration cache update (MYK9-1071 round 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dogsReplica.getDogById.mockResolvedValue({ id: 'dog-1' });
    replica.addRegistration.mockResolvedValue({ id: 'r3' });
    replica.getRegistrationsForDog.mockResolvedValue([added]);
  });

  it('an offline add shows in the dog roster the class step reads, and in the list', async () => {
    const client = seeded();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useQueuedRegistrationWrites(), { wrapper });

    await act(async () => {
      await result.current.addRegistration('dog-1', {
        organization: 'ASCA',
        registrationNumber: 'S1',
      });
    });

    const roster = client.getQueryData<Array<{ id: string; registrations: unknown[] }>>([
      ...queryKeys.dogs,
      'roster',
    ]);
    expect(roster?.[0]?.registrations).toEqual([akc, ukc, added]);
    expect(roster?.[1]?.registrations).toEqual([]);
    expect(client.getQueryData(queryKeys.registrationsByDog('dog-1'))).toEqual([akc, ukc, added]);
  });

  it('an edit merges into what the caches hold and keeps every unedited registration', () => {
    const client = seeded();
    applyRegistrationCacheUpdate(client, { upsert: [{ ...akc, registered_name: 'New' }] });
    expect(client.getQueryData(queryKeys.registrationsByDog('dog-1'))).toEqual([
      { ...akc, registered_name: 'New' },
      ukc,
    ]);
  });

  it('a re-pull removal drops only that row; a mirror of a held registration is not duplicated', () => {
    const client = seeded();
    applyRegistrationCacheUpdate(client, {
      upsert: [{ id: 'mirror', dog_id: 'dog-1', organization: 'UKC', registration_number: 'U1' }],
      remove: [{ id: 'r1', dogId: 'dog-1' }],
    });
    expect(client.getQueryData(queryKeys.registrationsByDog('dog-1'))).toEqual([ukc]);
  });
});
