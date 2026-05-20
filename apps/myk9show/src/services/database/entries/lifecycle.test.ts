import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptEntry,
  approveScratchRequest,
  denyMoveUpRequest,
  denyScratchRequest,
  markEntryMoved,
  rejectEntry,
  requestScratch,
  restoreEntryStatus,
  rollbackEntryMove,
  scratchEntry,
  scratchEntryDayOf,
  setEntryLifecycleStatus,
  transitionEntryLifecycle,
  waitlistEntry,
} from './lifecycle';

const { updateEntryStatus, auditLog } = vi.hoisted(() => ({
  updateEntryStatus: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('./secretary', () => ({
  updateEntryStatus: (...args: unknown[]) => updateEntryStatus(...args),
}));

vi.mock('@/services/AuditService', () => ({
  auditService: {
    log: (...args: unknown[]) => auditLog(...args),
  },
}));

// In-memory Supabase mock — captures the update payload for assertions.
const supabaseUpdates: Array<{ table: string; payload: Record<string, unknown> }> = [];

vi.mock('../supabaseClient', () => {
  const buildChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      supabaseUpdates.push({ table, payload });
      return chain;
    });
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.select = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue({ data: { id: 'entry-1' }, error: null });
    // Fire-and-forget transitions (markEntryMoved, rollbackEntryMove,
    // restoreEntryStatus) await the chain directly without .single(). Make the
    // chain thenable so `await chain` resolves to { error: null }.
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => buildChain(table),
    },
    logQuery: vi.fn(),
    createDatabaseError: (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
  };
});

