import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tableMock = vi.hoisted(() => ({
  updateEntry: vi.fn<(id: string, updates: Record<string, unknown>) => Promise<string | null>>(() =>
    Promise.resolve('mutation-1')
  ),
  updateCheckInStatus: vi.fn<(id: string, status: string) => Promise<string | null>>(() =>
    Promise.resolve('mutation-1')
  ),
  updateSecretaryLifecycleStatus: vi.fn<
    (id: string, updates: Record<string, unknown>, seed?: unknown) => Promise<string | null>
  >(() => Promise.resolve('mutation-1')),
  getEntryById: vi.fn((id: string) => Promise.resolve({ id, showId: 'show-1' })),
}));
const { updateEntry, updateCheckInStatus, updateSecretaryLifecycleStatus } = tableMock;
const auditLog = vi.fn((..._args: unknown[]) => Promise.resolve());
const rpc = vi.fn((_name: string, _args?: Record<string, unknown>) =>
  Promise.resolve({ error: null as Error | null })
);

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    rpc: (name: string, args?: Record<string, unknown>) => rpc(name, args),
  },
  logQuery: vi.fn(),
  createDatabaseError,
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
  replicatedEntriesTable: tableMock,
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: tableMock,
}));

import { updateEntryStatus } from '@/services/database/entries/secretary';
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

  it('queues day-of scratch as a Pull: special_requests untouched, withdrawal_reason_code cleared', async () => {
    await expect(updateReplicatedDayOfScratch('entry-1', 'Dog absent')).resolves.toBe('mutation-1');

    expect(updateSecretaryLifecycleStatus).toHaveBeenCalledWith(
      'entry-1',
      {
        entryStatus: 'scratched',
        entry_status: 'scratched',
        status: 'scratched',
        checkInStatus: 'pulled',
        check_in_status: 'pulled',
        withdrawalReason: 'Dog absent',
        withdrawal_reason: 'Dog absent',
        withdrawalReasonCode: null,
        withdrawal_reason_code: null,
      },
      undefined
    );
    const written = updateSecretaryLifecycleStatus.mock.calls[0]?.[1] ?? {};
    expect(written).not.toHaveProperty('special_requests');
    expect(written).not.toHaveProperty('specialRequests');
    expect(updateEntry).not.toHaveBeenCalled();
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

  it('writes the same fields as the Entry Management Pull (one shared pull path)', async () => {
    await updateReplicatedDayOfScratch('entry-1', 'Dog absent');
    await updateEntryStatus('entry-1', 'scratched', 'Dog absent');

    const [dayOf, management] = updateSecretaryLifecycleStatus.mock.calls;
    expect(dayOf?.[1]).toEqual(management?.[1]);
  });
});
