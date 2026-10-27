import { createDatabaseError } from '@/services/database/databaseError';
/**
 * Regression: secretary status transitions must pass the caller-supplied
 * EntryStatus through to the replicated entry mutation payload. Compile-time
 * typing prevents invalid enum values from reaching these functions; these
 * tests lock the runtime wiring.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { removeEntryAsManager, updateEntryStatus } from '../../entries';

const mocks = vi.hoisted(() => ({
  auditLog: vi.fn(),
  logQuery: vi.fn(),
  supabaseFrom: vi.fn(),
  updateSecretaryLifecycleStatus: vi.fn(),
  getEntryById: vi.fn(),
}));

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: mocks.supabaseFrom,
  },
  logQuery: mocks.logQuery,
  createDatabaseError,
}));

vi.mock('@/services/AuditService', () => ({
  auditService: {
    log: mocks.auditLog,
  },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    updateSecretaryLifecycleStatus: mocks.updateSecretaryLifecycleStatus,
    getEntryById: mocks.getEntryById,
  },
}));

describe('secretaryEntryQueries — entry_status updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auditLog.mockResolvedValue(undefined);
    mocks.updateSecretaryLifecycleStatus.mockResolvedValue('mutation-1');
    mocks.getEntryById.mockImplementation((entryId: string) =>
      Promise.resolve({ id: entryId, showId: 'show-1', classId: 'class-1' })
    );
  });

  describe('updateEntryStatus', () => {
    it('queues entry_status = "confirmed" on the replicated entry row', async () => {
      await updateEntryStatus('entry-1', 'confirmed');

      expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledWith(
        'entry-1',
        {
          entryStatus: 'confirmed',
          entry_status: 'confirmed',
          status: 'confirmed',
        },
        undefined
      );
      expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('entries');
    });

    it('queues entry_status = "withdrawn" when caller passes withdrawn', async () => {
      await updateEntryStatus('entry-1', 'withdrawn');

      expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledWith(
        'entry-1',
        expect.objectContaining({ entry_status: 'withdrawn' }),
        undefined
      );
    });

    it('returns row-like invalidation fields from the replicated snapshot', async () => {
      const result = await updateEntryStatus('entry-1', 'submitted');

      expect(result.data).toEqual(
        expect.objectContaining({
          id: 'entry-1',
          show_id: 'show-1',
          class_id: 'class-1',
          mutationId: 'mutation-1',
        })
      );
    });
  });

  describe('named Entry transitions', () => {
    // MYK9-632: a SHOW MANAGER using the exhibitor chooser must write the act
    // they picked. Before this, both choices went through `rejectEntry` and
    // stored 'withdrawn', so a manager's Pull was badged "Pulled", stored as a
    // withdrawal, and never appeared in the Pull tab (which filters
    // rawEntryStatus === 'scratched') — the refund decision was unreachable.
    it('removeEntryAsManager PULL writes scratched with no reason code', async () => {
      await removeEntryAsManager('entry-1', 'pull');

      expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledWith(
        'entry-1',
        expect.objectContaining({
          entry_status: 'scratched',
          check_in_status: 'pulled',
          withdrawal_reason_code: null,
        }),
        undefined
      );
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: { entryStatus: { from: null, to: 'scratched' } },
          metadata: expect.objectContaining({ action: 'pull_entry' }),
        })
      );
    });

    it('removeEntryAsManager WITHDRAW writes withdrawn plus the reason code', async () => {
      await removeEntryAsManager('entry-1', 'withdraw', 'judge_change');

      expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledWith(
        'entry-1',
        expect.objectContaining({
          entry_status: 'withdrawn',
          withdrawal_reason_code: 'judge_change',
        }),
        undefined
      );
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: { entryStatus: { from: null, to: 'withdrawn' } },
          metadata: expect.objectContaining({
            action: 'withdraw_entry',
            withdrawalReasonCode: 'judge_change',
          }),
        })
      );
    });

    it('removeEntryAsManager PULL never carries a reason handed to it', async () => {
      await removeEntryAsManager('entry-1', 'pull', 'in_season');

      expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledWith(
        'entry-1',
        expect.objectContaining({ entry_status: 'scratched', withdrawal_reason_code: null }),
        undefined
      );
    });
  });
});
