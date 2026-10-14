/**
 * The dog page's registration readers (MYK9-1090, plan §2): server first,
 * plus only this device's unsent work; when the server cannot be read, the
 * device copy, labelled as an offline copy and never complete.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { databaseManager, NOTIFY_DEBOUNCE_MS } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import { createTestQueryClient, render, renderHook, screen, waitFor } from '@/test/utils/testUtils';
import {
  railRegistrations,
  useDogRegistrationManagement,
} from '@/hooks/queries/useRegistrationsDatabase';
import { useRegistrationsReplicaCacheSync } from '@/providers/useRegistrationsReplicaCacheSync';
import type { RegistrationsForDog } from '@/services/database/registrations/replicaReads';
import { loadDogRegistrations } from '@/services/database/dogs/reads';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import RegistrationsSection from '@/components/dogs/DogDetails/Registrations/RegistrationsSection';
import type { Dog, Registration } from '@/types/dog-types';
import { serverRow } from '@/services/replication/__tests__/dogRegistrationFixtures';

/** PostgREST `dog_registrations` reads answer `answer`. */
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

const OFFLINE = { data: null, error: new Error('Failed to fetch') };
/** The server was reached and answered with an error (a 503, an RLS refusal). */
const SERVER_ERROR = { data: null, error: { message: 'upstream unavailable', code: '503' } };

