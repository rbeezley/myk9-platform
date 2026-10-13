/**
 * The dog reads are replica-backed, so they must run offline (Codex final
 * round on PR 3a). With React Query's default `networkMode: 'online'` an
 * invalidation offline (an offline registration save refreshes ['dogs'])
 * paused the read, and the dog page kept showing the old registered name
 * until reconnect.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { createTestQueryClient, renderHook, waitFor } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';

const device = vi.hoisted(() => ({ registeredName: 'Old Name' }));

vi.mock('@/services/database/dogs', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/database/dogs')>();
  const dogRow = () => ({
    id: 'dog-1',
    call_name: 'Maple',
    owner_id: 'owner-1',
    registrations: [{ id: 'reg-1', registered_name: device.registeredName }],
  });
  return {
    ...actual,
    getDogById: vi.fn(async () => ({ data: dogRow(), error: null })),
    getDogsByOwner: vi.fn(async () => ({ data: [dogRow()], error: null })),
  };
});

import { useDogQuery, useDogsByOwnerQuery } from '@/hooks/queries/useDogsDatabase';

function render<T>(hook: () => T) {
  const queryClient = createTestQueryClient();
  const view = renderHook(hook, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { ...view, queryClient };
}

/** The registered name the cached dog read shows. */
const nameIn = (data: unknown) =>
  JSON.stringify(data).includes('New Name') ? 'New Name' : 'Old Name';

beforeEach(() => {
  device.registeredName = 'Old Name';
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('dog reads after an offline registration save', () => {
  it('the dog detail read refreshes offline', async () => {
    const { result, queryClient } = render(() => useDogQuery('dog-1'));
    await waitFor(() => expect(result.current.data).toBeTruthy());

    onlineManager.setOnline(false);
    device.registeredName = 'New Name';
    await queryClient.invalidateQueries({ queryKey: queryKeys.dogs });

    await waitFor(() => expect(nameIn(result.current.data)).toBe('New Name'));
  });

  it("an owner's dogs read refreshes offline", async () => {
    const { result, queryClient } = render(() => useDogsByOwnerQuery('owner-1'));
    await waitFor(() => expect(result.current.data).toBeTruthy());

    onlineManager.setOnline(false);
    device.registeredName = 'New Name';
    await queryClient.invalidateQueries({ queryKey: queryKeys.personDogs('owner-1') });

    await waitFor(() => expect(nameIn(result.current.data)).toBe('New Name'));
  });
});
