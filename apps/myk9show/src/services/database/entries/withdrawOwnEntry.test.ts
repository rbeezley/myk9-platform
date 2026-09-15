/**
 * MYK9-535: an exhibitor pulling their own entry must NOT go through the direct
 * `entries` UPDATE — the `entries_update` RLS policy admits only
 * `can_manage_show(show_id)`, so the MutationManager upload fails with an
 * "authorization" failureKind and the pull silently never persists.
 *
 * Assertion-first: these pin the RPC name and the exact field delta the
 * `withdraw_own_entry` SECURITY DEFINER function receives.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

const mocks = vi.hoisted(() => ({
  logQuery: vi.fn(),
  withdrawOwnEntry: vi.fn(),
  getEntryById: vi.fn(),
  updateSecretaryLifecycleStatus: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  createDatabaseError,
  logQuery: mocks.logQuery,
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    withdrawOwnEntry: mocks.withdrawOwnEntry,
    getEntryById: mocks.getEntryById,
    updateSecretaryLifecycleStatus: mocks.updateSecretaryLifecycleStatus,
  },
}));

vi.mock('@/services/AuditService', () => ({
  auditService: { log: mocks.auditLog },
}));

import { withdrawEntry } from './writes';

describe('withdrawEntry — MYK9-535 exhibitor self-withdrawal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withdrawOwnEntry.mockResolvedValue('mutation-1');
    mocks.getEntryById.mockResolvedValue({ id: 'entry-1', showId: 'show-1', classId: 'class-1' });
  });

  it('routes the withdrawal through the withdraw_own_entry RPC seam', async () => {
    const { error } = await withdrawEntry('entry-1');

    expect(error).toBeNull();
    expect(mocks.withdrawOwnEntry).toHaveBeenCalledWith('entry-1', undefined);
    // The direct-UPDATE lifecycle path is what RLS denies — it must not be used.
    expect(mocks.updateSecretaryLifecycleStatus).not.toHaveBeenCalled();
  });

  it('passes the withdrawal reason through to the RPC', async () => {
    await withdrawEntry('entry-1', 'Dog is injured');

    expect(mocks.withdrawOwnEntry).toHaveBeenCalledWith('entry-1', 'Dog is injured');
  });

  it('audit-logs the withdrawn transition', async () => {
    await withdrawEntry('entry-1', 'Dog is injured');

    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'entry',
        entityId: 'entry-1',
        changes: { entryStatus: { from: null, to: 'withdrawn' } },
        metadata: expect.objectContaining({
          action: 'withdraw_own_entry',
          reason: 'Dog is injured',
        }),
      })
    );
  });

  it('surfaces a database error instead of reporting success', async () => {
    mocks.withdrawOwnEntry.mockRejectedValue(new Error('Not authorized'));

    const { data, error } = await withdrawEntry('entry-1');

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });
});
