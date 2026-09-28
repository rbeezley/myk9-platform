/**
 * MYK9-845: drives the REAL prop shape produced by useEntryFormData's query
 * mapping into computeUKCEntryFormGridMarks, so a future last-hop drop of
 * `entry_status` between the query and the grid function fails this test
 * instead of only a hand-built fixture (docs/lessons/README.md#last-hop-drop).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { createChainableQuery } from '@/test/mocks/supabase';
import { computeUKCEntryFormGridMarks } from '@/features/organization-forms/ukcNoseworkEntryFormGrid';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

import { useEntryFormData } from '../useEntryFormData';

const OWNER = {
  id: 'person-owner',
  first_name: 'Sarah',
  last_name: 'Owner',
  street_address: null,
  city: null,
  state: null,
  zip_code: null,
  phone: null,
  email: null,
};

type EntryRow = {
  id: string;
  class_id: string;
  entry_status: string | null;
};

function routeTables(entries: EntryRow[]) {
  const rows: Record<string, unknown[]> = {
    shows: [],
    trials: [{ id: 'trial-1', date: '2026-10-10', trial_number: 'Trial 1' }],
    classes: [
      { id: 'class-novice', trial_id: 'trial-1', element: 'Container', level: 'Novice' },
      { id: 'class-advanced', trial_id: 'trial-1', element: 'Container', level: 'Advanced' },
    ],
    entries: entries.map(e => ({
      ...e,
      dog_id: 'dog-1',
      trial_id: 'trial-1',
      armband: 101,
      handler: null,
      handler_id: null,
      submitted_at: null,
    })),
    dogs: [
      {
        id: 'dog-1',
        call_name: 'Buddy',
        sex: 'Female',
        date_of_birth: '2022-01-01',
        owner_id: OWNER.id,
        breeder_id: null,
      },
    ],
    dog_registrations: [],
    pedigree_ancestors: [],
    people: [OWNER],
    people_private: [],
  };
  mocks.from.mockImplementation((table: string) =>
    createChainableQuery({ data: rows[table] ?? [], error: null })
  );
}

function renderEntryFormData() {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => useEntryFormData({ showId: 'show-1' }), { wrapper });
}

describe('useEntryFormData -> computeUKCEntryFormGridMarks (real prop shape)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: [], error: null });
  });

  it('carries entry_status through to the grid function, which skips the superseded move-up source', async () => {
    routeTables([
      { id: 'entry-novice-superseded', class_id: 'class-novice', entry_status: 'moved' },
      { id: 'entry-advanced-current', class_id: 'class-advanced', entry_status: 'confirmed' },
    ]);
    const { result } = renderEntryFormData();
    await waitFor(() => expect(result.current.dogs).toHaveLength(1));

    const dog = result.current.dogs[0]!;
    expect(dog.entries.map(e => e.entryStatus)).toEqual(
      expect.arrayContaining(['moved', 'confirmed'])
    );

    const marks = computeUKCEntryFormGridMarks(dog, result.current.trials);
    // Trial 1 bracket + the Advanced/Container cell for the live entry only.
    expect(marks).toHaveLength(2);
  });

  it('produces no marks at all for a withdrawn-only entry fetched through the real query mapping', async () => {
    routeTables([{ id: 'entry-1', class_id: 'class-novice', entry_status: 'withdrawn' }]);
    const { result } = renderEntryFormData();
    await waitFor(() => expect(result.current.dogs).toHaveLength(1));

    const dog = result.current.dogs[0]!;
    expect(dog.entries[0]!.entryStatus).toBe('withdrawn');

    const marks = computeUKCEntryFormGridMarks(dog, result.current.trials);
    expect(marks).toHaveLength(0);
  });

  it('still marks an active entry fetched through the real query mapping', async () => {
    routeTables([{ id: 'entry-1', class_id: 'class-novice', entry_status: 'confirmed' }]);
    const { result } = renderEntryFormData();
    await waitFor(() => expect(result.current.dogs).toHaveLength(1));

    const dog = result.current.dogs[0]!;
    const marks = computeUKCEntryFormGridMarks(dog, result.current.trials);
    expect(marks).toHaveLength(2);
  });
});
