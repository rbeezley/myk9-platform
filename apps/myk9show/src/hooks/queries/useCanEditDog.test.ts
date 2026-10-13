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

// The rule: fail open only before the server has answered; an answered "no" stands.
describe('canEditFromCheck', () => {
  const cases: [string, CanEditCheck['data'], boolean][] = [
    ['no answer yet (loading, offline from the start, first check failed)', undefined, true],
    ['the server has no such dog yet', null, true],
    ['the server said yes', true, true],
    ['the server said no (and a later refresh failed, or the app went offline)', false, false],
  ];

  it.each(cases)('%s', (_label, data, expected) => {
    expect(canEditFromCheck({ knownAllowed: false, data })).toBe(expected);
  });

  it.each(cases)('known-allowed viewers can always edit: %s', (_label, data) => {
    expect(canEditFromCheck({ knownAllowed: true, data })).toBe(true);
  });
});

describe('useCanEditDog', () => {
  beforeEach(() => {
    rpc.mockReset();
    onlineManager.setOnline(true);
  });

  function renderCheck() {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const rendered = renderHook(() => useCanEditDog('dog-1', false), { wrapper });
    return { ...rendered, queryClient };
  }

  it('an answered "no" stands through a failed refresh', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    const { result, queryClient } = renderCheck();
    await waitFor(() => expect(result.current).toBe(false));

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    await act(() => queryClient.invalidateQueries());
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(result.current).toBe(false);
  });

  it('an answered "no" stands when the app goes offline', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    const { result } = renderCheck();
    await waitFor(() => expect(result.current).toBe(false));

    act(() => onlineManager.setOnline(false));
    expect(result.current).toBe(false);
  });

  it('a newer "yes" replaces an earlier "no"', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    const { result, queryClient } = renderCheck();
    await waitFor(() => expect(result.current).toBe(false));

    rpc.mockResolvedValueOnce({ data: true, error: null });
    await act(() => queryClient.invalidateQueries());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('a first check that fails keeps editing available', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    const { result } = renderCheck();
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    expect(result.current).toBe(true);
  });
});
