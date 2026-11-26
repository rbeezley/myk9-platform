import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useBulkClassEntryFee } from '../useBulkClassEntryFee';

const updateClass = vi.hoisted(() => vi.fn());
vi.mock('@/services/database/classes', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/classes')>()),
  updateClass,
}));

const sync = vi.hoisted(() => vi.fn());
vi.mock('@/services/replication', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/replication')>();
  return {
    ...actual,
    replicatedClassesTable: Object.assign(Object.create(actual.replicatedClassesTable), { sync }),
  };
});

const connectionHint = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => connectionHint.value }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const classes = [
  { id: 'c1', name: 'Detective' },
  { id: 'c2', name: 'Master Interior' },
];

describe('bulk Set entry fee (MYK9-1931)', () => {
  beforeEach(() => {
    updateClass.mockReset();
    updateClass.mockResolvedValue({ data: { id: 'c1', trial_id: 't1' }, error: null });
    sync.mockReset();
    sync.mockResolvedValue(undefined);
    connectionHint.value = undefined;
  });

  it("writes the chosen fee as each selected class's own fee", async () => {
    const { result } = renderHook(() => useBulkClassEntryFee(), { wrapper });

    await expect(result.current.setFee(classes, 40)).resolves.toBe(true);

    expect(updateClass).toHaveBeenCalledWith('c1', { entry_fee: 40 });
    expect(updateClass).toHaveBeenCalledWith('c2', { entry_fee: 40 });
  });

  it("returns the classes to the show's fee as an empty fee, never 0", async () => {
    const { result } = renderHook(() => useBulkClassEntryFee(), { wrapper });

    await result.current.setFee(classes, null);

    expect(updateClass).toHaveBeenCalledWith('c1', { entry_fee: null });
    expect(updateClass).toHaveBeenCalledWith('c2', { entry_fee: null });
    expect(updateClass).not.toHaveBeenCalledWith(expect.anything(), { entry_fee: 0 });
  });

  it('refreshes the replica the schedule reads once for the whole batch, not once per class', async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useBulkClassEntryFee(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    const three = [...classes, { id: 'c3', name: 'Excellent Buried' }];

    await result.current.setFee(three, 40);

    expect(updateClass).toHaveBeenCalledTimes(3);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(invalidate.mock.calls.filter(([filters]) => filters?.queryKey?.length === 1)).toEqual([
      [{ queryKey: ['classes'] }],
    ]);
  });

  it('writes nothing offline, and says why', async () => {
    connectionHint.value = 'Needs a connection';
    const { result } = renderHook(() => useBulkClassEntryFee(), { wrapper });

    await expect(result.current.setFee(classes, 40)).resolves.toBe(false);

    expect(updateClass).not.toHaveBeenCalled();
  });
});
