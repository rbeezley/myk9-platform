import { beforeEach, describe, expect, it, vi } from 'vitest';

const moveUpShowMapEntry = vi.fn();
const updateReplicatedDayOfScratch = vi.fn();
const updateEntry = vi.fn();
const getEntryById = vi.fn();
const auditLog = vi.fn<() => Promise<void>>(() => Promise.resolve());

vi.mock('@/features/show-map/showMapActionMutations', () => ({
  moveUpShowMapEntry: (...args: unknown[]) => moveUpShowMapEntry(...args),
}));

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedDayOfScratch: (...args: unknown[]) => updateReplicatedDayOfScratch(...args),
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

import {
  approveMoveUpRequestReplicated,
  approvePullRequestReplicated,
  denyMoveUpRequestReplicated,
  denyPullRequestReplicated,
} from '../requestManagement';

describe('show-day request management replication actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moveUpShowMapEntry.mockResolvedValue({ targetClassName: 'Open' });
    updateReplicatedDayOfScratch.mockResolvedValue('mutation-1');
    updateEntry.mockResolvedValue('mutation-1');
    auditLog.mockResolvedValue();
    getEntryById.mockImplementation((entryId: string) => {
      if (entryId === 'move-up-entry') return Promise.resolve({ entryStatus: 'move-up-requested' });
      if (entryId === 'pull-entry') return Promise.resolve({ entryStatus: 'scratch-requested' });
      return Promise.resolve({ entryStatus: 'move-up-requested' });
    });
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

  it('approves pull requests through replicated day-of scratch updates', async () => {
    await expect(approvePullRequestReplicated('pull-entry')).resolves.toEqual({ error: null });

    expect(updateReplicatedDayOfScratch).toHaveBeenCalledWith('pull-entry', 'Pull approved', {
      auditAction: 'approve_scratch_request',
      fromStatus: 'scratch-requested',
    });
  });

  it('denies pull requests through replicated entry status updates', async () => {
    await expect(denyPullRequestReplicated('pull-entry', 'Too late')).resolves.toEqual({
      error: null,
    });

    expect(updateEntry).toHaveBeenCalledWith('pull-entry', {
      entryStatus: 'confirmed',
      entry_status: 'confirmed',
      specialRequests: 'Pull denied: Too late',
      special_requests: 'Pull denied: Too late',
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityType: 'entry',
        entityId: 'pull-entry',
        changes: { entryStatus: { from: 'scratch-requested', to: 'confirmed' } },
        metadata: expect.objectContaining({
          action: 'deny_scratch_request',
          reason: 'Too late',
        }),
      })
    );
  });

  it('does not approve stale pull requests from unexpected entry statuses', async () => {
    getEntryById.mockResolvedValueOnce({ entryStatus: 'confirmed' });

    await expect(approvePullRequestReplicated('pull-entry')).resolves.toEqual({
      error: expect.any(Error),
    });

    expect(updateReplicatedDayOfScratch).not.toHaveBeenCalled();
  });
});
