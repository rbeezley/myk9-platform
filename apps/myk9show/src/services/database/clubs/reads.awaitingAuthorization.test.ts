import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

const chain = vi.hoisted(() => {
  const result = { data: [] as unknown[], error: null as unknown };
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.from = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.is = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => Promise.resolve(result));
  return { result, builder };
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
  });

  it('filters pending clubs on the server, not after a capped full-table read', async () => {
    const { data, error } = await getClubsAwaitingAuthorization();

    expect(chain.builder.from).toHaveBeenCalledWith('clubs');
    expect(chain.builder.is).toHaveBeenCalledWith('authorized_at', null);
    expect(chain.builder.is).toHaveBeenCalledWith('deleted_at', null);
    expect(chain.builder.order).toHaveBeenCalledWith('created_at', { ascending: true });
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
});
