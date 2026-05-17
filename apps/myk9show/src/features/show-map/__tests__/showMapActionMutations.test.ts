import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markShowMapEntryCheckedIn,
  sourceIdFromShowMapNodeId,
} from '../showMapActionMutations';

const mockFrom = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  createDatabaseError: (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
}));

function makeUpdateChain(result: { error: Error | null } = { error: null }) {
  const chain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

describe('showMapActionMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts the source id from a typed Show Map node id', () => {
    expect(sourceIdFromShowMapNodeId('entry:entry-123', 'entry')).toBe('entry-123');
    expect(sourceIdFromShowMapNodeId('class:class-123', 'entry')).toBeNull();
    expect(sourceIdFromShowMapNodeId('entry:', 'entry')).toBeNull();
  });

  it('writes check_in_status = "checked-in" to the matching entry row', async () => {
    const chain = makeUpdateChain();
    mockFrom.mockReturnValue(chain);

    await markShowMapEntryCheckedIn('entry-1');

    expect(mockFrom).toHaveBeenCalledWith('entries');
    expect(chain.update).toHaveBeenCalledWith({ check_in_status: 'checked-in' });
    expect(chain.eq).toHaveBeenCalledWith('id', 'entry-1');
  });

  it('throws a friendly database error when the update fails', async () => {
    const chain = makeUpdateChain({ error: new Error('permission denied') });
    mockFrom.mockReturnValue(chain);

    await expect(markShowMapEntryCheckedIn('entry-1')).rejects.toThrow('permission denied');
  });
});