describe('Entry lifecycle transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseUpdates.length = 0;
    updateEntryStatus.mockResolvedValue({ data: { id: 'entry-1' }, error: null });
  });

  it('sets an explicit lifecycle status through one seam', async () => {
    await setEntryLifecycleStatus({
      entryId: 'entry-1',
      status: 'withdrawn',
      reason: 'Handler conflict',
    });

    expect(updateEntryStatus).toHaveBeenCalledWith('entry-1', 'withdrawn', 'Handler conflict');
  });

  it('accepts an Entry by writing confirmed and logs the transition', async () => {
    await acceptEntry('entry-1');

    expect(updateEntryStatus).toHaveBeenCalledWith('entry-1', 'confirmed', undefined);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'entry',
        entityId: 'entry-1',
        changes: { entryStatus: { from: null, to: 'confirmed' } },
        metadata: expect.objectContaining({ action: 'accept_entry' }),
      })
    );
  });

  it('rejects an Entry using the existing withdrawn transition behavior', async () => {
    await rejectEntry('entry-1', 'Class limit reached');

    expect(updateEntryStatus).toHaveBeenCalledWith('entry-1', 'withdrawn', 'Class limit reached');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ action: 'reject_entry', reason: 'Class limit reached' }),
      })
    );
  });

  it('scratches an Entry and preserves the reason', async () => {
    await scratchEntry('entry-1', 'Dog is absent');

    expect(updateEntryStatus).toHaveBeenCalledWith('entry-1', 'scratched', 'Dog is absent');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ action: 'scratch_entry', reason: 'Dog is absent' }),
      })
    );
  });

  it('keeps current wait-list decision behavior behind a named transition', async () => {
    await waitlistEntry('entry-1');

    expect(updateEntryStatus).toHaveBeenCalledWith('entry-1', 'confirmed', undefined);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ action: 'waitlist_entry' }),
      })
    );
  });

  it('routes transition actions through the same explicit status seam', async () => {
    await transitionEntryLifecycle({ entryId: 'entry-1', action: 'scratch', reason: 'Absent' });

    expect(updateEntryStatus).toHaveBeenCalledWith('entry-1', 'scratched', 'Absent');
  });

  describe('scratch-request workflow', () => {
    it('scratchEntryDayOf writes pulled side-effects and logs the transition', async () => {
      await scratchEntryDayOf('entry-1', 'Handler injury');

      const write = supabaseUpdates[0];
      expect(write).toBeDefined();
      expect(write!.payload).toEqual(
        expect.objectContaining({
          entry_status: 'scratched',
          check_in_status: 'pulled',
          withdrawal_reason: 'Handler injury',
          special_requests: 'Handler injury',
        })
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            action: 'scratch_entry_day_of',
            reason: 'Handler injury',
            checkInStatus: 'pulled',
          }),
        })
      );
    });

    it('scratchEntryDayOf falls back to "Pulled day-of" when no reason is supplied', async () => {
      await scratchEntryDayOf('entry-1');

      expect(supabaseUpdates[0]!.payload).toEqual(
        expect.objectContaining({
          withdrawal_reason: 'Pulled day-of',
          special_requests: 'Pulled day-of',
        })
      );
    });

    it('requestScratch sets scratch-requested status and stores reason in special_requests', async () => {
      await requestScratch('entry-1', 'Dog injured');

      expect(supabaseUpdates[0]!.payload).toEqual(
        expect.objectContaining({
          entry_status: 'scratch-requested',
          special_requests: 'Dog injured',
        })
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            action: 'request_scratch',
            reason: 'Dog injured',
          }),
        })
      );
    });

    it('approveScratchRequest transitions to scratched + pulled with audit log', async () => {
      await approveScratchRequest('entry-1');

      expect(supabaseUpdates[0]!.payload).toEqual(
        expect.objectContaining({
          entry_status: 'scratched',
          check_in_status: 'pulled',
        })
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: { entryStatus: { from: 'scratch-requested', to: 'scratched' } },
          metadata: expect.objectContaining({ action: 'approve_scratch_request' }),
        })
      );
    });

    it('denyScratchRequest restores confirmed status and records denial reason', async () => {
      await denyScratchRequest('entry-1', 'Late notice');

      expect(supabaseUpdates[0]!.payload).toEqual(
        expect.objectContaining({
          entry_status: 'confirmed',
          special_requests: 'Pull denied: Late notice',
        })
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: { entryStatus: { from: 'scratch-requested', to: 'confirmed' } },
          metadata: expect.objectContaining({ action: 'deny_scratch_request', reason: 'Late notice' }),
        })
      );
    });
  });

  describe('move-up workflow', () => {
    it('markEntryMoved writes moved status with class-name note', async () => {
      await markEntryMoved({
        entryId: 'entry-1',
        targetClassName: 'Master Standard',
        reason: 'Earned title',
      });

      expect(supabaseUpdates[0]!.payload).toEqual(
        expect.objectContaining({
          entry_status: 'moved',
          special_requests: 'Moved up to Master Standard: Earned title',
        })
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            action: 'mark_entry_moved',
            targetClassName: 'Master Standard',
          }),
        })
      );
    });

    it('rollbackEntryMove restores confirmed status and clears notes', async () => {
      await rollbackEntryMove('entry-1');

      expect(supabaseUpdates[0]!.payload).toEqual(
        expect.objectContaining({
          entry_status: 'confirmed',
          special_requests: null,
        })
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: { entryStatus: { from: 'moved', to: 'confirmed' } },
          metadata: expect.objectContaining({ action: 'rollback_entry_move' }),
        })
      );
    });

    it('denyMoveUpRequest restores confirmed status and records denial reason', async () => {
      await denyMoveUpRequest('entry-1', 'Class is full');

      expect(supabaseUpdates[0]!.payload).toEqual(
        expect.objectContaining({
          entry_status: 'confirmed',
          special_requests: 'Move-up denied: Class is full',
        })
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: { entryStatus: { from: 'move-up-requested', to: 'confirmed' } },
          metadata: expect.objectContaining({ action: 'deny_move_up_request' }),
        })
      );
    });

    it('restoreEntryStatus writes the captured prior status verbatim', async () => {
      await restoreEntryStatus({
        entryId: 'entry-1',
        previousEntryStatus: 'checked-in',
        previousCheckInStatus: 'checked-in',
        previousSpecialRequests: 'note',
      });

      expect(supabaseUpdates[0]!.payload).toEqual(
        expect.objectContaining({
          entry_status: 'checked-in',
          check_in_status: 'checked-in',
          special_requests: 'note',
        })
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ action: 'restore_entry_status' }),
        })
      );
    });
  });
});
