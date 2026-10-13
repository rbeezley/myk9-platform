/**
 * MYK9-1143: a registration delete hides its row from every dog's
 * registrations read at once, instead of waiting on the replica listener's
 * refetch, and puts it back when the delete itself fails.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { createTestQueryClient, renderHook } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';
import { useDeleteRegistrationMutation } from '@/hooks/queries/useRegistrationsDatabase';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import type { RegistrationsForDog } from '@/services/database/registrations/replicaReads';

const cached = (ids: string[]): RegistrationsForDog =>
  ({ rows: ids.map(id => ({ id })), source: 'device' }) as unknown as RegistrationsForDog;

function renderDelete() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.registrationsByDog('dog-1'), cached(['reg-1', 'reg-2']));
  const { result } = renderHook(() => useDeleteRegistrationMutation(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  const rowIds = () =>
    queryClient
      .getQueryData<RegistrationsForDog>(queryKeys.registrationsByDog('dog-1'))
      ?.rows.map(row => row.id);
  return { result, rowIds };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a registration delete', () => {
  it('hides the row from the dog’s cached registrations before the write settles', async () => {
    let finish: () => void = () => undefined;
    vi.spyOn(replicatedDogRegistrationsTable, 'deleteRegistration').mockImplementation(
      () => new Promise<void>(resolve => (finish = resolve))
    );
    const { result, rowIds } = renderDelete();

    let settled!: Promise<void>;
    act(() => {
      settled = result.current.mutateAsync('reg-1');
    });
    await vi.waitFor(() => expect(rowIds()).toEqual(['reg-2']));

    await act(async () => {
      finish();
      await settled;
    });
    expect(rowIds()).toEqual(['reg-2']);
  });

  it('puts the row back when the delete fails', async () => {
    vi.spyOn(replicatedDogRegistrationsTable, 'deleteRegistration').mockRejectedValue(
      new Error('refused')
    );
    const { result, rowIds } = renderDelete();

    await act(async () => {
      await result.current.mutateAsync('reg-1').catch(() => undefined);
    });
    expect(rowIds()).toEqual(['reg-1', 'reg-2']);
  });
});
