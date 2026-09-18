import { createDatabaseError } from '@/services/database/databaseError';
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
const mockMoveUpEntryViaRpc = vi.fn();
const mockReverseMoveUpEntryViaRpc = vi.fn();
const mockAuditLog = vi.fn((..._args: unknown[]) => Promise.resolve());

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  logQuery: vi.fn(),
  createDatabaseError,
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
    moveUpEntryViaRpc: (...args: unknown[]) => mockMoveUpEntryViaRpc(...args),
    reverseMoveUpEntryViaRpc: (...args: unknown[]) => mockReverseMoveUpEntryViaRpc(...args),
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
      // MYK9-639's measured row: one dog, entered once, $35 paid by check. The
      // money stays HERE; the move-up must not copy any of it forward.
      paymentStatus: 'paid',
      paymentMethod: 'check',
      entryFee: 35,
      paymentReference: 'ck 1042',
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
    mockMoveUpEntryViaRpc.mockImplementation(({ newEntryId }: { newEntryId: string }) =>
      Promise.resolve(newEntryId)
    );
    mockReverseMoveUpEntryViaRpc.mockResolvedValue('entry-1');
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
      })
    );
    const completedPayload = mockUpdateClass.mock.calls[0][1] as Record<string, unknown>;
    // is_completed is not a schema column — the helper must not write it.
    expect(completedPayload).not.toHaveProperty('isCompleted');
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
      })
    );
    const startedPayload = mockUpdateClass.mock.calls[0][1] as Record<string, unknown>;
    // Starting a class must NOT clear a reopen stamp — only a manual completion does.
    expect(startedPayload).not.toHaveProperty('reopenedAfterCloseoutAt');
    // is_completed is not a schema column — the helper must not write it.
    expect(startedPayload).not.toHaveProperty('isCompleted');
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

  it('moves an entry up as ONE server call, and carries NO money with it', async () => {
    const result = await moveUpShowMapEntry({
      entryId: 'entry-1',
      targetClassId: 'class-2',
      reason: 'Qualified today',
    });

    expect(result).toMatchObject({
      originalEntryId: 'entry-1',
      targetClassName: 'Advanced A',
    });
    expect(result.newEntryId).toEqual(expect.any(String));

    // ONE call. The destination insert and the source's `moved` mark are a
    // single transaction inside `move_up_entry`, so there is no window in which
    // the dog is entered twice or entered nowhere.
    expect(mockMoveUpEntryViaRpc).toHaveBeenCalledTimes(1);
    expect(mockMoveUpEntryViaRpc).toHaveBeenCalledWith({
      sourceEntryId: 'entry-1',
      targetClassId: 'class-2',
      newEntryId: result.newEntryId,
      reason: 'Qualified today',
    });

    // MYK9-639: money never moves. The client sends no payment field at all —
    // not the status, not the fee, not the method, not the reference. This is
    // the assertion that keeps a Stripe-paid entry moveable: `payment_method:
    // 'online'` on an INSERT is exactly what
    // `trg_entries_protect_payment_fields_insert` raises 42501 on.
    const [rpcArgs] = mockMoveUpEntryViaRpc.mock.calls[0] as [Record<string, unknown>];
    for (const forbidden of [
      'paymentStatus',
      'payment_status',
      'paymentMethod',
      'payment_method',
      'entryFee',
      'entry_fee',
      'paymentReference',
      'comped',
      'compedReason',
      'discountAmount',
      'stripePaymentIntentId',
      'refundAmount',
    ]) {
      expect(rpcArgs).not.toHaveProperty(forbidden);
    }

    // No direct replicated writes any more — the two-write pair is gone.
    expect(mockUpdateReplicatedEntry).not.toHaveBeenCalled();

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
          destinationEntryId: result.newEntryId,
        }),
      })
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does not touch the source when the server refuses the move', async () => {
    // The RPC is the whole operation: if it fails, nothing happened. There is no
    // half-landed state left for a rollback to repair, which is the shape the
    // previous two-write version could not guarantee.
    mockMoveUpEntryViaRpc.mockRejectedValue(
      new Error('This entry is not in a state that can be moved.')
    );

    await expect(
      moveUpShowMapEntry({ entryId: 'entry-1', targetClassId: 'class-2' })
    ).rejects.toThrow(/not in a state that can be moved/);

    expect(mockUpdateReplicatedEntry).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
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

    // Nothing should have been written — the server call is never made.
    expect(mockUpdateReplicatedEntry).not.toHaveBeenCalled();
    expect(mockMoveUpEntryViaRpc).not.toHaveBeenCalled();
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
    expect(mockMoveUpEntryViaRpc).toHaveBeenCalled();
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

  it('sends the banner Undo down the SAME reverse as the durable Move back', async () => {
    // They are one operation, so they are one call. Before, the banner restored a
    // status captured at move time through two uncompensated writes while the
    // dialog restored the live one — two shapes for the same act, and only one
    // of them could not strand the dog with no live entry.
    mockGetReplicatedEntryById.mockImplementation((id: string) =>
      Promise.resolve(
        id === 'new-entry-1'
          ? {
              id: 'new-entry-1',
              dogId: 'dog-1',
              classId: 'class-2',
              entryStatus: 'confirmed',
              checkInStatus: 'checked-in',
              movedFromEntryId: 'entry-1',
              isScored: false,
              resultStatus: 'pending',
            }
          : { id: 'entry-1', dogId: 'dog-1', classId: 'class-1', entryStatus: 'moved' }
      )
    );

    await undoShowMapMoveUp({ originalEntryId: 'entry-1', newEntryId: 'new-entry-1' });

    expect(mockReverseMoveUpEntryViaRpc).toHaveBeenCalledTimes(1);
    expect(mockReverseMoveUpEntryViaRpc).toHaveBeenCalledWith('new-entry-1');
    expect(mockUpdateReplicatedEntry).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
