import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getShowMapHandlerMessageTarget,
  approveShowMapEntry,
  bulkApproveShowMapEntries,
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
const mockUpdateReplicatedEntryStatus = vi.fn();
const mockGetReplicatedEntryById = vi.fn();
const mockGetReplicatedClassById = vi.fn();
const mockGetReplicatedEntriesByClass = vi.fn();
const mockGetReplicatedTrialById = vi.fn();
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
  updateReplicatedCheckInStatus: (...args: unknown[]) => mockUpdateReplicatedCheckInStatus(...args),
  updateReplicatedDayOfScratch: (...args: unknown[]) => mockUpdateReplicatedDayOfScratch(...args),
}));

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    updateClass: vi.fn(() => Promise.resolve('class-mutation-1')),
    getClassById: (...args: unknown[]) => mockGetReplicatedClassById(...args),
  },
  replicatedEntriesTable: {
    updateEntry: (...args: unknown[]) => mockUpdateReplicatedEntry(...args),
    updateEntryStatus: (...args: unknown[]) => mockUpdateReplicatedEntryStatus(...args),
    getEntryById: (...args: unknown[]) => mockGetReplicatedEntryById(...args),
    getEntriesByClass: (...args: unknown[]) => mockGetReplicatedEntriesByClass(...args),
    createEntry: (...args: unknown[]) => mockCreateReplicatedEntry(...args),
    deleteEntry: (...args: unknown[]) => mockDeleteReplicatedEntry(...args),
  },
  replicatedTrialsTable: {
    // Default to null (→ getTrialRegistry falls back to AKC), matching every existing
    // fixture's AKC-only levels. Multi-registry move-up coverage lives in
    // utils/moveUpEligibility.test.ts; this file only needs the resolution wired.
    getTrialById: (...args: unknown[]) => mockGetReplicatedTrialById(...args),
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
    // Source class-1 (Container Novice) → target class-2 (Container Advanced):
    // a valid same-element higher-level move-up. getClassById is id-aware so the
    // write-path eligibility check has real element/level to compare.
    mockGetReplicatedClassById.mockImplementation((id: string) => {
      if (id === 'class-1') {
        return Promise.resolve({
          id: 'class-1',
          trialId: 'trial-1',
          name: 'Novice A',
          element: 'Container',
          level: 'Novice',
          maxEntries: 50,
        });
      }
      return Promise.resolve({
        id: 'class-2',
        trialId: 'trial-2',
        name: 'Advanced A',
        element: 'Container',
        level: 'Advanced',
        maxEntries: 50,
      });
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

  it('marks the entry checked in through the replicated show-day helper', async () => {
    await markShowMapEntryCheckedIn('entry-1');

    expect(mockUpdateReplicatedCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('approves a Show Desk review entry through the replicated entry table', async () => {
    await approveShowMapEntry('entry-1');

    expect(mockUpdateReplicatedEntryStatus).toHaveBeenCalledWith('entry-1', 'confirmed');
    expect(mockUpdateReplicatedEntry).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('bulk approves Show Desk review entries through replicated entry mutations', async () => {
    await bulkApproveShowMapEntries(['entry-1', 'entry-2']);

    expect(mockUpdateReplicatedEntryStatus).toHaveBeenCalledWith('entry-1', 'confirmed');
    expect(mockUpdateReplicatedEntryStatus).toHaveBeenCalledWith('entry-2', 'confirmed');
    expect(mockUpdateReplicatedEntry).not.toHaveBeenCalled();
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
    mockGetReplicatedClassById.mockImplementation((id: string) => {
      if (id === 'class-1') {
        return Promise.resolve({
          id: 'class-1',
          trialId: 'trial-1',
          name: 'Novice A',
          element: 'Container',
          level: 'Novice',
          maxEntries: 50,
        });
      }
      return Promise.resolve({
        id: 'class-2',
        trialId: 'trial-2',
        name: 'Advanced A',
        element: 'Container',
        level: 'Advanced',
        maxEntries: 1,
      });
    });
    mockGetReplicatedEntriesByClass.mockResolvedValue([{ entryStatus: 'confirmed' }]);

    await expect(
      moveUpShowMapEntry({
        entryId: 'entry-1',
        targetClassId: 'class-2',
      })
    ).rejects.toThrow('Target class is full');
  });

  it('rejects a move-up to a lower/cross-element class (write-path enforcement)', async () => {
    // Source is Container Master; target class-2 is Container Advanced — a
    // LOWER level. The picker should never offer this, but the mutation must
    // reject it even if a stale UI or alternate surface submits it.
    mockGetReplicatedClassById.mockImplementation((id: string) => {
      if (id === 'class-1') {
        return Promise.resolve({
          id: 'class-1',
          trialId: 'trial-1',
          name: 'Container Master',
          element: 'Container',
          level: 'Master',
          maxEntries: 50,
        });
      }
      return Promise.resolve({
        id: 'class-2',
        trialId: 'trial-2',
        name: 'Advanced A',
        element: 'Container',
        level: 'Advanced',
        maxEntries: 50,
      });
    });

    await expect(
      moveUpShowMapEntry({
        entryId: 'entry-1',
        targetClassId: 'class-2',
      })
    ).rejects.toThrow('not a valid move-up target');

    // Nothing should have been written.
    expect(mockUpdateReplicatedEntry).not.toHaveBeenCalled();
    expect(mockCreateReplicatedEntry).not.toHaveBeenCalled();
  });

  it('resolves the source class trial registry and accepts a UKC-only Superior→Elite move-up (Phase 5b)', async () => {
    // Superior/Elite aren't in AKC's level ladder — without resolving the source
    // class's trial registry, this write-path guard would reject the move-up as
    // "unknown level" even though it's a valid UKC progression.
    mockGetReplicatedClassById.mockImplementation((id: string) => {
      if (id === 'class-1') {
        return Promise.resolve({
          id: 'class-1',
          trialId: 'trial-1',
          name: 'Container Superior',
          element: 'Container',
          level: 'Superior',
          maxEntries: 50,
        });
      }
      return Promise.resolve({
        id: 'class-2',
        trialId: 'trial-1',
        name: 'Container Elite',
        element: 'Container',
        level: 'Elite',
        maxEntries: 50,
      });
    });
    mockGetReplicatedTrialById.mockResolvedValue({
      id: 'trial-1',
      registryId: 'UKC',
    });

    const result = await moveUpShowMapEntry({
      entryId: 'entry-1',
      targetClassId: 'class-2',
    });

    expect(result.targetClassName).toBe('Container Elite');
    expect(mockGetReplicatedTrialById).toHaveBeenCalledWith('trial-1');
    expect(mockUpdateReplicatedEntry).toHaveBeenCalled();
  });

  it('rejects the same UKC Superior→Elite move-up when the trial registry cannot be resolved', async () => {
    mockGetReplicatedClassById.mockImplementation((id: string) => {
      if (id === 'class-1') {
        return Promise.resolve({
          id: 'class-1',
          trialId: 'trial-1',
          name: 'Container Superior',
          element: 'Container',
          level: 'Superior',
          maxEntries: 50,
        });
      }
      return Promise.resolve({
        id: 'class-2',
        trialId: 'trial-1',
        name: 'Container Elite',
        element: 'Container',
        level: 'Elite',
        maxEntries: 50,
      });
    });
    // No trial found → falls back to AKC, whose ladder doesn't know Superior/Elite.
    mockGetReplicatedTrialById.mockResolvedValue(null);

    await expect(
      moveUpShowMapEntry({
        entryId: 'entry-1',
        targetClassId: 'class-2',
      })
    ).rejects.toThrow('not a valid move-up target');
  });

  it('leaves the original entry untouched when replicated move-up creation fails', async () => {
    mockCreateReplicatedEntry.mockRejectedValueOnce(new Error('create failed'));

    await expect(
      moveUpShowMapEntry({
        entryId: 'entry-1',
        targetClassId: 'class-2',
        reason: 'Qualified today',
      })
    ).rejects.toThrow('create failed');

    // The create happens FIRST; when it fails the original entry was never
    // marked 'moved', so there is nothing to roll back.
    expect(mockUpdateReplicatedEntry).not.toHaveBeenCalled();
  });

  it('keeps Show Map move-up fully replicated and audit logged', async () => {
    await moveUpShowMapEntry({
      entryId: 'entry-1',
      targetClassId: 'class-2',
      reason: 'Qualified today',
    });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockProcessMoveUp).not.toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'entry',
        entityId: 'entry-1',
        metadata: expect.objectContaining({ action: 'mark_entry_moved' }),
      })
    );
  });

  it('preserves the mark-moved failure when the rollback soft-delete also fails', async () => {
    // Both updateEntry calls reject: the mark-moved on the original AND the
    // rollback soft-delete of the new entry. The original error must survive.
    mockUpdateReplicatedEntry
      .mockRejectedValueOnce(new Error('mark-moved failed'))
      .mockRejectedValueOnce(new Error('soft-delete failed'));

    await expect(
      moveUpShowMapEntry({
        entryId: 'entry-1',
        targetClassId: 'class-2',
      })
    ).rejects.toThrow('mark-moved failed');

    expect(mockCreateReplicatedEntry).toHaveBeenCalledTimes(1);
    // mark-moved + rollback soft-delete = two updateEntry calls; no hard delete.
    expect(mockUpdateReplicatedEntry).toHaveBeenCalledTimes(2);
    expect(mockDeleteReplicatedEntry).not.toHaveBeenCalled();
  });

  describe('moveUpShowMapEntry write order', () => {
    it('creates the promoted entry before marking the original moved', async () => {
      await moveUpShowMapEntry({
        entryId: 'entry-1',
        targetClassId: 'class-2',
        reason: 'Qualified today',
      });

      const createOrder = mockCreateReplicatedEntry.mock.invocationCallOrder[0];
      const markMovedOrder = mockUpdateReplicatedEntry.mock.invocationCallOrder[0];
      expect(createOrder).toBeLessThan(markMovedOrder);
    });

    it('soft-deletes the newly created entry when marking the original moved fails', async () => {
      // The first updateEntry is the mark-moved on the original; reject only it,
      // so the rollback soft-delete (a second updateEntry) still resolves.
      mockUpdateReplicatedEntry.mockRejectedValueOnce(new Error('mark-moved failed'));

      await expect(
        moveUpShowMapEntry({
          entryId: 'entry-1',
          targetClassId: 'class-2',
        })
      ).rejects.toThrow('mark-moved failed');

      expect(mockCreateReplicatedEntry).toHaveBeenCalledTimes(1);
      const createdEntryId = mockCreateReplicatedEntry.mock.calls[0][0].id;
      // Rollback is a soft-delete UPDATE on the SAME row as the pending INSERT —
      // NOT a hard deleteEntry, which is an independent, un-ordered mutation that
      // could resurrect a live orphan on flaky show-day WiFi.
      expect(mockDeleteReplicatedEntry).not.toHaveBeenCalled();
      expect(mockUpdateReplicatedEntry).toHaveBeenCalledWith(
        createdEntryId,
        expect.objectContaining({
          deletedAt: expect.any(String),
          deleted_at: expect.any(String),
        })
      );
    });
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
