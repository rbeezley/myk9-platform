import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

const chain = vi.hoisted(() => {
  const result = { data: [] as unknown[], error: null as unknown };
  const pages: Array<{ data: unknown[]; error: unknown }> = [];
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.from = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.is = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.range = vi.fn(() => Promise.resolve(pages.shift() ?? result));
  return { result, pages, builder };
});

vi.mock('../supabaseClient', () => ({
  supabase: { from: chain.builder.from },
  logQuery: vi.fn(),
  createDatabaseError,
}));

import { getClubsAwaitingAuthorization } from './reads';

describe('getClubsAwaitingAuthorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chain.result.data = [{ id: 'late-1', name: 'Zulu Club', authorized_at: null }];
    chain.result.error = null;
    chain.pages.length = 0;
  });

  it('filters pending clubs on the server, not after a capped full-table read', async () => {
    const { data, error } = await getClubsAwaitingAuthorization();

    expect(chain.builder.from).toHaveBeenCalledWith('clubs');
    expect(chain.builder.is).toHaveBeenCalledWith('authorized_at', null);
    expect(chain.builder.is).toHaveBeenCalledWith('deleted_at', null);
    expect(chain.builder.order).toHaveBeenNthCalledWith(1, 'created_at', { ascending: true });
    expect(chain.builder.order).toHaveBeenNthCalledWith(2, 'id', { ascending: true });
    expect(chain.builder.range).toHaveBeenCalledWith(0, 999);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: 'late-1', name: 'Zulu Club', authorized_at: null }]);
  });

  it('reads every creator when none is given', async () => {
    await getClubsAwaitingAuthorization();

    expect(chain.builder.eq).not.toHaveBeenCalled();
  });

  it("narrows to one creator's pending clubs on the server (MYK9-1395 notice link)", async () => {
    await getClubsAwaitingAuthorization('00000000-0000-0000-0000-000000000104');

    expect(chain.builder.eq).toHaveBeenCalledWith(
      'created_by',
      '00000000-0000-0000-0000-000000000104'
    );
    expect(chain.builder.is).toHaveBeenCalledWith('authorized_at', null);
  });

  it('returns the error instead of an empty list when the read fails', async () => {
    chain.result.data = [];
    chain.result.error = new Error('boom');

    const { data, error } = await getClubsAwaitingAuthorization();

    expect(data).toEqual([]);
    expect(error).not.toBeNull();
  });

  describe.each([
    ['without a creator filter', undefined],
    ['with a creator filter', '00000000-0000-0000-0000-000000000104'],
  ])('paging %s', (_label, creator) => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ id: `club-${i}` }));

    it('reads on past a full page and returns every row', async () => {
      chain.pages.push(
        { data: fullPage, error: null },
        { data: [{ id: 'club-1000' }], error: null }
      );

      const { data, error } = await getClubsAwaitingAuthorization(creator);

      expect(error).toBeNull();
      expect(data).toHaveLength(1001);
      expect(data[1000]).toEqual({ id: 'club-1000' });
      expect(chain.builder.range).toHaveBeenNthCalledWith(1, 0, 999);
      expect(chain.builder.range).toHaveBeenNthCalledWith(2, 1000, 1999);
      expect(chain.builder.range).toHaveBeenCalledTimes(2);
      expect(chain.builder.order).toHaveBeenCalledTimes(4);
      expect(chain.builder.is).toHaveBeenCalledTimes(4);
      expect(chain.builder.eq).toHaveBeenCalledTimes(creator ? 2 : 0);
    });

    it('stops after one read when the first page is short', async () => {
      const { data } = await getClubsAwaitingAuthorization(creator);

      expect(data).toHaveLength(1);
      expect(chain.builder.range).toHaveBeenCalledTimes(1);
    });

    it('returns the error and no partial list when a later page fails', async () => {
      chain.pages.push(
        { data: fullPage, error: null },
        { data: [], error: createDatabaseError(new Error('boom'), 'club', 'select') }
      );

      const { data, error } = await getClubsAwaitingAuthorization(creator);

      expect(data).toEqual([]);
      expect(error).not.toBeNull();
    });
  });
});
