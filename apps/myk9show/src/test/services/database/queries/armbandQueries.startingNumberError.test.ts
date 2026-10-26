import { createDatabaseError } from '@/services/database/databaseError';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// MYK9-1411: a failed read of shows.starting_armband_number must reject, not
// silently fall back to 100. The 100 default is only for a successful read
// that returns a null or invalid value.
// ---------------------------------------------------------------------------

const { mockArmbandsTable, mockEntriesTable } = vi.hoisted(() => ({
  mockArmbandsTable: {
    getByShow: vi.fn(),
  },
  mockEntriesTable: {
    getEntryById: vi.fn(),
  },
}));

vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: mockArmbandsTable,
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mockEntriesTable,
}));

const { mockSupabase } = vi.hoisted(() => ({
  mockSupabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
  logQuery: vi.fn(),
  createDatabaseError,
}));

import { getNextArmbandForShow } from '@/services/database/armbands';

type ShowsReadResult = {
  data: { starting_armband_number: number | null } | null;
  error: { message: string; code?: string } | null;
};

function setupShowsRead(result: ShowsReadResult) {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table !== 'shows') {
      return {};
    }

    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue(result),
        }),
      }),
    };
  });
}

describe('getNextArmbandForShow starting number read (MYK9-1411)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockArmbandsTable.getByShow.mockResolvedValue([]);
  });

  it('rejects when the starting_armband_number read fails instead of defaulting to 100', async () => {
    setupShowsRead({
      data: null,
      error: { message: 'connection reset', code: 'PGRST000' },
    });

    await expect(getNextArmbandForShow('show-1')).rejects.toMatchObject({
      name: 'DatabaseError',
      message: 'connection reset',
    });
  });

  it('keeps the 100 default for a successful read with a null starting number', async () => {
    setupShowsRead({ data: { starting_armband_number: null }, error: null });

    await expect(getNextArmbandForShow('show-1')).resolves.toBe(100);
  });

  it('keeps the 100 default for a successful read that finds no show row', async () => {
    setupShowsRead({ data: null, error: null });

    await expect(getNextArmbandForShow('show-1')).resolves.toBe(100);
  });
});
