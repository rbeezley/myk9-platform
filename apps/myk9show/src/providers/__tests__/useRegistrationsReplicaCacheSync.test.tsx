/**
 * The one refresh rule for registrations (MYK9-1090, plan §2): any change to
 * the replica refetches the registration reads, and a queued write lands in
 * the replica so the dog page shows it without a sync.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { databaseManager, NOTIFY_DEBOUNCE_MS } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import { createTestQueryClient, render, renderHook, screen, waitFor } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import RegistrationsSection from '@/components/dogs/DogDetails/Registrations/RegistrationsSection';
import type { Dog } from '@/types/dog-types';
import { serverRow } from '@/services/replication/__tests__/dogRegistrationFixtures';
import { useRegistrationsByDogQuery } from '@/hooks/queries/useRegistrationsDatabase';
import { useRegistrationsReplicaCacheSync } from '../useRegistrationsReplicaCacheSync';

const READER_KEYS = [
  queryKeys.registrationsByDog('dog-1'),
  queryKeys.dogs,
  queryKeys.dogRegistrations('dog-1'),
  queryKeys.personDogs('owner-1'),
] as const;

function mountListener(): QueryClient {
  const queryClient = createTestQueryClient();
  for (const key of READER_KEYS) queryClient.setQueryData(key, ['cached']);
  renderHook(() => useRegistrationsReplicaCacheSync(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return queryClient;
}

function invalidated(queryClient: QueryClient): boolean[] {
  return READER_KEYS.map(key => queryClient.getQueryState(key)?.isInvalidated ?? false);
}

beforeEach(async () => {
  await databaseManager.reset();
});

afterEach(async () => {
  // The shared table's trailing change notice fires NOTIFY_DEBOUNCE_MS after
  // a write; let it land here, not inside the next test.
  await new Promise(resolve => setTimeout(resolve, NOTIFY_DEBOUNCE_MS + 50));
  await databaseManager.reset();
});

describe('useRegistrationsReplicaCacheSync', () => {
  // Codex round 3: when the device cannot read the replica after a change
  // (IndexedDB gone after a failed mirror), the readers still refetch.
  it('refetches the reader keys when the replica cannot be read after a change', async () => {
    const queryClient = mountListener();
    const cache = (
      replicatedDogRegistrationsTable as unknown as {
        cacheManager: { getAllData: () => Promise<unknown> };
      }
    ).cacheManager;
    const read = cache.getAllData;
    cache.getAllData = async () => ({ ok: false, rows: [], error: new Error('IDB unavailable') });
    try {
      await replicatedDogRegistrationsTable.notifyChanged();

      await waitFor(() => expect(invalidated(queryClient)).toEqual([true, true, true, true]));
    } finally {
      cache.getAllData = read;
    }
  });

  it('refetches the reader keys when a sync writes the replica', async () => {
    const queryClient = mountListener();

    await replicatedDogRegistrationsTable.applyServerRows([serverRow()]);

    await waitFor(() => expect(invalidated(queryClient)).toEqual([true, true, true, true]));
  });

  it('refetches the reader keys on a local write', async () => {
    await replicatedDogRegistrationsTable.applyServerRows([serverRow()]);
    const queryClient = mountListener();
    const row = await replicatedDogRegistrationsTable.get('reg-1');

    await replicatedDogRegistrationsTable.set('reg-1', { ...row!, registeredName: 'Edit' }, true);

    await waitFor(() => expect(invalidated(queryClient)).toEqual([true, true, true, true]));
  });

  it('refetches the reader keys when a row is removed', async () => {
    await replicatedDogRegistrationsTable.applyServerRows([serverRow()]);
    const queryClient = mountListener();

    await replicatedDogRegistrationsTable.delete('reg-1');

    await waitFor(() => expect(invalidated(queryClient)).toEqual([true, true, true, true]));
  });

  it('leaves unrelated reads alone', async () => {
    const queryClient = mountListener();
    queryClient.setQueryData(queryKeys.shows, ['cached']);

    await replicatedDogRegistrationsTable.applyServerRows([serverRow()]);

    await waitFor(() => expect(invalidated(queryClient)[0]).toBe(true));
    expect(queryClient.getQueryState(queryKeys.shows)?.isInvalidated).toBe(false);
  });
});

// Codex round 2: invalidating while a cold PostgREST read is in flight
// dedupes onto it, so its older answer lands after the change it predates.
describe('a cold read in flight when the replica changes', () => {
  it('is replaced by a fresh read, not left to land late', async () => {
    let releaseOld!: () => void;
    const answers = [
      new Promise(resolve => {
        releaseOld = () => resolve({ data: [serverRow({ registered_name: 'Old' })], error: null });
      }),
      Promise.resolve({ data: [serverRow({ registered_name: 'New' })], error: null }),
    ];
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => answers.shift() ?? Promise.resolve({ data: [], error: null }),
    };
    vi.mocked(supabase.from).mockImplementation((() => builder) as unknown as typeof supabase.from);
    const queryClient = createTestQueryClient();
    const { result } = renderHook(
      () => {
        useRegistrationsReplicaCacheSync();
        return useRegistrationsByDogQuery('dog-1');
      },
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      }
    );
    await waitFor(() => expect(answers).toHaveLength(1));

    await replicatedDogRegistrationsTable.applyServerRows([serverRow({ id: 'other' })]);
    await waitFor(() => expect(answers).toHaveLength(0));
    releaseOld();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(result.current.data).toEqual([expect.objectContaining({ registered_name: 'New' })]);
  });
});

/** PostgREST that cannot answer a read: the device is offline. */
function serverUnreachable() {
  const builder = {
    eq: () => builder,
    select: () => builder,
    order: async () => ({ data: null, error: new Error('Failed to fetch') }),
  };
  vi.mocked(supabase.from).mockImplementation((() => builder) as unknown as typeof supabase.from);
}

function Page() {
  useRegistrationsReplicaCacheSync();
  return <RegistrationsSection dog={{ id: 'dog-1' } as Dog} canEdit={false} />;
}

// The offline copy the readers fall back to shows a queued delete at once.
describe('a queued write reaches the offline device copy without a sync', () => {
  beforeEach(async () => {
    await replicatedDogRegistrationsTable.applyServerRows([
      serverRow({ registered_name: 'Old Name', version: 3 }),
    ]);
    serverUnreachable();
  });

  it('hides a queued delete', async () => {
    render(<Page />);
    expect(await screen.findByText('Old Name')).toBeInTheDocument();

    await replicatedDogRegistrationsTable.deleteRegistration('reg-1');

    expect(await screen.findByText('No registrations saved on this device')).toBeInTheDocument();
  });
});
