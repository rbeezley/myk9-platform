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
      chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
      return chain;
    },
  },
}));
vi.mock('../useShowVenueWifi', () => ({
  useShowVenueWifi: () => ({ data: null, isLoading: false }),
}));

import { useArmbandLabelData } from '../useArmbandLabelData';

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
  });

  it('leaves the held entry out and keeps the others', async () => {
    state.held = { data: [{ id: 'held' }], error: null };
    expect(await labelIds()).toEqual(['ok']);
  });

  it('withholds nothing when the flag cannot be read', async () => {
    state.held = { data: null, error: { message: 'column does not exist' } };
    expect(await labelIds()).toEqual(['ok', 'held']);
  });
});
