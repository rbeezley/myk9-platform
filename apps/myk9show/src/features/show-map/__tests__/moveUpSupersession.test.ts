import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  movedUpPaymentCarry,
  resolveMoveUpReversal,
  reverseShowMapMoveUp,
} from '../moveUpSupersession';

const mockGetEntryById = vi.fn();
const mockGetEntriesByClass = vi.fn();
const mockUpdateEntry = vi.fn();
const mockGetClassById = vi.fn();
const mockAuditLog = vi.fn((..._args: unknown[]) => Promise.resolve());

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn() },
  logQuery: vi.fn(),
  createDatabaseError,
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    getEntryById: (...args: unknown[]) => mockGetEntryById(...args),
    getEntriesByClass: (...args: unknown[]) => mockGetEntriesByClass(...args),
    updateEntry: (...args: unknown[]) => mockUpdateEntry(...args),
  },
  replicatedClassesTable: {
    getClassById: (...args: unknown[]) => mockGetClassById(...args),
  },
}));

vi.mock('@/services/AuditService', () => ({
  auditService: { log: (...args: unknown[]) => mockAuditLog(...args) },
}));

vi.mock('@/types/audit-types', () => ({ AuditAction: { UPDATE: 'update' } }));

/** The superseded source left behind in Interior Novice A. */
const SOURCE = {
  id: 'source-1',
  dogId: 'dog-1',
  classId: 'class-novice',
  class_id: 'class-novice',
  entryStatus: 'moved',
  checkInStatus: 'no-status',
  specialRequests: 'Moved up to Interior Advanced A: Qualified today',
};

/** The live destination in Interior Advanced A. */
const DESTINATION = {
  id: 'dest-1',
  dogId: 'dog-1',
  classId: 'class-advanced',
  class_id: 'class-advanced',
  entryStatus: 'confirmed',
  checkInStatus: 'checked-in',
  isScored: false,
  resultStatus: 'pending',
  movedFromEntryId: 'source-1',
  moved_from_entry_id: 'source-1',
  specialRequests: 'Moved up from class class-novice: Qualified today',
};

function entriesById(rows: Record<string, unknown>[]) {
  return (id: string) => Promise.resolve(rows.find(row => row.id === id) ?? null);
}

