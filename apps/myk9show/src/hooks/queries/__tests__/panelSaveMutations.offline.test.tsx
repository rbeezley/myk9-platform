import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-1125: the online-only mutations an edit panel awaits must FAIL FAST when
 * the connection is gone, not pause. A paused mutation never settles, so the
 * panel's Save would spin forever and the write would fire late on reconnect.
 * Each of these writes straight to PostgREST, so pausing buys nothing. The
 * registration add and edit are not here: they are queued on the registrations
 * replica and succeed offline (MYK9-1090, ManageRegistrationsPanel.queued.test).
 */
const failed = { data: null, error: new TypeError('Failed to fetch') };
const services = vi.hoisted(() => ({
  createManualResult: vi.fn(),
  createDog: vi.fn(),
  updateClass: vi.fn(),
}));

vi.mock('@/services/database/manual-results', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/manual-results')>()),
  createManualResult: services.createManualResult,
}));
vi.mock('@/services/database/dogs', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/dogs')>()),
  createDog: services.createDog,
}));
vi.mock('@/services/database/classes', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/classes')>()),
  updateClass: services.updateClass,
}));

import { useCreateManualResultMutation } from '@/hooks/queries/useManualResultsDatabase';
import { useCreateDogMutation } from '@/hooks/queries/useDogsDatabase';
import { useUpdateClassMutation } from '@/hooks/queries/useClassesDatabase';

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  onlineManager.setOnline(true);
  vi.clearAllMocks();
});

interface SettlingMutation {
  mutate: (variables: never) => void;
  isError: boolean;
  isPaused: boolean;
}

const CASES: ReadonlyArray<[string, () => SettlingMutation, unknown, () => unknown]> = [
  [
    'useCreateManualResultMutation (Log Manual Result)',
    useCreateManualResultMutation,
    { dog_id: 'd1' },
    () => services.createManualResult,
  ],
  ['useCreateDogMutation (Add Dog)', useCreateDogMutation, { id: 'd1' }, () => services.createDog],
  [
    'useUpdateClassMutation (Edit Class)',
    useUpdateClassMutation,
    { id: 'c1', updates: {} },
    () => services.updateClass,
  ],
];

describe('online-only panel saves fail fast offline (MYK9-1125)', () => {
  it.each(CASES)('%s errors instead of pausing', async (_label, useHook, variables, service) => {
    (service() as ReturnType<typeof vi.fn>).mockResolvedValue(failed);
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useHook(), { wrapper: makeWrapper() });

    act(() => result.current.mutate(variables as never));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isPaused).toBe(false);
    expect(service()).toHaveBeenCalledTimes(1);
  });
});
