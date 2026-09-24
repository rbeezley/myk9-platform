import { beforeEach, describe, expect, it, vi } from 'vitest';

const moveUpShowMapEntry = vi.fn();
const updateEntry = vi.fn();
const getEntryById = vi.fn();
const auditLog = vi.fn((..._args: unknown[]) => Promise.resolve());

vi.mock('@/features/show-map/showMapActionMutations', () => ({
  moveUpShowMapEntry: (...args: unknown[]) => moveUpShowMapEntry(...args),
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    updateEntry: (...args: unknown[]) => updateEntry(...args),
    getEntryById: (...args: unknown[]) => getEntryById(...args),
  },
}));

vi.mock('@/services/AuditService', () => ({
  auditService: {
    log: (...args: unknown[]) => auditLog(...args),
  },
}));

vi.mock('@/types/audit-types', () => ({
  AuditAction: {
    UPDATE: 'update',
  },
}));

import { approveMoveUpRequestReplicated, denyMoveUpRequestReplicated } from '../requestManagement';

describe('show-day request management replication actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moveUpShowMapEntry.mockResolvedValue({ targetClassName: 'Open' });
    updateEntry.mockResolvedValue('mutation-1');
    auditLog.mockResolvedValue();
    getEntryById.mockResolvedValue({ entryStatus: 'move-up-requested' });
  });

  it('approves move-up requests through replicated move-up mutations', async () => {
    await expect(approveMoveUpRequestReplicated('move-up-entry', 'class-2')).resolves.toEqual({
      error: null,
    });

    expect(moveUpShowMapEntry).toHaveBeenCalledWith({
      entryId: 'move-up-entry',
      targetClassId: 'class-2',
      reason: undefined,
    });
  });

  it('denies move-up requests through replicated entry status updates', async () => {
    await expect(denyMoveUpRequestReplicated('move-up-entry', 'Class full')).resolves.toEqual({
      error: null,
    });

    expect(updateEntry).toHaveBeenCalledWith('move-up-entry', {
      entryStatus: 'confirmed',
      entry_status: 'confirmed',
      moveUpRequested: false,
      move_up_requested: false,
      specialRequests: 'Move-up denied: Class full',
      special_requests: 'Move-up denied: Class full',
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityType: 'entry',
        entityId: 'move-up-entry',
        changes: { entryStatus: { from: 'move-up-requested', to: 'confirmed' } },
        metadata: expect.objectContaining({
          action: 'deny_move_up_request',
          reason: 'Class full',
        }),
      })
    );
  });

  it('does not approve stale move-up requests from unexpected entry statuses', async () => {
    getEntryById.mockResolvedValueOnce({ entryStatus: 'confirmed' });

    await expect(approveMoveUpRequestReplicated('move-up-entry', 'class-open')).resolves.toEqual({
      error: expect.any(Error),
    });

    expect(moveUpShowMapEntry).not.toHaveBeenCalled();
  });
});
