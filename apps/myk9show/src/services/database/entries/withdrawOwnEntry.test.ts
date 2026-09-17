/**
 * MYK9-535: an exhibitor pulling their own entry must NOT go through the direct
 * `entries` UPDATE — the `entries_update` RLS policy admits only
 * `can_manage_show(show_id)`, so the MutationManager upload fails with an
 * "authorization" failureKind and the pull silently never persists.
 *
 * Assertion-first: these pin the tier split (owner -> RPC, manager -> the
 * existing lifecycle transition) and the audit record's real from-status.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';
import { WithdrawNotAllowedError } from './withdrawEligibility';

const mocks = vi.hoisted(() => ({
  logQuery: vi.fn(),
  withdrawOwnEntry: vi.fn(),
  getWithdrawEligibility: vi.fn(),
  updateSecretaryLifecycleStatus: vi.fn(),
  getEntryById: vi.fn(),
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
    getWithdrawEligibility: mocks.getWithdrawEligibility,
    updateSecretaryLifecycleStatus: mocks.updateSecretaryLifecycleStatus,
    getEntryById: mocks.getEntryById,
  },
}));

vi.mock('@/services/AuditService', () => ({
  auditService: { log: mocks.auditLog },
}));

import { withdrawEntry } from './writes';

describe('withdrawEntry — MYK9-535 exhibitor self-withdrawal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withdrawOwnEntry.mockResolvedValue({ from: 'confirmed', to: 'withdrawn' });
    mocks.getEntryById.mockResolvedValue({ id: 'entry-1', showId: 'show-1', classId: 'class-1' });
    mocks.updateSecretaryLifecycleStatus.mockResolvedValue('mutation-secretary');
  });

  it('routes an exhibitor withdrawal through the withdraw_own_entry RPC seam', async () => {
    const { error } = await withdrawEntry('entry-1', { kind: 'withdraw', reason: 'in_season' });

    expect(error).toBeNull();
    expect(mocks.withdrawOwnEntry).toHaveBeenCalledWith('entry-1', {
      kind: 'withdraw',
      reason: 'in_season',
    });
    // The direct-UPDATE lifecycle path is what RLS denies — it must not be used.
    expect(mocks.updateSecretaryLifecycleStatus).not.toHaveBeenCalled();
  });

  // MYK9-632: Withdraw and Pull are different acts. The kind and the reason must
  // reach the seam verbatim — collapsing them is the whole defect.
  it('carries the PULL kind through with no reason attached', async () => {
    mocks.withdrawOwnEntry.mockResolvedValue({ from: 'confirmed', to: 'scratched' });

    await withdrawEntry('entry-1', { kind: 'pull' });

    expect(mocks.withdrawOwnEntry).toHaveBeenCalledWith('entry-1', {
      kind: 'pull',
      reason: null,
    });
  });

  it('carries the judge-change reason through verbatim', async () => {
    await withdrawEntry('entry-1', { kind: 'withdraw', reason: 'judge_change' });

    expect(mocks.withdrawOwnEntry).toHaveBeenCalledWith('entry-1', {
      kind: 'withdraw',
      reason: 'judge_change',
    });
  });

  it('audits a PULL as scratched, not as a withdrawal', async () => {
    mocks.withdrawOwnEntry.mockResolvedValue({ from: 'confirmed', to: 'scratched' });

    await withdrawEntry('entry-1', { kind: 'pull' });

    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: { entryStatus: { from: 'confirmed', to: 'scratched' } },
        metadata: expect.objectContaining({ action: 'withdraw_own_entry', kind: 'pull' }),
      })
    );
  });

  it('keeps a SHOW MANAGER on the existing lifecycle transition', async () => {
    // A manager is admitted by entries_update, so their audit action and
    // replication payload must not change because of this issue.
    await withdrawEntry('entry-1', { asShowManager: true });

    expect(mocks.withdrawOwnEntry).not.toHaveBeenCalled();
    expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledTimes(1);
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ action: 'reject_entry' }) })
    );
  });

  it('audit-logs the withdrawn transition with the REAL from-status', async () => {
    await withdrawEntry('entry-1', { kind: 'withdraw', reason: 'in_season' });

    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'entry',
        entityId: 'entry-1',
        changes: { entryStatus: { from: 'confirmed', to: 'withdrawn' } },
        metadata: expect.objectContaining({
          action: 'withdraw_own_entry',
          kind: 'withdraw',
          withdrawalReasonCode: 'in_season',
        }),
      })
    );
  });

  it('surfaces a refusal as an error and never audits', async () => {
    // The refusal the exhibitor must SEE. The write is online-only precisely so
    // this cannot resolve as success before the server has answered.
    mocks.withdrawOwnEntry.mockRejectedValue(
      new WithdrawNotAllowedError({
        allowed: false,
        code: 'paid',
        reason: 'This entry is paid — request a refund instead of withdrawing.',
      })
    );

    const { data, error } = await withdrawEntry('entry-1', {
      kind: 'withdraw',
      reason: 'in_season',
    });

    expect(data).toBeNull();
    expect(error?.message).toContain('request a refund');
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });
});
