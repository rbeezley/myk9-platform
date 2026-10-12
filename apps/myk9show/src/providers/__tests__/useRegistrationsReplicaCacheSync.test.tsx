/**
 * The one refresh rule for registrations (MYK9-1090, plan §2): any change to
 * the replica refetches the registration reads, and a direct write lands in
 * the replica so the dog page shows it without a sync.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { databaseManager } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import { createTestQueryClient, render, renderHook, screen, waitFor } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { updateRegistration, deleteRegistration } from '@/services/database/registrations';
import RegistrationsSection from '@/components/dogs/DogDetails/Registrations/RegistrationsSection';
import type { Dog } from '@/types/dog-types';
import {
  installRegistrationsServer,
  trustReplica,
  newServer,
  serverRow,
} from '@/services/replication/__tests__/dogRegistrationFixtures';
import { resetRegistrationsTrustForTests } from '@/services/replication/dogRegistrationsTrust';
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
  resetRegistrationsTrustForTests();
  await databaseManager.reset();
});

afterEach(async () => {
  resetRegistrationsTrustForTests();
  await databaseManager.reset();
});

describe('useRegistrationsReplicaCacheSync', () => {
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

/** PostgREST answers a direct update or delete with `row`. */
function serverWriteReturns(row: Record<string, unknown>) {
  const single = vi.fn(async () => ({ data: row, error: null }));
  const builder = {
    update: () => builder,
    delete: () => builder,
    eq: () => builder,
    select: () => builder,
    single,
  };
  vi.mocked(supabase.from).mockImplementation((() => builder) as unknown as typeof supabase.from);
}

function Page() {
  useRegistrationsReplicaCacheSync();
  return <RegistrationsSection dog={{ id: 'dog-1' } as Dog} canEdit={false} />;
}

describe('a direct write reaches the dog page without a sync', () => {
  beforeEach(async () => {
    await replicatedDogRegistrationsTable.applyServerRows([
      serverRow({ registered_name: 'Old Name', version: 3 }),
    ]);
    trustReplica();
    // Any sync attempt would read nothing.
    installRegistrationsServer(newServer());
  });

  it('shows an edit saved straight to the server', async () => {
    render(<Page />);
    expect(await screen.findByText('Old Name')).toBeInTheDocument();
    serverWriteReturns(serverRow({ registered_name: 'New Name', version: 4 }));

    const { error } = await updateRegistration('reg-1', { registered_name: 'New Name' });

    expect(error).toBeNull();
    expect(await screen.findByText('New Name')).toBeInTheDocument();
    expect((await replicatedDogRegistrationsTable.getReplicatedRow('reg-1'))?.serverVersion).toBe(
      4
    );
  });

  it('drops a registration deleted straight on the server', async () => {
    render(<Page />);
    expect(await screen.findByText('Old Name')).toBeInTheDocument();
    serverWriteReturns({ id: 'reg-1', dog_id: 'dog-1' });

    await deleteRegistration('reg-1');

    expect(await screen.findByText('No Registrations Found')).toBeInTheDocument();
  });
});
