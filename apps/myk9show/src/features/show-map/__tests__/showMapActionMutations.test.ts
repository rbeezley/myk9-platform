import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getShowMapHandlerMessageTarget,
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
  logQuery: vi.fn(),
  createDatabaseError: (err: unknown) => {
    if (err instanceof Error) return err;
    if (err && typeof err === 'object' && 'message' in err) {
      return new Error(String((err as { message: unknown }).message));
    }
    return new Error(String(err));
  },
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

/**
 * Chain that mirrors `update(...).eq('id', ...).select(...).single()` — used
 * by lifecycle transitions that return the updated row.
 */
function makeUpdateSelectSingleChain(
  result: { data: Record<string, unknown> | null; error: Error | null } = {
    data: { id: 'entry-1' },
    error: null,
  }
) {
  const chain = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
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
    const chain = makeUpdateSelectSingleChain();
    mockFrom.mockReturnValue(chain);

    await scratchShowMapEntry('entry-1', 'Dog absent');

    expect(mockFrom).toHaveBeenCalledWith('entries');
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        entry_status: 'scratched',
        check_in_status: 'pulled',
        withdrawal_reason: 'Dog absent',
        // Routed through scratchEntryDayOf, which also writes special_requests
        // so the pull reason is visible ringside.
        special_requests: 'Dog absent',
        updated_at: expect.any(String),
      })
    );
    expect(chain.eq).toHaveBeenCalledWith('id', 'entry-1');
  });

  it('uses a plain default reason when scratch / no-show has no typed reason', async () => {
    const chain = makeUpdateSelectSingleChain();
    mockFrom.mockReturnValue(chain);

    await scratchShowMapEntry('entry-1', '  ');

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        withdrawal_reason: 'Marked no-show from Show Map',
      })
    );
  });

  it('resolves a handler messaging target from the entry handler account', async () => {
    const chain = makeSelectSingleChain({
      data: {
        handler: 'Jane Handler',
        handler_id: 'person-1',
        handler_person: {
          auth_user_id: 'handler-auth-1',
          first_name: 'Jane',
          last_name: 'Handler',
        },
        dog: { call_name: 'Bella' },
        class: { name: 'Interior Novice A' },
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    await expect(getShowMapHandlerMessageTarget('entry-1')).resolves.toEqual({
      participantAuthUserId: 'handler-auth-1',
      handlerName: 'Jane Handler',
      dogName: 'Bella',
      className: 'Interior Novice A',
    });

    expect(mockFrom).toHaveBeenCalledWith('entries');
    expect(chain.select).toHaveBeenCalledWith(expect.stringContaining('handler_person'));
    expect(chain.eq).toHaveBeenCalledWith('id', 'entry-1');
  });

  it('fails clearly when a handler does not have a messaging account', async () => {
    const chain = makeSelectSingleChain({
      data: {
        handler: 'Jane Handler',
        handler_id: 'person-1',
        handler_person: {
          auth_user_id: null,
          first_name: 'Jane',
          last_name: 'Handler',
        },
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    await expect(getShowMapHandlerMessageTarget('entry-1')).rejects.toThrow('messaging account');
  });

  it('fails clearly when an entry has no handler assigned', async () => {
    const chain = makeSelectSingleChain({
      data: {
        handler: null,
        handler_id: null,
        handler_person: null,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);

    await expect(getShowMapHandlerMessageTarget('entry-1')).rejects.toThrow(
      'does not have a handler assigned'
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

  it('surfaces a day-of move-up operation error', async () => {
    const chain = makeSelectSingleChain({
      data: {
        entry_status: 'checked-in',
        check_in_status: 'checked-in',
        special_requests: null,
      },
      error: null,
    });
    mockFrom.mockReturnValue(chain);
    mockProcessMoveUp.mockResolvedValue({
      data: null,
      error: { message: 'Target class is full' },
    });

    await expect(
      moveUpShowMapEntry({
        entryId: 'entry-1',
        targetClassId: 'class-2',
      })
    ).rejects.toThrow('Target class is full');
  });

  it('undoes a move-up by soft-deleting the new entry before restoring the original entry', async () => {
    const removeChain = makeUpdateChain();
    const restoreChain = makeUpdateChain();
    mockFrom.mockReturnValueOnce(removeChain).mockReturnValueOnce(restoreChain);

    await undoShowMapMoveUp({
      originalEntryId: 'entry-1',
      newEntryId: 'new-entry-1',
      previousEntryStatus: 'checked-in',
      previousCheckInStatus: 'checked-in',
      previousSpecialRequests: null,
    });

    expect(removeChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted_at: expect.any(String),
        updated_at: expect.any(String),
      })
    );
    expect(removeChain.eq).toHaveBeenCalledWith('id', 'new-entry-1');
    expect(restoreChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        entry_status: 'checked-in',
        check_in_status: 'checked-in',
        special_requests: null,
        updated_at: expect.any(String),
      })
    );
    expect(restoreChain.eq).toHaveBeenCalledWith('id', 'entry-1');
  });

  it('does not restore the original entry when undo cannot soft-delete the move-up entry', async () => {
    const removeChain = makeUpdateChain({ error: new Error('permission denied') });
    mockFrom.mockReturnValueOnce(removeChain);

    await expect(
      undoShowMapMoveUp({
        originalEntryId: 'entry-1',
        newEntryId: 'new-entry-1',
        previousEntryStatus: 'checked-in',
        previousCheckInStatus: 'checked-in',
        previousSpecialRequests: null,
      })
    ).rejects.toThrow('permission denied');

    expect(removeChain.eq).toHaveBeenCalledWith('id', 'new-entry-1');
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('fails loudly when undo did not capture the original entry status', async () => {
    await expect(
      undoShowMapMoveUp({
        originalEntryId: 'entry-1',
        newEntryId: 'new-entry-1',
        previousEntryStatus: null,
        previousCheckInStatus: 'checked-in',
        previousSpecialRequests: null,
      })
    ).rejects.toThrow('original entry status was not captured');

    expect(mockFrom).not.toHaveBeenCalled();
  });
});
