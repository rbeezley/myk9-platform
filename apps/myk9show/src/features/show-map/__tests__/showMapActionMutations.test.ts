import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markShowMapEntryCheckedIn,
  moveUpShowMapEntry,
  scratchShowMapEntry,
  sourceIdFromShowMapNodeId,
  undoShowMapMoveUp,
} from '../showMapActionMutations';

const mockFrom = vi.fn();
const mockProcessMoveUp = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  createDatabaseError: (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
}));

vi.mock('@/services/database/day-of-operations', () => ({
  processMoveUp: (...args: unknown[]) => mockProcessMoveUp(...args),
}));

function makeUpdateChain(result: { error: Error | null } = { error: null }) {
  const chain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

function makeSelectSingleChain(result: {
  data: Record<string, unknown> | null;
  error: Error | null;
}) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
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

  it('marks a scratch / no-show as pulled for ringside propagation', async () => {
    const chain = makeUpdateChain();
    mockFrom.mockReturnValue(chain);

    await scratchShowMapEntry('entry-1', 'Dog absent');

    expect(mockFrom).toHaveBeenCalledWith('entries');
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        entry_status: 'scratched',
        check_in_status: 'pulled',
        withdrawal_reason: 'Dog absent',
        updated_at: expect.any(String),
      })
    );
    expect(chain.eq).toHaveBeenCalledWith('id', 'entry-1');
  });

  it('uses a plain default reason when scratch / no-show has no typed reason', async () => {
    const chain = makeUpdateChain();
    mockFrom.mockReturnValue(chain);

    await scratchShowMapEntry('entry-1', '  ');

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        withdrawal_reason: 'Marked no-show from Show Map',
      })
    );
  });

  it('moves an entry up through the day-of move-up operation and returns undo data', async () => {
    const chain = makeSelectSingleChain({
      data: {
        entry_status: 'checked-in',
        check_in_status: 'checked-in',
        special_requests: 'Bring paper form',
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);
    mockProcessMoveUp.mockResolvedValue({
      data: { id: 'new-entry-1', class: { name: 'Advanced A' } },
      error: null,
    });

    await expect(
      moveUpShowMapEntry({
        entryId: 'entry-1',
        targetClassId: 'class-2',
        reason: 'Qualified today',
      })
    ).resolves.toEqual({
      originalEntryId: 'entry-1',
      newEntryId: 'new-entry-1',
      previousEntryStatus: 'checked-in',
      previousCheckInStatus: 'checked-in',
      previousSpecialRequests: 'Bring paper form',
      targetClassName: 'Advanced A',
    });

    expect(chain.select).toHaveBeenCalledWith(
      'id, entry_status, check_in_status, special_requests'
    );
    expect(chain.eq).toHaveBeenCalledWith('id', 'entry-1');
    expect(mockProcessMoveUp).toHaveBeenCalledWith('entry-1', 'class-2', 'Qualified today');
  });

  it('undoes a move-up by restoring the original entry and soft-deleting the new entry', async () => {
    const restoreChain = makeUpdateChain();
    const removeChain = makeUpdateChain();
    mockFrom.mockReturnValueOnce(restoreChain).mockReturnValueOnce(removeChain);

    await undoShowMapMoveUp({
      originalEntryId: 'entry-1',
      newEntryId: 'new-entry-1',
      previousEntryStatus: 'checked-in',
      previousCheckInStatus: 'checked-in',
      previousSpecialRequests: null,
    });

    expect(restoreChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        entry_status: 'checked-in',
        check_in_status: 'checked-in',
        special_requests: null,
        updated_at: expect.any(String),
      })
    );
    expect(restoreChain.eq).toHaveBeenCalledWith('id', 'entry-1');
    expect(removeChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted_at: expect.any(String),
        updated_at: expect.any(String),
      })
    );
    expect(removeChain.eq).toHaveBeenCalledWith('id', 'new-entry-1');
  });
});
