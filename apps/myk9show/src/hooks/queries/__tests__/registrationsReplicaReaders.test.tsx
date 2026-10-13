/**
 * The dog page's registration readers on the replica (MYK9-1090, plan §2):
 * a warm replica answers offline without pausing, a cold one falls back to
 * PostgREST, a failed cold read is an error and never an empty list, and an
 * empty warm answer is authoritative.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { DB_NAME, databaseManager, NOTIFY_DEBOUNCE_MS } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import { createTestQueryClient, render, renderHook, screen, waitFor } from '@/test/utils/testUtils';
import { useRegistrationsByDogQuery } from '@/hooks/queries/useRegistrationsDatabase';
import { loadDogRegistrations } from '@/services/database/dogs/reads';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import RegistrationsSection from '@/components/dogs/DogDetails/Registrations/RegistrationsSection';
import type { Dog } from '@/types/dog-types';
import {
  serverRow,
  setOnline,
  signedInAs,
  trustReplica,
} from '@/services/replication/__tests__/dogRegistrationFixtures';
import { resetRegistrationsTrustForTests } from '@/services/replication/dogRegistrationsTrust';
import { mirrorServerRegistration } from '@/services/database/registrations/replicaMirror';

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
  await resetRegistrationsTrustForTests();
  await databaseManager.reset();
});

afterEach(async () => {
  // The shared table's trailing change notice fires NOTIFY_DEBOUNCE_MS after
  // a write; let it land here, not inside the next test.
  await new Promise(resolve => setTimeout(resolve, NOTIFY_DEBOUNCE_MS + 50));
  onlineManager.setOnline(true);
  setOnline(true);
  await resetRegistrationsTrustForTests();
  await databaseManager.reset();
});

describe('useRegistrationsByDogQuery', () => {
  it('answers from a warm replica while offline, without pausing', async () => {
    await replicatedDogRegistrationsTable.applyServerRows([serverRow()]);
    await trustReplica();
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
    await trustReplica();

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
    await trustReplica();

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

describe('registrations replica trust', () => {
  beforeEach(async () => {
    await replicatedDogRegistrationsTable.applyServerRows([serverRow({ id: 'from-a' })]);
    postgrestAnswers({ data: [serverRow({ id: 'srv-1' })], error: null });
  });

  // Codex round 3: trust lives with the rows. A recreated replica database
  // (DatabaseManager.recover) must not leave trust behind for an empty store.
  it('loses trust together with the rows when the replica database is recreated', async () => {
    await trustReplica();
    await databaseManager.reset();
    await new Promise<void>(resolve => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });

    expect((await replicatedDogRegistrationsTable.readForDogs(['dog-1'])).state).toBe('cold');
  });

  it('stops trusting the replica when the replication database recovers', async () => {
    await trustReplica();

    window.dispatchEvent(
      new CustomEvent('replication:recovery', { detail: { reason: 'circuit-breaker' } })
    );

    expect((await replicatedDogRegistrationsTable.readForDogs(['dog-1'])).state).toBe('cold');
  });

  // Codex round 3: an untrusted replica may add only unsent local work to a
  // server read, never a clean cached copy the server no longer returns.
  it('merges only unsent local work into a cold server read', async () => {
    await replicatedDogRegistrationsTable.applyServerRows([
      serverRow({ id: 'stale-copy', registration_number: 'GONE1' }),
    ]);
    const dirty = await replicatedDogRegistrationsTable.get('from-a');
    await replicatedDogRegistrationsTable.set(
      'from-a',
      { ...dirty!, registrationNumber: 'EDITED1' },
      true
    );
    const [placeholder] = await replicatedDogRegistrationsTable.createLocalRegistrationsForDog(
      'dog-1',
      [
        {
          organization: 'UKC',
          number: 'P77',
          registeredName: 'New',
          type: 'Beagle',
          status: 'active',
        },
      ]
    );

    const result = await loadDogRegistrations(['dog-1']);
    const ids = (result.byDog.get('dog-1') ?? []).map(row => row.id);

    expect(ids).not.toContain('stale-copy');
    expect(ids).toEqual(expect.arrayContaining(['srv-1', 'from-a', placeholder!.id]));
  });

  // Codex round 2, P1: account B must never be served account A's replica.
  it('serves another account from PostgREST, not the replica account A verified', async () => {
    await trustReplica('auth-a');
    signedInAs('auth-b');

    const result = await loadDogRegistrations(['dog-1']);

    expect(result.byDog.get('dog-1')).toEqual([expect.objectContaining({ id: 'srv-1' })]);
    expect(supabase.from).toHaveBeenCalledWith('dog_registrations');
  });

  it('does not trust an unresolved identity while online', async () => {
    await trustReplica('auth-a');
    signedInAs(null);

    expect((await replicatedDogRegistrationsTable.readForDogs(['dog-1'])).state).toBe('cold');
  });

  // auth-js reports no session offline once the access token expired.
  it('keeps the recorded trust for an unresolved identity while offline', async () => {
    await trustReplica('auth-a');
    signedInAs(null);
    setOnline(false);

    expect((await replicatedDogRegistrationsTable.readForDogs(['dog-1'])).state).toBe('warm');
  });

  it('stops trusting the replica when a direct write cannot be mirrored', async () => {
    await trustReplica();
    const apply = vi
      .spyOn(replicatedDogRegistrationsTable, 'applyServerRows')
      .mockRejectedValueOnce(new Error('QuotaExceededError'));

    await mirrorServerRegistration(serverRow({ registered_name: 'New Name' }));
    apply.mockRestore();

    expect((await replicatedDogRegistrationsTable.readForDogs(['dog-1'])).state).toBe('cold');
  });
});

describe('after a quota eviction', () => {
  it('falls back to PostgREST instead of trusting a partial replica', async () => {
    await replicatedDogRegistrationsTable.applyServerRows([
      serverRow({ id: 'r1' }),
      serverRow({ id: 'r2', dog_id: 'dog-2' }),
      serverRow({ id: 'r3', dog_id: 'dog-3' }),
    ]);
    await trustReplica();
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
    await trustReplica();
    onlineManager.setOnline(false);

    render(<RegistrationsSection dog={{ id: 'dog-1' } as Dog} canEdit={false} />);

    expect(await screen.findByText('CH Beacon Hill Fast Lane')).toBeInTheDocument();
    expect(screen.queryByText('No Registrations Found')).not.toBeInTheDocument();
  });
});
