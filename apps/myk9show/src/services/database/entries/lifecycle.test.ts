import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EntryStatus as SecretaryEntryStatus,
  PaymentStatus,
} from '@/types/show-registration-types';
import {
  changeSecretaryEntryStatus,
  denyMoveUpRequest,
  removeEntryAsManager,
  setEntryLifecycleStatus,
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
    // Make the chain thenable so a bare `await chain` (no .single()) resolves.
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
      undefined,
      undefined
    );
  });

  it('hands the check-in context to the status write (MYK9-1384)', async () => {
    const checkInContext = { previousEntryStatus: 'scratched', priorCheckInStatus: 'checked-in' };
    await setEntryLifecycleStatus({
      entryId: 'entry-1',
      status: 'confirmed',
      checkInContext: checkInContext as never,
    });

    expect(updateEntryStatus).toHaveBeenCalledWith(
      'entry-1',
      'confirmed',
      undefined,
      undefined,
      undefined,
      checkInContext
    );
  });

  it('changeSecretaryEntryStatus derives previousEntryStatus from the entry and passes priorCheckInStatus', async () => {
    const entry = {
      id: 'entry-1',
      registrationId: 'reg-1',
      entryNumber: '42',
      showId: 'show-1',
      dogId: 'dog-1',
      dogName: 'Rex',
      ownerName: 'Alice',
      ownerEmail: 'alice@example.test',
      handlerName: 'Alice',
      classes: [],
      totalFee: 20,
      paidAmount: 20,
      entryStatus: SecretaryEntryStatus.SCRATCHED,
      paymentStatus: PaymentStatus.PENDING,
      submittedAt: new Date('2026-01-01'),
      lastUpdated: new Date('2026-01-01'),
    };

    await changeSecretaryEntryStatus({
      entry,
      newStatus: SecretaryEntryStatus.ACCEPTED,
      priorCheckInStatus: 'checked-in',
    });
    await changeSecretaryEntryStatus({ entry, newStatus: SecretaryEntryStatus.ACCEPTED });

    expect(updateEntryStatus.mock.calls[0]?.[5]).toEqual({
      previousEntryStatus: 'scratched',
      priorCheckInStatus: 'checked-in',
    });
    expect(updateEntryStatus.mock.calls[1]?.[5]).toEqual({
      previousEntryStatus: 'scratched',
      priorCheckInStatus: undefined,
    });
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
      null,
      undefined
    );

    updateEntryStatus.mockClear();
    await removeEntryAsManager('entry-1', 'withdraw', 'in_season');
    expect(updateEntryStatus).toHaveBeenCalledWith(
      'entry-1',
      'withdrawn',
      undefined,
      undefined,
      'in_season',
      undefined
    );
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
  });
});
