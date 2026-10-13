import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { askCanEditDog, canEditFromCheck, useCanEditDog, type CanEditCheck } from './useCanEditDog';

const rpc = vi.fn();
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

// Bulk actions treat `false` as "refuse this dog" and `null` as "could not ask, go ahead",
// so the three answers must stay distinct.
describe('askCanEditDog', () => {
  beforeEach(() => {
    rpc.mockReset();
    onlineManager.setOnline(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    onlineManager.setOnline(true);
  });

  it('asks can_edit_dog for that dog and passes a yes through', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(askCanEditDog('dog-1')).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('can_edit_dog', { p_dog_id: 'dog-1' });
  });

  it('is false only when the server answered no', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(askCanEditDog('dog-1')).resolves.toBe(false);
  });

  it('is null when the server has no such dog yet (made on this device, not uploaded)', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(askCanEditDog('dog-1')).resolves.toBeNull();
  });

  it('is null when the server returned an error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'JWT expired' } });
    await expect(askCanEditDog('dog-1')).resolves.toBeNull();
  });

  it('is null when the request never reached the server (offline)', async () => {
    rpc.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(askCanEditDog('dog-1')).resolves.toBeNull();
  });

  it('does not ask at all while the app is offline', async () => {
    onlineManager.setOnline(false);
    await expect(askCanEditDog('dog-1')).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('gives up after a bounded wait on a stalled connection', async () => {
    vi.useFakeTimers();
    rpc.mockReturnValue(new Promise(() => {}));
    const answer = askCanEditDog('dog-1');
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(answer).resolves.toBeNull();
  });
});

// Every state the query can be in, so a stale or unanswered check can never read as "no".
describe('canEditFromCheck', () => {
  const cases: [string, Omit<CanEditCheck, 'knownAllowed'>, boolean][] = [
    ['still loading', { data: undefined, status: 'pending', fetchStatus: 'fetching' }, true],
    [
      'offline before any answer',
      { data: undefined, status: 'pending', fetchStatus: 'paused' },
      true,
    ],
    ['the server said yes', { data: true, status: 'success', fetchStatus: 'idle' }, true],
    ['the server said no', { data: false, status: 'success', fetchStatus: 'idle' }, false],
    ['a no, refreshing now', { data: false, status: 'success', fetchStatus: 'fetching' }, false],
    ['a no, then the refresh failed', { data: false, status: 'error', fetchStatus: 'idle' }, true],
    [
      'a no, refresh waiting for the network',
      { data: false, status: 'success', fetchStatus: 'paused' },
      true,
    ],
    ['the first check failed', { data: undefined, status: 'error', fetchStatus: 'idle' }, true],
    [
      'the server has no such dog yet',
      { data: null, status: 'success', fetchStatus: 'idle' },
      true,
    ],
  ];

  it.each(cases)('%s', (_label, check, expected) => {
    expect(canEditFromCheck({ knownAllowed: false, ...check })).toBe(expected);
  });

  it.each(cases)('known-allowed viewers can always edit: %s', (_label, check) => {
    expect(canEditFromCheck({ knownAllowed: true, ...check })).toBe(true);
  });
});

describe('useCanEditDog', () => {
  beforeEach(() => {
    rpc.mockReset();
    onlineManager.setOnline(true);
  });

  it('a "no" followed by a failed refresh gives Edit back', async () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    rpc.mockResolvedValueOnce({ data: false, error: null });
    const { result } = renderHook(() => useCanEditDog('dog-1', false), { wrapper });
    await waitFor(() => expect(result.current).toBe(false));

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    await act(() => queryClient.invalidateQueries());
    await waitFor(() => expect(result.current).toBe(true));
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
