import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReleaseResults } from '../useReleaseResults';

const mockUpdateClass = vi.hoisted(() => vi.fn());
const mockSuccess = vi.hoisted(() => vi.fn());
const mockError = vi.hoisted(() => vi.fn());
const mockWarning = vi.hoisted(() => vi.fn());

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    updateClass: (...args: unknown[]) => mockUpdateClass(...args),
  },
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: mockSuccess,
    error: mockError,
    warning: mockWarning,
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
    expect(mockSuccess).toHaveBeenCalledWith('Results released for 2 classes');
    expect(mockWarning).not.toHaveBeenCalled();
    expect(mockError).not.toHaveBeenCalled();
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
    expect(mockWarning).toHaveBeenCalledWith(
      'Released 2 of 3 classes. 1 failed — the failed classes stay selected so you can retry.'
    );
    expect(mockSuccess).not.toHaveBeenCalled();
  });

  it('surfaces an error (not success) when every class fails', async () => {
    mockUpdateClass.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useReleaseResults(), { wrapper: makeWrapper() });

    let outcome;
    await act(async () => {
      outcome = await result.current.mutateAsync({ classIds: ['a', 'b'], showId: 'show-1' });
    });

    expect(outcome).toEqual({ released: [], failed: ['a', 'b'] });
    expect(mockError).toHaveBeenCalledWith('Failed to release 2 classes. Reselect and try again.');
    expect(mockSuccess).not.toHaveBeenCalled();
    expect(mockWarning).not.toHaveBeenCalled();
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
