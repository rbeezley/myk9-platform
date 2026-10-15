/**
 * MYK9-1162: no armband label for an entry awaiting a registration number. The
 * flag is read from the entry-results view; if that read fails (or the view
 * predates the column) nothing is excluded, so labels are never withheld.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  held: { data: [] as Array<{ id: string }> | null, error: null as unknown },
  // When set, the held lookup does not answer until this promise resolves.
  heldGate: null as Promise<void> | null,
}));

const entryRows = [
  { id: 'ok', dog_id: 'd1', armband: 101, dog: { call_name: 'Ok', owner: null }, class: null },
  { id: 'held', dog_id: 'd2', armband: 102, dog: { call_name: 'Held', owner: null }, class: null },
];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const result = table === 'entries' ? { data: entryRows, error: null } : state.held;
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'is', 'not', 'filter']) {
        chain[method] = () => chain;
      }
      chain.then = (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown
      ) => {
        const gate = table === 'entries' ? null : state.heldGate;
        return (gate ?? Promise.resolve()).then(() => resolve(result), reject);
      };
      return chain;
    },
  },
}));
vi.mock('../useShowVenueWifi', () => ({
  useShowVenueWifi: () => ({ data: null, isLoading: false }),
}));

import { ARMBAND_LABEL_HELD_ENTRIES_KEY, useArmbandLabelData } from '../useArmbandLabelData';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function labelIds(): Promise<string[]> {
  const { result } = renderHook(() => useArmbandLabelData('show-1'), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  // The held read settles independently of the label read.
  await waitFor(() => expect(result.current.entries.length).toBeGreaterThan(0));
  await new Promise(resolve => setTimeout(resolve, 20));
  return result.current.entries.map(entry => entry.id);
}

describe('useArmbandLabelData entries awaiting a registration number', () => {
  beforeEach(() => {
    state.held = { data: [], error: null };
    state.heldGate = null;
  });

  it('leaves the held entry out and keeps the others', async () => {
    state.held = { data: [{ id: 'held' }], error: null };
    expect(await labelIds()).toEqual(['ok']);
  });

  it('withholds nothing when the flag cannot be read', async () => {
    state.held = { data: null, error: { message: 'column does not exist' } };
    expect(await labelIds()).toEqual(['ok', 'held']);
  });

  it('prints no label while the held lookup is still pending, then drops the held one', async () => {
    state.held = { data: [{ id: 'held' }], error: null };
    let release: () => void = () => undefined;
    state.heldGate = new Promise<void>(resolve => {
      release = resolve;
    });
    const { result } = renderHook(() => useArmbandLabelData('show-1'), { wrapper });

    // The label read finishes first; labels must not be built from it yet.
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(result.current.entries).toEqual([]);
    expect(result.current.isLoading).toBe(true);

    release();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries.map(entry => entry.id)).toEqual(['ok']);
  });

  it('withholds labels during a refetch, so a cached "nothing held" answer cannot print a newly held dog', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const sharedWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useArmbandLabelData('show-1'), {
      wrapper: sharedWrapper,
    });
    await waitFor(() =>
      expect(result.current.entries.map(entry => entry.id)).toEqual(['ok', 'held'])
    );

    // The number is removed: the next lookup answers "held", but slowly.
    state.held = { data: [{ id: 'held' }], error: null };
    let release: () => void = () => undefined;
    state.heldGate = new Promise<void>(resolve => {
      release = resolve;
    });
    void client.invalidateQueries({ queryKey: ARMBAND_LABEL_HELD_ENTRIES_KEY });

    await waitFor(() => expect(result.current.isLoading).toBe(true));
    expect(result.current.entries).toEqual([]);

    release();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries.map(entry => entry.id)).toEqual(['ok']);
  });
});
