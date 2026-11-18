import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRefundEntryNames } from './refundEntryNames';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  inFilter: vi.fn(),
  is: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: { from: mocks.from },
  logQuery: vi.fn(),
  createDatabaseError: (error: unknown) => error,
}));

beforeEach(() => {
  vi.clearAllMocks();
  const chain = { select: mocks.select, in: mocks.inFilter, is: mocks.is };
  mocks.from.mockReturnValue(chain);
  mocks.select.mockReturnValue(chain);
  mocks.inFilter.mockResolvedValue({ data: [{ id: 'e1', handler: null, dog: null }], error: null });
});

describe('getRefundEntryNames (MYK9-1862)', () => {
  it('reads exactly the given entry ids, soft-deleted rows included', async () => {
    const rows = await getRefundEntryNames(['e1', 'e2', 'e1']);

    expect(mocks.from).toHaveBeenCalledWith('entries');
    expect(mocks.select).toHaveBeenCalledWith(
      'id, handler, dog:dog_id ( id, name, call_name, owner:owner_id ( first_name, last_name ) )'
    );
    expect(mocks.inFilter).toHaveBeenCalledWith('id', ['e1', 'e2']);
    expect(mocks.is).not.toHaveBeenCalled();
    expect(rows).toEqual([{ id: 'e1', handler: null, dog: null }]);
  });

  it('throws on a failed read, so the page can offer Try again', async () => {
    mocks.inFilter.mockResolvedValue({ data: null, error: { message: 'offline' } });
    await expect(getRefundEntryNames(['e1'])).rejects.toEqual({ message: 'offline' });
  });
});
