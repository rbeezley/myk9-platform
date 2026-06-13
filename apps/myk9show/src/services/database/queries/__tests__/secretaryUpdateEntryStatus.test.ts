/**
 * Regression: secretary status transitions must pass the caller-supplied
 * EntryStatus through to the replicated entry mutation payload. Compile-time
 * typing prevents invalid enum values from reaching these functions; these
 * tests lock the runtime wiring.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptEntry,
  bulkUpdateEntryStatus,
  rejectEntry,
  scratchEntry,
  updateEntryStatus,
  waitlistEntry,
} from '../../entries';

const mocks = vi.hoisted(() => ({
  auditLog: vi.fn(),
  createDatabaseError: vi.fn((err: unknown) =>
    err instanceof Error ? err : new Error(String(err))
  ),
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
  createDatabaseError: mocks.createDatabaseError,
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

  describe('bulkUpdateEntryStatus', () => {
    it('applies entry_status across multiple ids through replicated mutations', async () => {
      await bulkUpdateEntryStatus(['e1', 'e2', 'e3'], 'confirmed');

      expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledTimes(3);
      expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenNthCalledWith(1, 'e1', {
        entryStatus: 'confirmed',
        entry_status: 'confirmed',
        status: 'confirmed',
      });
      expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenNthCalledWith(2, 'e2', {
        entryStatus: 'confirmed',
        entry_status: 'confirmed',
        status: 'confirmed',
      });
      expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenNthCalledWith(3, 'e3', {
        entryStatus: 'confirmed',
        entry_status: 'confirmed',
        status: 'confirmed',
      });
      expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('entries');
    });

    it('marks bulk-scratched entries pulled for ringside propagation', async () => {
      await bulkUpdateEntryStatus(['e1'], 'scratched');

      expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledWith('e1', {
        entryStatus: 'scratched',
        entry_status: 'scratched',
        status: 'scratched',
        checkInStatus: 'pulled',
        check_in_status: 'pulled',
      });
    });
  });

  describe('named Entry transitions', () => {
    it('acceptEntry writes the secretary-facing confirmed status', async () => {
      await acceptEntry('entry-1');

      expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledWith(
        'entry-1',
        expect.objectContaining({ entry_status: 'confirmed' }),
        undefined
      );
    });

    it('rejectEntry writes withdrawn and preserves the reason', async () => {
      await rejectEntry('entry-1', 'Class limit reached');

      expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledWith(
        'entry-1',
        expect.objectContaining({
          entry_status: 'withdrawn',
          withdrawal_reason: 'Class limit reached',
        }),
        undefined
      );
    });

    it('scratchEntry writes scratched and preserves the reason', async () => {
      await scratchEntry('entry-1', 'Dog is absent');

      expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledWith(
        'entry-1',
        expect.objectContaining({
          entry_status: 'scratched',
          check_in_status: 'pulled',
          withdrawal_reason: 'Dog is absent',
        }),
        undefined
      );
    });

    it('waitlistEntry keeps current pending-entry behavior behind a named transition', async () => {
      await waitlistEntry('entry-1');

      expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledWith(
        'entry-1',
        expect.objectContaining({ entry_status: 'confirmed' }),
        undefined
      );
    });
  });
});
