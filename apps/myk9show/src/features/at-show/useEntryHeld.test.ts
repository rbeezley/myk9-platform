import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getEntryById: vi.fn(),
  listeners: [] as Array<() => void>,
  unsubscribe: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntryById: mocks.getEntryById,
    subscribe: (listener: () => void) => {
      mocks.listeners.push(listener);
      return mocks.unsubscribe;
    },
  },
}));

import { useEntryHeld } from './useEntryHeld';

const row = (held: boolean, entryStatus = 'confirmed') => ({
  id: 'entry-1',
  entryStatus,
  awaitingRegistrationNumber: held,
});
const notify = () => mocks.listeners.forEach(listener => listener());

// MYK9-1162: the one live hold signal every scoresheet reads.
describe('useEntryHeld', () => {
  beforeEach(() => {
    mocks.getEntryById.mockReset();
    mocks.unsubscribe.mockReset();
    mocks.listeners.length = 0;
  });

  it('follows the replica in both directions', async () => {
    mocks.getEntryById.mockResolvedValue(row(false));
    const { result } = renderHook(() => useEntryHeld('entry-1'));
    await waitFor(() => expect(mocks.getEntryById).toHaveBeenCalled());
    expect(result.current.held).toBe(false);

    mocks.getEntryById.mockResolvedValue(row(true));
    act(() => notify());
    await waitFor(() => expect(result.current.held).toBe(true));

    mocks.getEntryById.mockResolvedValue(row(false));
    act(() => notify());
    await waitFor(() => expect(result.current.held).toBe(false));
  });

  it('is not held for a withdrawn entry, a missing row or a failed read', async () => {
    mocks.getEntryById.mockResolvedValue(row(true, 'withdrawn'));
    const { result, rerender } = renderHook(({ id }) => useEntryHeld(id), {
      initialProps: { id: 'entry-1' },
    });
    await waitFor(() => expect(mocks.getEntryById).toHaveBeenCalled());
    expect(result.current.held).toBe(false);

    mocks.getEntryById.mockResolvedValue(null);
    rerender({ id: 'entry-2' });
    await waitFor(() => expect(mocks.getEntryById).toHaveBeenCalledWith('entry-2'));
    expect(result.current.held).toBe(false);

    mocks.getEntryById.mockRejectedValue(new Error('IndexedDB closed'));
    rerender({ id: 'entry-3' });
    await waitFor(() => expect(mocks.getEntryById).toHaveBeenCalledWith('entry-3'));
    expect(result.current.held).toBe(false);
  });

  it("never reports one entry's hold for the next", async () => {
    mocks.getEntryById.mockImplementation(async (id: string) =>
      id === 'entry-1' ? row(true) : new Promise(() => undefined)
    );
    const { result, rerender } = renderHook(({ id }) => useEntryHeld(id), {
      initialProps: { id: 'entry-1' },
    });
    await waitFor(() => expect(result.current.held).toBe(true));

    rerender({ id: 'entry-2' });
    expect(result.current.held).toBe(false);
  });

  it('stops listening when the sheet closes', () => {
    mocks.getEntryById.mockResolvedValue(row(false));
    const { unmount } = renderHook(() => useEntryHeld('entry-1'));
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('moves the dog in-ring once it is free to run: on open, or when a hold clears', async () => {
    const onPlayable = vi.fn();
    mocks.getEntryById.mockResolvedValue(row(true));
    const { result } = renderHook(() => useEntryHeld('entry-1', onPlayable));
    await waitFor(() => expect(result.current.held).toBe(true));
    expect(onPlayable).not.toHaveBeenCalled();

    mocks.getEntryById.mockResolvedValue(row(false));
    act(() => notify());
    await waitFor(() => expect(onPlayable).toHaveBeenCalledTimes(1));
    expect(onPlayable).toHaveBeenCalledWith(expect.objectContaining({ id: 'entry-1' }));

    // Later replica changes never repeat it, so a manual status change made
    // while the sheet is open is not overwritten.
    act(() => notify());
    act(() => notify());
    await waitFor(() => expect(mocks.getEntryById).toHaveBeenCalledTimes(4));
    expect(onPlayable).toHaveBeenCalledTimes(1);
  });

  it('moves an unheld dog in-ring on open, and never a missing row', async () => {
    const onPlayable = vi.fn();
    mocks.getEntryById.mockResolvedValue(null);
    const { rerender } = renderHook(({ id }) => useEntryHeld(id, onPlayable), {
      initialProps: { id: 'entry-1' },
    });
    await waitFor(() => expect(mocks.getEntryById).toHaveBeenCalledWith('entry-1'));
    expect(onPlayable).not.toHaveBeenCalled();

    // A cold cache: the row arrives with the first sync.
    mocks.getEntryById.mockResolvedValue(row(false));
    act(() => notify());
    await waitFor(() => expect(onPlayable).toHaveBeenCalledTimes(1));

    rerender({ id: 'entry-2' });
    await waitFor(() => expect(onPlayable).toHaveBeenCalledTimes(2));
  });

  it('locks only a hold present when the sheet opens; a later hold never freezes the sheet', async () => {
    mocks.getEntryById.mockResolvedValue(row(true));
    const { result } = renderHook(() => useEntryHeld('entry-1'));
    await waitFor(() => expect(result.current).toEqual({ held: true, locked: true }));

    mocks.getEntryById.mockResolvedValue(row(false));
    act(() => notify());
    await waitFor(() => expect(result.current).toEqual({ held: false, locked: false }));

    // Held again after it cleared: the sheet may be mid run, so warn, never lock.
    mocks.getEntryById.mockResolvedValue(row(true));
    act(() => notify());
    await waitFor(() => expect(result.current).toEqual({ held: true, locked: false }));
  });

  it('warns but does not lock when a hold arrives on a sheet opened unheld', async () => {
    mocks.getEntryById.mockResolvedValue(row(false));
    const { result } = renderHook(() => useEntryHeld('entry-1'));
    await waitFor(() => expect(mocks.getEntryById).toHaveBeenCalled());

    mocks.getEntryById.mockResolvedValue(row(true));
    act(() => notify());
    await waitFor(() => expect(result.current).toEqual({ held: true, locked: false }));
  });
});
