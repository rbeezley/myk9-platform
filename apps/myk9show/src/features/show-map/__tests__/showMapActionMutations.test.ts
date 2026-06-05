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
const mockUpdateReplicatedCheckInStatus = vi.fn();
const mockUpdateReplicatedDayOfScratch = vi.fn();
const mockUpdateReplicatedEntry = vi.fn();
const mockGetReplicatedEntryById = vi.fn();
const mockGetReplicatedClassById = vi.fn();
const mockGetReplicatedEntriesByClass = vi.fn();
const mockCreateReplicatedEntry = vi.fn();
const mockDeleteReplicatedEntry = vi.fn();
const mockAuditLog = vi.fn<() => Promise<void>>(() => Promise.resolve());

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

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedCheckInStatus: (...args: unknown[]) =>
    mockUpdateReplicatedCheckInStatus(...args),
  updateReplicatedDayOfScratch: (...args: unknown[]) =>
    mockUpdateReplicatedDayOfScratch(...args),
}));

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    updateClass: vi.fn(() => Promise.resolve('class-mutation-1')),
    getClassById: (...args: unknown[]) => mockGetReplicatedClassById(...args),
  },
  replicatedEntriesTable: {
    updateEntry: (...args: unknown[]) => mockUpdateReplicatedEntry(...args),
    getEntryById: (...args: unknown[]) => mockGetReplicatedEntryById(...args),
    getEntriesByClass: (...args: unknown[]) => mockGetReplicatedEntriesByClass(...args),
    createEntry: (...args: unknown[]) => mockCreateReplicatedEntry(...args),
    deleteEntry: (...args: unknown[]) => mockDeleteReplicatedEntry(...args),
  },
}));

vi.mock('@/services/AuditService', () => ({
  auditService: {
    log: (...args: unknown[]) => mockAuditLog(...args),
  },
}));