function renderDogRegistrations(dogId: string) {
  const queryClient = createTestQueryClient();
  return renderHook(() => useDogRegistrationManagement(dogId), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

/**
 * The device holds: a clean copy the server no longer returns, a dirty edit
 * of a row the server still has, and an offline-created placeholder.
 */
async function deviceHoldsMixedRows(): Promise<{ placeholderId: string }> {
  await replicatedDogRegistrationsTable.applyServerRows([
    serverRow({ id: 'stale-copy', registration_number: 'GONE1' }),
    serverRow({ id: 'srv-edited', registration_number: 'EDIT1' }),
  ]);
  const edited = await replicatedDogRegistrationsTable.get('srv-edited');
  await replicatedDogRegistrationsTable.set(
    'srv-edited',
    { ...edited!, registeredName: 'Edited here' },
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
  return { placeholderId: placeholder!.id };
}

beforeEach(async () => {
  await databaseManager.reset();
});

afterEach(async () => {
  // The shared table's trailing change notice fires NOTIFY_DEBOUNCE_MS after
  // a write; let it land here, not inside the next test.
  await new Promise(resolve => setTimeout(resolve, NOTIFY_DEBOUNCE_MS + 50));
  onlineManager.setOnline(true);
  await databaseManager.reset();
});

describe('registration readers with the server reachable', () => {
  it('show the server rows plus only unsent device work', async () => {
    const { placeholderId } = await deviceHoldsMixedRows();
    postgrestAnswers({
      data: [
        serverRow({ id: 'srv-1' }),
        serverRow({ id: 'srv-edited', registration_number: 'EDIT1' }),
      ],
      error: null,
    });

    const { result } = renderDogRegistrations('dog-1');
    const loaded = await loadDogRegistrations(['dog-1']);

    await waitFor(() => expect(result.current.registrations).toBeDefined());
    const ids = result.current.registrations!.map(row => row.id);
    expect(ids).not.toContain('stale-copy');
    expect(ids).toEqual(expect.arrayContaining(['srv-1', 'srv-edited', placeholderId]));
    expect(result.current.registrationsSource).toBe('server');

    const loadedIds = (loaded.byDog.get('dog-1') ?? []).map(row => row.id);
    expect(loadedIds).not.toContain('stale-copy');
    expect(loadedIds).toEqual(expect.arrayContaining(['srv-1', 'srv-edited', placeholderId]));
    expect(loaded).toMatchObject({ source: 'server', registrationsReadComplete: true });
  });

  // A placeholder with no number has no (organization, number) identity; its
  // server copy is recognised by dog and creation instant (Codex review).
  it('hide a placeholder whose server copy is in the read, even without a number', async () => {
    const [placeholder] = await replicatedDogRegistrationsTable.createLocalRegistrationsForDog(
      'dog-1',
      [
        {
          organization: 'AKC',
          number: '',
          registeredName: 'Pending',
          type: 'Beagle',
          status: 'active',
        },
      ]
    );
    postgrestAnswers({
      data: [
        serverRow({
          id: 'srv-copy',
          registration_number: '',
          created_at: placeholder!.createdAt.replace('Z', '+00:00'),
        }),
      ],
      error: null,
    });

    const { result } = renderDogRegistrations('dog-1');
    const loaded = await loadDogRegistrations(['dog-1']);

    await waitFor(() => expect(result.current.registrations).toBeDefined());
    expect(result.current.registrations!.map(row => row.id)).toEqual(['srv-copy']);
    expect((loaded.byDog.get('dog-1') ?? []).map(row => row.id)).toEqual(['srv-copy']);
  });

  // The server answered; a broken device store must not hide that answer
  // behind an error (Codex review). Before MYK9-1090 this read never needed
  // IndexedDB.
  it('keep the server answer when the device cannot be read', async () => {
    postgrestAnswers({ data: [serverRow({ id: 'srv-1' })], error: null });
    const read = vi
      .spyOn(replicatedDogRegistrationsTable, 'getUnsentWorkForDogs')
      .mockRejectedValue(new Error('IndexedDB unavailable'));

    const { result } = renderDogRegistrations('dog-1');

    await waitFor(() => expect(result.current.registrations).toBeDefined());
    expect(result.current.registrations!.map(row => row.id)).toEqual(['srv-1']);
    expect(result.current.registrationsSource).toBe('server');
    expect(result.current.error).toBeFalsy();
    read.mockRestore();
  });

  it('treats an empty server answer as "no registrations"', async () => {
    postgrestAnswers({ data: [], error: null });

    const { result } = renderDogRegistrations('dog-1');

    await waitFor(() => expect(result.current.registrations).toEqual([]));
    expect(result.current.registrationsSource).toBe('server');
  });
});

// A server that ANSWERED with an error is not "offline": falling back would
// show the offline copy with no retry while the browser is online
// (adversarial review of PR 2).
describe('registration readers when the server answers with an error', () => {
  it('report the error with its retry instead of an offline copy', async () => {
    await replicatedDogRegistrationsTable.applyServerRows([serverRow({ id: 'cached' })]);
    postgrestAnswers(SERVER_ERROR);

    const { result } = renderDogRegistrations('dog-1');
    const loaded = await loadDogRegistrations(['dog-1']);

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.registrations).toBeUndefined();
    expect(loaded.source).toBe('server');
    expect(loaded.registrationsReadComplete).toBe(false);
    expect(loaded.serverError).toBeTruthy();
    expect((loaded.byDog.get('dog-1') ?? []).map(row => row.id)).not.toContain('cached');
  });
});

describe('registration readers when the server cannot be read', () => {
  it('fall back to the device copy, labelled offline and never complete', async () => {
    await deviceHoldsMixedRows();
    postgrestAnswers(OFFLINE);

    const { result } = renderDogRegistrations('dog-1');
    const loaded = await loadDogRegistrations(['dog-1']);

    await waitFor(() => expect(result.current.registrations).toBeDefined());
    expect(result.current.registrationsSource).toBe('device');
    expect(result.current.registrations!.map(row => row.id)).toContain('stale-copy');
    expect(loaded).toMatchObject({ source: 'device', registrationsReadComplete: false });
    expect((loaded.byDog.get('dog-1') ?? []).map(row => row.id)).toContain('stale-copy');
  });

  it('label an empty device copy as offline, not as "no registrations"', async () => {
    postgrestAnswers(OFFLINE);

    const { result } = renderDogRegistrations('dog-1');
    const loaded = await loadDogRegistrations(['dog-1']);

    await waitFor(() => expect(result.current.registrations).toEqual([]));
    expect(result.current.registrationsSource).toBe('device');
    expect(loaded).toMatchObject({ source: 'device', registrationsReadComplete: false });
  });

  it('run offline instead of pausing', async () => {
    await replicatedDogRegistrationsTable.applyServerRows([serverRow()]);
    postgrestAnswers(OFFLINE);
    onlineManager.setOnline(false);

    const { result } = renderDogRegistrations('dog-1');

    await waitFor(() => expect(result.current.registrations).toHaveLength(1));
    expect(result.current.registrationsSource).toBe('device');
  });

  it('report an error when the device cannot be read either', async () => {
    postgrestAnswers(OFFLINE);
    const read = vi
      .spyOn(replicatedDogRegistrationsTable, 'getRegistrationsForDogs')
      .mockRejectedValue(new Error('IndexedDB unavailable'));

    const { result } = renderDogRegistrations('dog-1');

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.registrations).toBeUndefined();
    read.mockRestore();
  });
});

describe('identity rail decision (railRegistrations)', () => {
  it('treats an empty offline copy as unknown, so the dog record and the offline status show', () => {
    expect(railRegistrations({ rows: [], source: 'device' })).toEqual({
      registrations: undefined,
      offline: true,
    });
  });

  it('shows an offline copy that has rows, labelled, and a server answer as given', () => {
    const rows = [serverRow({ id: 'r-1' })] as unknown as RegistrationsForDog['rows'];
    expect(railRegistrations({ rows, source: 'device' })).toEqual({
      registrations: rows,
      offline: true,
    });
    expect(railRegistrations({ rows: [], source: 'server' })).toEqual({
      registrations: [],
      offline: false,
    });
  });
});

describe('Registrations section on the real query', () => {
  it('marks the device copy as an offline copy', async () => {
    await replicatedDogRegistrationsTable.applyServerRows([serverRow()]);
    postgrestAnswers(OFFLINE);

    render(<RegistrationsSection dog={{ id: 'dog-1' } as Dog} canEdit={false} />);

    expect(await screen.findByText('CH Beacon Hill Fast Lane')).toBeInTheDocument();
    expect(screen.getByText('Offline copy. It may be out of date.')).toBeInTheDocument();
  });

  it('says nothing is saved on this device when the offline copy is empty', async () => {
    postgrestAnswers(OFFLINE);

    render(<RegistrationsSection dog={{ id: 'dog-1' } as Dog} canEdit={false} />);

    expect(await screen.findByText('No registrations saved on this device')).toBeInTheDocument();
    expect(screen.queryByText('No Registrations Found')).not.toBeInTheDocument();
  });

  it('falls back to the dog record when the offline copy is empty, as the rail does', async () => {
    postgrestAnswers(OFFLINE);
    const dog = {
      id: 'dog-1',
      registrations: [
        {
          id: 'from-dog-record',
          organization: 'AKC',
          registrationNumber: 'DR1',
          registeredName: 'Dog Record Name',
        } as unknown as Registration,
      ],
    } as Dog;

    render(<RegistrationsSection dog={dog} canEdit={false} />);

    expect(await screen.findByText('Dog Record Name')).toBeInTheDocument();
    expect(screen.getByText('Offline copy. It may be out of date.')).toBeInTheDocument();
    expect(screen.queryByText('No registrations saved on this device')).not.toBeInTheDocument();
  });

  it('reads back from the device offline, then from the server after reconnect', async () => {
    await replicatedDogRegistrationsTable.applyServerRows([
      serverRow({ registered_name: 'Saved On Device' }),
    ]);
    postgrestAnswers(OFFLINE);
    function Page() {
      useRegistrationsReplicaCacheSync();
      return <RegistrationsSection dog={{ id: 'dog-1' } as Dog} canEdit={false} />;
    }
    render(<Page />);
    expect(await screen.findByText('Saved On Device')).toBeInTheDocument();
    expect(screen.getByText('Offline copy. It may be out of date.')).toBeInTheDocument();

    postgrestAnswers({ data: [serverRow({ registered_name: 'Renamed On Server' })], error: null });
    await replicatedDogRegistrationsTable.notifyChanged();

    expect(await screen.findByText('Renamed On Server')).toBeInTheDocument();
    expect(screen.queryByText('Saved On Device')).not.toBeInTheDocument();
    expect(screen.queryByText('Offline copy. It may be out of date.')).not.toBeInTheDocument();
  });

  it('shows no offline note for a server answer', async () => {
    postgrestAnswers({ data: [serverRow()], error: null });

    render(<RegistrationsSection dog={{ id: 'dog-1' } as Dog} canEdit={false} />);

    expect(await screen.findByText('CH Beacon Hill Fast Lane')).toBeInTheDocument();
    expect(screen.queryByText('Offline copy. It may be out of date.')).not.toBeInTheDocument();
  });
});
