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
  denyPullRefundDecision: vi.fn(),
  functionsInvoke: vi.fn(),
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

// Spies on the money surfaces, so "the exhibitor's click moved no money" is an
// assertion rather than a claim.
vi.mock('@/features/payments/denyPullRefundDecision', () => ({
  denyPullRefundDecision: mocks.denyPullRefundDecision,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: mocks.functionsInvoke }, rpc: vi.fn(), from: vi.fn() },
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

  // MYK9-632: a manager stays on the lifecycle / mutation-manager path (they are
  // admitted by `entries_update`), but they no longer lose the ACT. Routing both
  // choices to `rejectEntry` stored a manager's Pull as 'withdrawn', badged the
  // row "Pulled", and kept it out of the Pull tab, so its refund decision was
  // unreachable from any surface.
  it('keeps a SHOW MANAGER on the lifecycle path and writes the act they picked', async () => {
    await withdrawEntry('entry-1', { asShowManager: true, kind: 'pull' });

    expect(mocks.withdrawOwnEntry).not.toHaveBeenCalled();
    expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledWith(
      'entry-1',
      expect.objectContaining({ entry_status: 'scratched', withdrawal_reason_code: null }),
      undefined
    );
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ action: 'pull_entry' }) })
    );
  });

  it('carries a MANAGER withdrawal reason to the lifecycle write', async () => {
    await withdrawEntry('entry-1', {
      asShowManager: true,
      kind: 'withdraw',
      reason: 'in_season',
    });

    expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledWith(
      'entry-1',
      expect.objectContaining({
        entry_status: 'withdrawn',
        withdrawal_reason_code: 'in_season',
      }),
      undefined
    );
    expect(mocks.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ action: 'withdraw_entry' }) })
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
        code: 'at-show',
        reason: 'This entry is checked in at the show — ask the secretary to pull it.',
      })
    );

    const { data, error } = await withdrawEntry('entry-1', {
      kind: 'withdraw',
      reason: 'in_season',
    });

    expect(data).toBeNull();
    expect(error?.message).toContain('checked in at the show');
    expect(mocks.auditLog).not.toHaveBeenCalled();
  });
});

/**
 * MYK9-632, owner decision 2026-09-17: a paid entry can be withdrawn, and that
 * act must not move a cent. The refund is the secretary's, made afterwards on
 * the reconciliation surface under the premium's rules.
 */
describe('withdrawEntry — the exhibitor act never moves money', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withdrawOwnEntry.mockResolvedValue({ from: 'confirmed', to: 'withdrawn' });
  });

  it('calls no refund service for either act, paid or not', async () => {
    await withdrawEntry('entry-1', { kind: 'withdraw', reason: 'in_season' });
    await withdrawEntry('entry-2', { kind: 'pull' });

    // The two surfaces that move money for an entry: the deny-decision RPC and
    // the `stripe-refund-entry` edge function. Neither may be reached from here.
    expect(mocks.denyPullRefundDecision).not.toHaveBeenCalled();
    expect(mocks.functionsInvoke).not.toHaveBeenCalled();
  });
});