vi.mock('@/types/audit-types', () => ({
  AuditAction: {
    UPDATE: 'update',
  },
}));

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
    mockUpdateReplicatedCheckInStatus.mockResolvedValue('mutation-1');
    mockUpdateReplicatedDayOfScratch.mockResolvedValue('mutation-2');
    mockUpdateReplicatedEntry.mockResolvedValue('entry-mutation-1');
    mockGetReplicatedEntryById.mockResolvedValue({
      id: 'entry-1',
      showId: 'show-1',
      dogId: 'dog-1',
      classId: 'class-1',
      trialId: 'trial-1',
      entryStatus: 'checked-in',
      checkInStatus: 'checked-in',
      specialRequests: 'Bring paper form',
      jumpHeight: '12',
      handler: 'Jane Handler',
      armband: '101',
    });
    mockGetReplicatedClassById.mockResolvedValue({
      id: 'class-2',
      trialId: 'trial-2',
      name: 'Advanced A',
      maxEntries: 50,
    });
    mockGetReplicatedEntriesByClass.mockResolvedValue([]);
    mockCreateReplicatedEntry.mockImplementation(entry => Promise.resolve(entry));
    mockDeleteReplicatedEntry.mockResolvedValue('delete-mutation-1');
    mockAuditLog.mockResolvedValue();
  });

  it('extracts the source id from a typed Show Map node id', () => {
    expect(sourceIdFromShowMapNodeId('entry:entry-123', 'entry')).toBe('entry-123');
    expect(sourceIdFromShowMapNodeId('class:class-123', 'entry')).toBeNull();
    expect(sourceIdFromShowMapNodeId('entry:', 'entry')).toBeNull();
  });

  it('queues check_in_status = "checked-in" through the replicated entry table', async () => {
    await markShowMapEntryCheckedIn('entry-1');

    expect(mockUpdateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('surfaces replicated check-in update failures', async () => {
    mockUpdateReplicatedCheckInStatus.mockRejectedValueOnce(new Error('replica unavailable'));

    await expect(markShowMapEntryCheckedIn('entry-1')).rejects.toThrow('replica unavailable');
  });

  it('queues a scratch / no-show as pulled through the replicated entry table', async () => {
    await scratchShowMapEntry('entry-1', 'Dog absent');

    expect(mockUpdateReplicatedDayOfScratch).toHaveBeenCalledWith('entry-1', 'Dog absent');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('uses a plain default reason when scratch / no-show has no typed reason', async () => {
    await scratchShowMapEntry('entry-1', '  ');

    expect(mockUpdateReplicatedDayOfScratch).toHaveBeenCalledWith(
      'entry-1',
      'Marked no-show from Show Map'
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

  it('moves an entry up through replicated entry mutations and returns undo data', async () => {
    const result = await moveUpShowMapEntry({
      entryId: 'entry-1',
      targetClassId: 'class-2',
      reason: 'Qualified today',
    });

    expect(result).toMatchObject({
      originalEntryId: 'entry-1',
      previousEntryStatus: 'checked-in',
      previousCheckInStatus: 'checked-in',
      previousSpecialRequests: 'Bring paper form',
      targetClassName: 'Advanced A',
    });
    expect(result.newEntryId).toEqual(expect.any(String));

    expect(mockUpdateReplicatedEntry).toHaveBeenCalledWith(
      'entry-1',
      expect.objectContaining({
        entryStatus: 'moved',
        entry_status: 'moved',
        specialRequests: 'Moved up to Advanced A: Qualified today',
        special_requests: 'Moved up to Advanced A: Qualified today',
      })
    );
    expect(mockCreateReplicatedEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: result.newEntryId,
        dogId: 'dog-1',
        showId: 'show-1',
        classId: 'class-2',
        trialId: 'trial-2',
        entryStatus: 'confirmed',
        paymentStatus: 'waived',
        entryFee: 0,
        specialRequests: 'Moved up from class class-1: Qualified today',
      })
    );
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityType: 'entry',
        entityId: 'entry-1',
        changes: { entryStatus: { from: 'checked-in', to: 'moved' } },
        metadata: expect.objectContaining({
          action: 'mark_entry_moved',
          reason: 'Qualified today',
          targetClassName: 'Advanced A',
        }),
      })
    );
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockProcessMoveUp).not.toHaveBeenCalled();
  });

  it('surfaces a replicated move-up capacity error', async () => {
    mockGetReplicatedClassById.mockResolvedValue({
      id: 'class-2',
      trialId: 'trial-2',
      name: 'Advanced A',
      maxEntries: 1,
    });
    mockGetReplicatedEntriesByClass.mockResolvedValue([{ entryStatus: 'confirmed' }]);

    await expect(
      moveUpShowMapEntry({
        entryId: 'entry-1',
        targetClassId: 'class-2',
      })
    ).rejects.toThrow('Target class is full');
  });

  it('preserves the create failure when move-up rollback also fails', async () => {
    mockCreateReplicatedEntry.mockRejectedValueOnce(new Error('create failed'));
    mockUpdateReplicatedEntry
      .mockResolvedValueOnce('mark-moved')
      .mockRejectedValueOnce(new Error('rollback failed'));

    await expect(
      moveUpShowMapEntry({
        entryId: 'entry-1',
        targetClassId: 'class-2',
      })
    ).rejects.toThrow('create failed');

    expect(mockUpdateReplicatedEntry).toHaveBeenCalledTimes(2);
  });

  it('undoes a move-up by soft-deleting the new replicated entry before restoring the original entry', async () => {
    await undoShowMapMoveUp({
      originalEntryId: 'entry-1',
      newEntryId: 'new-entry-1',
      previousEntryStatus: 'checked-in',
      previousCheckInStatus: 'checked-in',
      previousSpecialRequests: null,
    });

    expect(mockDeleteReplicatedEntry).not.toHaveBeenCalled();
    expect(mockUpdateReplicatedEntry).toHaveBeenCalledWith(
      'new-entry-1',
      expect.objectContaining({
        deletedAt: expect.any(String),
        deleted_at: expect.any(String),
      })
    );
    expect(mockUpdateReplicatedEntry).toHaveBeenCalledWith(
      'entry-1',
      expect.objectContaining({
        entryStatus: 'checked-in',
        entry_status: 'checked-in',
        checkInStatus: 'checked-in',
        check_in_status: 'checked-in',
        specialRequests: null,
        special_requests: null,
      })
    );
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityType: 'entry',
        entityId: 'entry-1',
        changes: { entryStatus: { from: 'moved', to: 'checked-in' } },
        metadata: expect.objectContaining({
          action: 'restore_entry_status',
          checkInStatus: 'checked-in',
        }),
      })
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does not restore the original entry when undo cannot soft-delete the move-up entry', async () => {
    mockUpdateReplicatedEntry.mockRejectedValueOnce(new Error('replica soft delete failed'));

    await expect(
      undoShowMapMoveUp({
        originalEntryId: 'entry-1',
        newEntryId: 'new-entry-1',
        previousEntryStatus: 'checked-in',
        previousCheckInStatus: 'checked-in',
        previousSpecialRequests: null,
      })
    ).rejects.toThrow('replica soft delete failed');

    expect(mockDeleteReplicatedEntry).not.toHaveBeenCalled();
    expect(mockUpdateReplicatedEntry).toHaveBeenCalledTimes(1);
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
