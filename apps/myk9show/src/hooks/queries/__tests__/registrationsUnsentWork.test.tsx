/**
 * The registration readers show this device's unsent work over the server
 * copy (MYK9-1129 item 5): an unsent edit wins over the server row, a pending
 * delete hides it, and a re-added registration shows. Both readers: the dog
 * page's (`useDogRegistrationManagement`) and the dog reads'
 * (`loadDogRegistrations`).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { databaseManager, NOTIFY_DEBOUNCE_MS } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import { createTestQueryClient, renderHook, waitFor } from '@/test/utils/testUtils';
import { useDogRegistrationManagement } from '@/hooks/queries/useRegistrationsDatabase';
import { loadDogRegistrations } from '@/services/database/dogs/reads';
import { replicatedDogRegistrationsTable as table } from '@/services/replication/ReplicatedDogRegistrationsTable';
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

const SERVER_ROW = serverRow({ id: 'reg-1', registered_name: 'Server Name' });

/** Both readers' rows for dog-1, as `[id, registered_name]`. */
async function readBoth() {
  const queryClient = createTestQueryClient();
  const { result } = renderHook(() => useDogRegistrationManagement('dog-1'), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.registrations).toBeDefined());
  const loaded = await loadDogRegistrations(['dog-1']);
  const pairs = (rows: readonly Record<string, unknown>[]) =>
    rows.map(row => [row.id, row.registered_name]);
  return {
    page: pairs(result.current.registrations as unknown as Record<string, unknown>[]),
    pageSource: result.current.registrationsSource,
    dogReads: pairs(loaded.byDog.get('dog-1') ?? []),
    loaded,
  };
}

beforeEach(async () => {
  await databaseManager.reset();
  await table.applyServerRows([SERVER_ROW]);
});

afterEach(async () => {
  await new Promise(resolve => setTimeout(resolve, NOTIFY_DEBOUNCE_MS + 50));
  await databaseManager.reset();
});

describe('with the server reachable', () => {
  beforeEach(() => {
    postgrestAnswers({ data: [SERVER_ROW], error: null });
  });

  it('an unsent edit wins over the server row', async () => {
    await table.updateRegistration('reg-1', { registered_name: 'Edited Here' });

    const { page, dogReads, loaded } = await readBoth();

    expect(page).toEqual([['reg-1', 'Edited Here']]);
    expect(dogReads).toEqual([['reg-1', 'Edited Here']]);
    expect(loaded).toMatchObject({ source: 'server', registrationsReadComplete: true });
  });

  it('a pending delete hides the server row', async () => {
    await table.deleteRegistration('reg-1');

    const { page, dogReads } = await readBoth();

    expect(page).toEqual([]);
    expect(dogReads).toEqual([]);
  });

  it('a re-added registration (new id, same number) shows in place of the deleted one', async () => {
    await table.deleteRegistration('reg-1');
    const readded = await table.addRegistration({
      dog_id: 'dog-1',
      organization: SERVER_ROW.organization,
      registration_number: SERVER_ROW.registration_number,
      registered_name: 'Re-added',
    });

    const { page, dogReads } = await readBoth();

    expect(page).toEqual([[readded.id, 'Re-added']]);
    expect(dogReads).toEqual([[readded.id, 'Re-added']]);
  });
});

describe('with the server unreachable', () => {
  it('the offline copy shows the unsent edit and stays labelled', async () => {
    postgrestAnswers({ data: null, error: new Error('Failed to fetch') });
    await table.updateRegistration('reg-1', { registered_name: 'Edited Here' });

    const { page, pageSource, dogReads, loaded } = await readBoth();

    expect(page).toEqual([['reg-1', 'Edited Here']]);
    expect(pageSource).toBe('device');
    expect(dogReads).toEqual([['reg-1', 'Edited Here']]);
    expect(loaded).toMatchObject({ source: 'device', registrationsReadComplete: false });
  });
});
