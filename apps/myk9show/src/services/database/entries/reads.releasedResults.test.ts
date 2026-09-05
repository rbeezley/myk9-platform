import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEntriesByShow } from './reads';

const mocks = vi.hoisted(() => ({ read: vi.fn(), from: vi.fn() }));
vi.mock('../_shared/read-shape', async importOriginal => ({
  ...(await importOriginal<typeof import('../_shared/read-shape')>()),
  readWithReplicationFallback: mocks.read,
}));
vi.mock('../supabaseClient', () => ({
  supabase: { from: mocks.from },
  createDatabaseError: vi.fn(),
  logQuery: vi.fn(),
}));

const entry = {
  id: 'entry-1',
  show_id: 'show-1',
  is_scored: true,
  result_status: null,
  search_time_seconds: null,
  final_placement: null,
  registrationData: { pendingEdit: true },
};

function view(rows: Record<string, unknown>[], error: unknown = null) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: rows, error }),
  };
  mocks.from.mockReturnValue(query);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ data: [entry], error: null });
});

describe('getEntriesByShow released result hydration', () => {
  it('reads released Q/time from the authenticated view while retaining entry identity', async () => {
    const query = view([
      {
        id: entry.id,
        result_status: 'qualified',
        search_time_seconds: 38.5,
        final_placement: null,
        show_id: 'must-not-overwrite',
      },
    ]);
    const { data } = await getEntriesByShow('show-1');
    expect(mocks.from).toHaveBeenCalledWith('view_authenticated_entry_results');
    expect(query.eq).toHaveBeenCalledWith('show_id', 'show-1');
    expect(query.in).toHaveBeenCalledWith('id', ['entry-1']);
    expect(data[0]).toMatchObject({
      ...entry,
      result_status: 'qualified',
      search_time_seconds: 38.5,
    });
  });

  it('keeps null visibility fields and never resurrects an entry missing from the canonical read', async () => {
    view([
      {
        id: entry.id,
        result_status: 'qualified',
        final_placement: null,
        search_time_seconds: null,
      },
      { id: 'deleted-entry', result_status: 'qualified' },
    ]);
    const { data } = await getEntriesByShow('show-1');
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      result_status: 'qualified',
      search_time_seconds: null,
      final_placement: null,
    });
  });

  it.each(['error', 'throw'])(
    'keeps offline entries and masks raw scores on view %s',
    async failure => {
      mocks.read.mockResolvedValue({
        data: [{ ...entry, result_status: 'qualified', final_placement: 1 }],
        error: null,
      });
      const query = view([], new Error('unavailable'));
      if (failure === 'throw') query.range.mockRejectedValue(new Error('offline'));
      const { data, error } = await getEntriesByShow('show-1');
      expect(error).toBeNull();
      expect(data[0]).toMatchObject({ id: entry.id, result_status: null, final_placement: null });
    }
  );

  it('does not fetch results for an unscored show', async () => {
    mocks.read.mockResolvedValue({ data: [{ ...entry, is_scored: false }], error: null });
    await getEntriesByShow('show-1');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('bounds ID batches so large shows do not lose released results to response limits', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({ ...entry, id: `entry-${index}` }));
    mocks.read.mockResolvedValue({ data: rows, error: null });
    const query = view([]);
    query.range.mockResolvedValueOnce({
      data: rows.slice(0, 100).map(row => ({ ...row, result_status: 'qualified' })),
      error: null,
    });
    query.range.mockResolvedValueOnce({
      data: [{ ...rows[100], result_status: 'qualified' }],
      error: null,
    });
    const { data } = await getEntriesByShow('show-1');
    expect(query.in).toHaveBeenCalledTimes(2);
    expect(query.range).toHaveBeenNthCalledWith(1, 0, 99);
    expect(query.range).toHaveBeenNthCalledWith(2, 0, 0);
    expect(data[100]).toMatchObject({ id: 'entry-100', result_status: 'qualified' });
  });
});
