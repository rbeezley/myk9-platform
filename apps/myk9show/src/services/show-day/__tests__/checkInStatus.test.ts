import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateEntry = vi.fn<(id: string, updates: Record<string, unknown>) => Promise<string | null>>(
  () => Promise.resolve('mutation-1')
);
const updateCheckInStatus = vi.fn<(id: string, status: string) => Promise<string | null>>(() =>
  Promise.resolve('mutation-1')
);
const auditLog = vi.fn<() => Promise<void>>(() => Promise.resolve());
const rpc = vi.fn<() => Promise<{ error: Error | null }>>(() => Promise.resolve({ error: null }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
  createDatabaseError: (err: unknown) => {
    if (err instanceof Error) return err;
    return new Error(String(err));
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

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    updateEntry: (id: string, updates: Record<string, unknown>) => updateEntry(id, updates),
    updateCheckInStatus: (id: string, status: string) => updateCheckInStatus(id, status),
  },
}));

import {
  updateReplicatedCheckInStatus,
  updateReplicatedDayOfScratch,
  updateSelfCheckInStatus,
} from '../checkInStatus';

describe('updateReplicatedCheckInStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ error: null });
    auditLog.mockResolvedValue();
    updateEntry.mockClear();
    updateCheckInStatus.mockClear();
  });

  it('queues check-in status through the narrow replicated entry mutation', async () => {
    await expect(updateReplicatedCheckInStatus('entry-1', 'checked-in')).resolves.toBe(
      'mutation-1'
    );

    expect(updateCheckInStatus).toHaveBeenCalledWith('entry-1', 'checked-in');
    expect(updateEntry).not.toHaveBeenCalled();
  });

  it('writes both replicated model and database check-in fields when extra fields are queued', async () => {
    await expect(
      updateReplicatedCheckInStatus('entry-1', 'checked-in', {
        ring_entry_time: '2026-05-18T12:00:00.000Z',
      })
    ).resolves.toBe('mutation-1');

    expect(updateEntry).toHaveBeenCalledWith('entry-1', {
      checkInStatus: 'checked-in',
      check_in_status: 'checked-in',
      ring_entry_time: '2026-05-18T12:00:00.000Z',
    });
    expect(updateCheckInStatus).not.toHaveBeenCalled();
  });

  it('routes self check-in through the owner-scoped RPC contract', async () => {
    await expect(updateSelfCheckInStatus('entry-1', 'checked-in')).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledWith('self_checkin_entry', {
      p_entry_id: 'entry-1',
      p_new_status: 'checked-in',
    });
    expect(updateCheckInStatus).not.toHaveBeenCalled();
    expect(updateEntry).not.toHaveBeenCalled();
  });

  it('queues day-of scratch through replicated entry status and check-in status fields', async () => {
    await expect(updateReplicatedDayOfScratch('entry-1', 'Dog absent')).resolves.toBe(
      'mutation-1'
    );

    expect(updateEntry).toHaveBeenCalledWith('entry-1', {
      entryStatus: 'scratched',
      entry_status: 'scratched',
      checkInStatus: 'pulled',
      check_in_status: 'pulled',
      withdrawalReason: 'Dog absent',
      withdrawal_reason: 'Dog absent',
      specialRequests: 'Dog absent',
      special_requests: 'Dog absent',
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update',
        entityType: 'entry',
        entityId: 'entry-1',
        changes: { entryStatus: { from: null, to: 'scratched' } },
        metadata: expect.objectContaining({
          action: 'scratch_entry_day_of',
          reason: 'Dog absent',
          checkInStatus: 'pulled',
        }),
      })
    );
    expect(updateCheckInStatus).not.toHaveBeenCalled();
  });

  it('can label a replicated day-of scratch as pull approval for audit history', async () => {
    await expect(
      updateReplicatedDayOfScratch('entry-1', 'Pull approved', {
        auditAction: 'approve_scratch_request',
        fromStatus: 'scratch-requested',
      })
    ).resolves.toBe('mutation-1');

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: { entryStatus: { from: 'scratch-requested', to: 'scratched' } },
        metadata: expect.objectContaining({
          action: 'approve_scratch_request',
          checkInStatus: 'pulled',
        }),
      })
    );
  });
});
