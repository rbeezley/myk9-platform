import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getShowMapHandlerMessageTarget,
  approveShowMapEntry,
  bulkApproveShowMapEntries,
  markShowMapClassComplete,
  markShowMapClassStarted,
  markShowMapEntryCheckedIn,
  moveUpShowMapEntry,
  scratchShowMapEntry,
  sourceIdFromShowMapNodeId,
  undoShowMapMoveUp,
  undoShowMapScratch,
} from '../showMapActionMutations';
import { replicatedClassesTable } from '@/services/replication';

const mockUpdateClass = replicatedClassesTable.updateClass as unknown as ReturnType<typeof vi.fn>;

const mockFrom = vi.fn();
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
      withdrawalReason: null,
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

  it('captures the previous entry state before scratching so it can be undone', async () => {
    const result = await scratchShowMapEntry('entry-1', 'Dog absent');

    expect(result).toEqual({
      entryId: 'entry-1',
      previousEntryStatus: 'checked-in',
      previousCheckInStatus: 'checked-in',
      previousSpecialRequests: 'Bring paper form',
      previousWithdrawalReason: null,
    });
  });

  describe('undoShowMapScratch', () => {
    it('restores the entry to its previous status, check-in state, and notes', async () => {
      await undoShowMapScratch({
        entryId: 'entry-1',
        previousEntryStatus: 'checked-in',
        previousCheckInStatus: 'checked-in',
        previousSpecialRequests: 'Bring paper form',
        previousWithdrawalReason: null,
      });

      expect(mockUpdateReplicatedEntry).toHaveBeenCalledWith(
        'entry-1',
        expect.objectContaining({
          entryStatus: 'checked-in',
          entry_status: 'checked-in',
          checkInStatus: 'checked-in',
          check_in_status: 'checked-in',
          specialRequests: 'Bring paper form',
          special_requests: 'Bring paper form',
          withdrawalReason: null,
          withdrawal_reason: null,
        })
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          entityType: 'entry',
          entityId: 'entry-1',
          changes: { entryStatus: { from: 'scratched', to: 'checked-in' } },
          metadata: expect.objectContaining({
            action: 'restore_entry_status',
            checkInStatus: 'checked-in',
          }),
        })
      );
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('falls back to no-status check-in when none was captured', async () => {
      await undoShowMapScratch({
        entryId: 'entry-1',
        previousEntryStatus: 'pre-entered',
        previousCheckInStatus: null,
        previousSpecialRequests: null,
        previousWithdrawalReason: null,
      });

      expect(mockUpdateReplicatedEntry).toHaveBeenCalledWith(
        'entry-1',
        expect.objectContaining({
          checkInStatus: 'no-status',
          check_in_status: 'no-status',
        })
      );
    });

    it('fails loudly when undo did not capture the original entry status', async () => {
      await expect(
        undoShowMapScratch({
          entryId: 'entry-1',
          previousEntryStatus: null,
          previousCheckInStatus: 'checked-in',
          previousSpecialRequests: null,
          previousWithdrawalReason: null,
        })
      ).rejects.toThrow('original entry status was not captured');

      expect(mockFrom).not.toHaveBeenCalled();
      expect(mockUpdateReplicatedEntry).not.toHaveBeenCalled();
    });
  });

  it('marks a class complete with a manual override marker in the same replicated payload', async () => {
    await markShowMapClassComplete('class-1');

    expect(mockUpdateClass).toHaveBeenCalledWith(
      'class-1',
      expect.objectContaining({
        classStatus: 'Completed',
        statusSource: 'manual',
        // Manual completion resolves any server reopen → clear the stamp.
        reopenedAfterCloseoutAt: null,
        isCompleted: true,
      })
    );
    // Single replicated write — no second mutation for the marker.
    expect(mockUpdateClass).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('marks a class started with a manual override marker in the same replicated payload', async () => {
    await markShowMapClassStarted('class-1');

    expect(mockUpdateClass).toHaveBeenCalledWith(
      'class-1',
      expect.objectContaining({
        classStatus: 'In Progress',
        statusSource: 'manual',
        isCompleted: false,
      })
    );
    // Starting a class must NOT clear a reopen stamp — only a manual completion does.
    const startedPayload = mockUpdateClass.mock.calls[0][1] as Record<string, unknown>;
    expect(startedPayload).not.toHaveProperty('reopenedAfterCloseoutAt');
    expect(mockUpdateClass).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalled();
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
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'entry',
        entityId: 'entry-1',
        metadata: expect.objectContaining({ action: 'mark_entry_moved' }),
      })
    );
  });

  it('preserves the mark-moved failure even when both rollback writes also fail', async () => {
    // All three updateEntry calls reject: the mark-moved on the original, the
    // restore of the original, and the soft-delete of the new entry. The
    // original error must still surface.
    mockUpdateReplicatedEntry
      .mockRejectedValueOnce(new Error('mark-moved failed'))
      .mockRejectedValueOnce(new Error('restore failed'))
      .mockRejectedValueOnce(new Error('soft-delete failed'));

    await expect(
      moveUpShowMapEntry({
        entryId: 'entry-1',
        targetClassId: 'class-2',
      })
    ).rejects.toThrow('mark-moved failed');

    expect(mockCreateReplicatedEntry).toHaveBeenCalledTimes(1);
    // mark-moved + restore original + soft-delete new = three updateEntry calls;
    // no hard delete.
    expect(mockUpdateReplicatedEntry).toHaveBeenCalledTimes(3);
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

    it('restores the original to its previous status BEFORE soft-deleting the new entry when mark-moved fails', async () => {
      // updateEntry commits its local row before queueing sync, so a failed
      // mark-moved may already have flipped the original to 'moved' locally.
      // The rollback must restore the original (not just remove the new entry),
      // and restore FIRST so the dog stays runnable even if the soft-delete then
      // fails. Reject only the first updateEntry (the mark-moved).
      mockUpdateReplicatedEntry.mockRejectedValueOnce(new Error('mark-moved failed'));

      await expect(
        moveUpShowMapEntry({
          entryId: 'entry-1',
          targetClassId: 'class-2',
        })
      ).rejects.toThrow('mark-moved failed');

      const createdEntryId = mockCreateReplicatedEntry.mock.calls[0][0].id;
      // calls[0] = mark-moved (threw); calls[1] = restore original; calls[2] = soft-delete new.
      const calls = mockUpdateReplicatedEntry.mock.calls;
      expect(calls).toHaveLength(3);
      expect(calls[1][0]).toBe('entry-1');
      expect(calls[1][1]).toMatchObject({
        entryStatus: 'checked-in',
        entry_status: 'checked-in',
        checkInStatus: 'checked-in',
        check_in_status: 'checked-in',
        specialRequests: 'Bring paper form',
        special_requests: 'Bring paper form',
      });
      expect(calls[2][0]).toBe(createdEntryId);
      expect(typeof calls[2][1].deleted_at).toBe('string');
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
