import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReleaseResults } from '../useReleaseResults';

const mockUpdateClass = vi.hoisted(() => vi.fn());

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    updateClass: (...args: unknown[]) => mockUpdateClass(...args),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

/*
 * The toast assertions that used to live here moved with the toast itself.
 * Both this hook AND `BulkOperationsBar` used to call sonner, so one release
 * produced two differently-worded messages. The bar won, because its message
 * describes the SELECTION outcome ("the failed classes stayed selected so you
 * can retry") which this hook cannot see. The "never resolves silently"
 * guarantee is covered by
 * `pages/secretary/ResultsControlPage/__tests__/BulkOperationsBar.test.tsx`.
 *
 * What stays here is what this hook actually owns: the per-index partition of
 * released vs failed, which the bar depends on to keep the right rows selected.
 */
describe('useReleaseResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateClass.mockResolvedValue(undefined);
  });

  it('reports every class released on full success', async () => {
    const { result } = renderHook(() => useReleaseResults(), { wrapper: makeWrapper() });

    let outcome;
    await act(async () => {
      outcome = await result.current.mutateAsync({ classIds: ['a', 'b'], showId: 'show-1' });
    });

    expect(outcome).toEqual({ released: ['a', 'b'], failed: [] });
  });

  it('partitions released vs failed and warns when some classes fail', async () => {
    // 'a' succeeds, 'b' fails, 'c' succeeds — settle, do not reject.
    mockUpdateClass.mockImplementation((classId: string) =>
      classId === 'b' ? Promise.reject(new Error('offline')) : Promise.resolve()
    );

    const { result } = renderHook(() => useReleaseResults(), { wrapper: makeWrapper() });

    let outcome;
    await act(async () => {
      outcome = await result.current.mutateAsync({ classIds: ['a', 'b', 'c'], showId: 'show-1' });
    });

    // Assertion-first: the failed class is named so the secretary can retry just it.
    expect(outcome).toEqual({ released: ['a', 'c'], failed: ['b'] });
  });

  it('surfaces an error (not success) when every class fails', async () => {
    mockUpdateClass.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useReleaseResults(), { wrapper: makeWrapper() });

    let outcome;
    await act(async () => {
      outcome = await result.current.mutateAsync({ classIds: ['a', 'b'], showId: 'show-1' });
    });

    expect(outcome).toEqual({ released: [], failed: ['a', 'b'] });
  });

  it('no-ops on an empty selection', async () => {
    const { result } = renderHook(() => useReleaseResults(), { wrapper: makeWrapper() });

    let outcome;
    await act(async () => {
      outcome = await result.current.mutateAsync({ classIds: [], showId: 'show-1' });
    });

    expect(outcome).toEqual({ released: [], failed: [] });
    expect(mockUpdateClass).not.toHaveBeenCalled();
  });
});
