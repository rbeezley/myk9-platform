/**
 * The dog page's registration readers on the replica (MYK9-1090, plan §2):
 * a warm replica answers offline without pausing, a cold one falls back to
 * PostgREST, a failed cold read is an error and never an empty list, and an
 * empty warm answer is authoritative.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { databaseManager } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import { createTestQueryClient, render, renderHook, screen, waitFor } from '@/test/utils/testUtils';
import { useRegistrationsByDogQuery } from '@/hooks/queries/useRegistrationsDatabase';
import { loadDogRegistrations } from '@/services/database/dogs/reads';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import RegistrationsSection from '@/components/dogs/DogDetails/Registrations/RegistrationsSection';
import type { Dog } from '@/types/dog-types';
import { markWarm, serverRow } from '@/services/replication/__tests__/dogRegistrationFixtures';

/** PostgREST `dog_registrations` reads answer `answer`; anything else is unexpected. */
function postgrestAnswers(answer: { data: unknown; error: unknown }) {
  const terminal = Promise.resolve(answer);
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => terminal,
    order: () => terminal,
  };
  vi.mocked(supabase.from).mockImplementation((() => builder) as unknown as typeof supabase.from);
}

function renderRegistrationsQuery(dogId: string) {
  const queryClient = createTestQueryClient();
  return renderHook(() => useRegistrationsByDogQuery(dogId), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(async () => {
  await databaseManager.reset();
});

afterEach(async () => {
  onlineManager.setOnline(true);
  // The singleton remembers an eviction in memory; clearing it resets that.
  await replicatedDogRegistrationsTable.clearCache();
  await databaseManager.reset();
});

describe('useRegistrationsByDogQuery', () => {
  it('answers from a warm replica while offline, without pausing', async () => {
    await replicatedDogRegistrationsTable.applyServerRows([serverRow()]);
    await markWarm(replicatedDogRegistrationsTable);
    onlineManager.setOnline(false);

    const { result } = renderRegistrationsQuery('dog-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.fetchStatus).not.toBe('paused');
    expect(result.current.data).toEqual([
      expect.objectContaining({ id: 'reg-1', registered_name: 'CH Beacon Hill Fast Lane' }),
    ]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('treats an empty warm answer as "no registrations"', async () => {
    await markWarm(replicatedDogRegistrationsTable);

    const { result } = renderRegistrationsQuery('dog-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('falls back to PostgREST when the replica has never fully synced', async () => {
    postgrestAnswers({ data: [serverRow({ registered_name: 'From Server' })], error: null });

    const { result } = renderRegistrationsQuery('dog-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      expect.objectContaining({ registered_name: 'From Server' }),
    ]);
  });

  it('reports a failed cold read as an error, never as an empty list', async () => {
    // A placeholder in a cold replica is not an answer either.
    await replicatedDogRegistrationsTable.createLocalRegistrationsForDog('dog-1', [
      {
        organization: 'AKC',
        number: 'SR1',
        registeredName: 'Placeholder',
        type: 'Beagle',
        status: 'active',
      },
    ]);
    postgrestAnswers({ data: null, error: new Error('Failed to fetch') });

    const { result } = renderRegistrationsQuery('dog-1');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

describe('loadDogRegistrations', () => {
  it('answers from a warm replica alone, complete', async () => {
    await replicatedDogRegistrationsTable.applyServerRows([serverRow()]);
    await markWarm(replicatedDogRegistrationsTable);

    const result = await loadDogRegistrations(['dog-1', 'dog-2']);

    expect(result.registrationsReadComplete).toBe(true);
    expect(result.byDog.get('dog-1')).toEqual([expect.objectContaining({ id: 'reg-1' })]);
    expect(result.byDog.get('dog-2')).toBeUndefined();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('asks the server when the replica is cold', async () => {
    postgrestAnswers({ data: [serverRow({ id: 'srv-1' })], error: null });

    const result = await loadDogRegistrations(['dog-1']);

    expect(result.byDog.get('dog-1')).toEqual([expect.objectContaining({ id: 'srv-1' })]);
    expect(supabase.from).toHaveBeenCalledWith('dog_registrations');
  });
});

describe('after a quota eviction', () => {
  it('falls back to PostgREST instead of trusting a partial replica', async () => {
    await replicatedDogRegistrationsTable.applyServerRows([
      serverRow({ id: 'r1' }),
      serverRow({ id: 'r2', dog_id: 'dog-2' }),
      serverRow({ id: 'r3', dog_id: 'dog-3' }),
    ]);
    await markWarm(replicatedDogRegistrationsTable);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60 * 60 * 1000);
    const evicted = await replicatedDogRegistrationsTable.relieveQuota();
    clock.mockRestore();
    expect(evicted).toBeGreaterThan(0);
    postgrestAnswers({ data: [serverRow({ id: 'srv-1' })], error: null });

    const result = await loadDogRegistrations(['dog-1', 'dog-2', 'dog-3']);
    const { result: query } = renderRegistrationsQuery('dog-1');

    expect(supabase.from).toHaveBeenCalledWith('dog_registrations');
    expect(result.byDog.get('dog-1')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'srv-1' })])
    );
    await waitFor(() => expect(query.current.isSuccess).toBe(true));
    expect(query.current.data).toEqual([expect.objectContaining({ id: 'srv-1' })]);
  });
});

describe('Registrations section on the real query', () => {
  it('shows the replica rows offline', async () => {
    await replicatedDogRegistrationsTable.applyServerRows([serverRow()]);
    await markWarm(replicatedDogRegistrationsTable);
    onlineManager.setOnline(false);

    render(<RegistrationsSection dog={{ id: 'dog-1' } as Dog} canEdit={false} />);

    expect(await screen.findByText('CH Beacon Hill Fast Lane')).toBeInTheDocument();
    expect(screen.queryByText('No Registrations Found')).not.toBeInTheDocument();
  });
});
