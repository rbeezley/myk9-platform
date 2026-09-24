import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptEntry,
  denyMoveUpRequest,
  rejectEntry,
  removeEntryAsManager,
  restoreEntryStatus,
  pullEntry,
  pullEntryDayOf,
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
    // Fire-and-forget transitions (e.g. restoreEntryStatus) await the chain
    // directly without .single(). Make the chain thenable so `await chain`
    // resolves to { error: null }.
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => buildChain(table),
    },
    logQuery: vi.fn(),
    createDatabaseError,
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

    expect(updateEntryStatus).toHaveBeenCalledWith(
      'entry-1',
      'withdrawn',
      'Handler conflict',
      undefined,
      undefined
    );
  });

  it('accepts an Entry by writing confirmed and logs the transition', async () => {
    await acceptEntry('entry-1');

    expect(updateEntryStatus).toHaveBeenCalledWith(
      'entry-1',
      'confirmed',
      undefined,
      undefined,
      undefined
    );
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

    expect(updateEntryStatus).toHaveBeenCalledWith(
      'entry-1',
      'withdrawn',
      'Class limit reached',
      undefined,
      undefined
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          action: 'reject_entry',
          reason: 'Class limit reached',
        }),
      })
    );
  });

  it('pulls an Entry and preserves the reason', async () => {
    await pullEntry('entry-1', 'Dog is absent');

    expect(updateEntryStatus).toHaveBeenCalledWith(
      'entry-1',
      'scratched',
      'Dog is absent',
      undefined,
      undefined
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ action: 'pull_entry', reason: 'Dog is absent' }),
      })
    );
  });

  it('keeps current wait-list decision behavior behind a named transition', async () => {
    await waitlistEntry('entry-1');

    expect(updateEntryStatus).toHaveBeenCalledWith(
      'entry-1',
      'confirmed',
      undefined,
      undefined,
      undefined
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ action: 'waitlist_entry' }),
      })
    );
  });

  it('routes transition actions through the same explicit status seam', async () => {
    await transitionEntryLifecycle({ entryId: 'entry-1', action: 'pull', reason: 'Absent' });

    expect(updateEntryStatus).toHaveBeenCalledWith(
      'entry-1',
      'scratched',
      'Absent',
      undefined,
      undefined
    );
  });

  // MYK9-632: the manager chooser's two acts. `removeEntryAsManager` is what
  // `withdrawEntry({ asShowManager: true })` routes to; before it, both choices
  // went to `rejectEntry` and stored 'withdrawn'.
  it('removeEntryAsManager writes the act the manager picked', async () => {
    await removeEntryAsManager('entry-1', 'pull');
    expect(updateEntryStatus).toHaveBeenCalledWith(
      'entry-1',
      'scratched',
      undefined,
      undefined,
      null
    );

    updateEntryStatus.mockClear();
    await removeEntryAsManager('entry-1', 'withdraw', 'in_season');
    expect(updateEntryStatus).toHaveBeenCalledWith(
      'entry-1',
      'withdrawn',
      undefined,
      undefined,
      'in_season'
    );
  });

  describe('scratch-request workflow', () => {
    it('pullEntryDayOf writes pulled side-effects and logs the transition', async () => {
      await pullEntryDayOf('entry-1', 'Handler injury');

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

    it('pullEntryDayOf falls back to "Pulled day-of" when no reason is supplied', async () => {
      await pullEntryDayOf('entry-1');

      expect(supabaseUpdates[0]!.payload).toEqual(
        expect.objectContaining({
          withdrawal_reason: 'Pulled day-of',
          special_requests: 'Pulled day-of',
        })
      );
    });
  });

  describe('move-up workflow', () => {
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