describe('moveUpSupersession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEntryById.mockImplementation(entriesById([SOURCE, DESTINATION]));
    mockGetEntriesByClass.mockResolvedValue([SOURCE]);
    mockUpdateEntry.mockResolvedValue('mutation-1');
    mockGetClassById.mockResolvedValue({ id: 'class-novice', name: 'Interior Novice A' });
    mockAuditLog.mockResolvedValue(undefined);
  });

  describe('movedUpPaymentCarry', () => {
    it('carries the source settlement, including an explicit null comp reason', () => {
      expect(
        movedUpPaymentCarry({
          id: 'source-1',
          paymentStatus: 'paid',
          paymentMethod: 'check',
          entryFee: 35,
          paymentReference: 'ck 1042',
          comped: false,
          comped_reason: null,
          discountAmount: 0,
          isDayOfShow: false,
          registrationId: 'enrollment-1',
        })
      ).toEqual({
        paymentStatus: 'paid',
        paymentMethod: 'check',
        entryFee: 35,
        paymentReference: 'ck 1042',
        comped: false,
        compedReason: null,
        comped_reason: null,
        discountAmount: 0,
        discount_amount: 0,
        isDayOfShow: false,
        registrationId: 'enrollment-1',
      });
    });

    it('omits what the replica row does not carry rather than writing null over it', () => {
      expect(movedUpPaymentCarry({ id: 'source-1', paymentStatus: 'paid' })).toEqual({
        paymentStatus: 'paid',
      });
    });
  });

  describe('resolveMoveUpReversal', () => {
    it('follows moved_from_entry_id to the superseded source', async () => {
      await expect(resolveMoveUpReversal('dest-1')).resolves.toEqual({
        kind: 'available',
        destinationEntryId: 'dest-1',
        sourceEntryId: 'source-1',
        sourceClassId: 'class-novice',
        sourceClassName: 'Interior Novice A',
      });
    });

    it('falls back to the move-up note when the FK column is not there yet', async () => {
      const preMigrationDestination = {
        ...DESTINATION,
        movedFromEntryId: undefined,
        moved_from_entry_id: undefined,
      };
      mockGetEntryById.mockImplementation(entriesById([SOURCE, preMigrationDestination]));

      await expect(resolveMoveUpReversal('dest-1')).resolves.toMatchObject({
        kind: 'available',
        sourceEntryId: 'source-1',
      });
      expect(mockGetEntriesByClass).toHaveBeenCalledWith('class-novice');
    });

    it('reports an ordinary entry as not a move-up', async () => {
      mockGetEntryById.mockImplementation(
        entriesById([{ id: 'plain-1', dogId: 'dog-1', entryStatus: 'confirmed' }])
      );

      await expect(resolveMoveUpReversal('plain-1')).resolves.toEqual({
        kind: 'blocked',
        reason: 'not-a-move-up',
      });
    });

    it('refuses once the destination has a result', async () => {
      mockGetEntryById.mockImplementation(
        entriesById([SOURCE, { ...DESTINATION, isScored: true }])
      );

      await expect(resolveMoveUpReversal('dest-1')).resolves.toEqual({
        kind: 'blocked',
        reason: 'destination-scored',
      });
    });

    it('refuses on a non-pending result status even when is_scored is false', async () => {
      mockGetEntryById.mockImplementation(
        entriesById([SOURCE, { ...DESTINATION, resultStatus: 'absent' }])
      );

      await expect(resolveMoveUpReversal('dest-1')).resolves.toEqual({
        kind: 'blocked',
        reason: 'destination-scored',
      });
    });

    it('refuses when the source is no longer the superseded entry', async () => {
      mockGetEntryById.mockImplementation(
        entriesById([{ ...SOURCE, entryStatus: 'withdrawn' }, DESTINATION])
      );

      await expect(resolveMoveUpReversal('dest-1')).resolves.toEqual({
        kind: 'blocked',
        reason: 'source-missing',
      });
    });

    it('refuses when the source has been soft-deleted', async () => {
      mockGetEntryById.mockImplementation(
        entriesById([{ ...SOURCE, deletedAt: '2026-09-18T12:00:00Z' }, DESTINATION])
      );

      await expect(resolveMoveUpReversal('dest-1')).resolves.toEqual({
        kind: 'blocked',
        reason: 'source-missing',
      });
    });
  });

  describe('reverseShowMapMoveUp', () => {
    it('soft-deletes the destination, then restores the source with the LIVE check-in', async () => {
      const result = await reverseShowMapMoveUp('dest-1');

      expect(result).toEqual({
        destinationEntryId: 'dest-1',
        sourceEntryId: 'source-1',
        sourceClassId: 'class-novice',
        sourceClassName: 'Interior Novice A',
      });

      expect(mockUpdateEntry).toHaveBeenNthCalledWith(
        1,
        'dest-1',
        expect.objectContaining({ deletedAt: expect.any(String), deleted_at: expect.any(String) })
      );
      // The check-in is read off the DESTINATION, which is the row that was live
      // while the dog was at the gate -- not off a status captured at move time.
      expect(mockUpdateEntry).toHaveBeenNthCalledWith(2, 'source-1', {
        entryStatus: 'confirmed',
        entry_status: 'confirmed',
        checkInStatus: 'checked-in',
        check_in_status: 'checked-in',
        specialRequests: null,
        special_requests: null,
      });
    });

    it('keeps a note a human typed on the source and clears only the generated one', async () => {
      mockGetEntryById.mockImplementation(
        entriesById([{ ...SOURCE, specialRequests: 'Needs the ramp' }, DESTINATION])
      );

      await reverseShowMapMoveUp('dest-1');

      expect(mockUpdateEntry).toHaveBeenNthCalledWith(
        2,
        'source-1',
        expect.objectContaining({ specialRequests: 'Needs the ramp' })
      );
    });

    it('audit-logs the restore against the source entry', async () => {
      await reverseShowMapMoveUp('dest-1');

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'entry',
          entityId: 'source-1',
          changes: { entryStatus: { from: 'moved', to: 'confirmed' } },
          metadata: expect.objectContaining({
            action: 'restore_entry_status',
            checkInStatus: 'checked-in',
            reversedMoveUpFromEntryId: 'dest-1',
          }),
        })
      );
    });

    it('writes NOTHING when the destination already has a result', async () => {
      mockGetEntryById.mockImplementation(
        entriesById([SOURCE, { ...DESTINATION, isScored: true }])
      );

      await expect(reverseShowMapMoveUp('dest-1')).rejects.toThrow(/result recorded/);
      expect(mockUpdateEntry).not.toHaveBeenCalled();
    });
  });
});
