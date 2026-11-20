// MYK9-2187 (restored from MYK9-2183's 92e72cc4a): an earlier attempt whose
// Stripe mode cannot be confirmed equal to the run's is never checked with the
// run's key, because Stripe lists only its own mode and an empty list would
// read as "no money moved". The payout stays held (processing, refunds
// blocked), the operator is alerted, and the recovery the alert names clears it.
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml } from '../_shared/clubMoneyEmails';
import { MODE_CHECKED_REASON, refuseUnknownKeyMode } from './payoutAlerts';
import { modeCheckedSql } from './payoutModeRecovery';
import { run, type Query } from './payoutTestWorld';

const isUpdate = (status: string) => (q: Query) =>
  q.table === 'show_payouts' && q.op === 'update' && q.values?.status === status;
const alertBody = (world: ReturnType<typeof run>, prefix: string) =>
  world.alertAdmin.mock.calls.find(c => c[0].startsWith(prefix))?.[1];
const failedLast = { latestRow: { id: 'row-0', status: 'failed' }, amounts: [9000] };
const staleRow = {
  id: 'row-9',
  show_id: 'show-1',
  amount_cents: 5000,
  shows: { name: 'Fall Trial', club_id: 'club-1' },
};

const unconfirmed = [
  { label: 'a mode mismatch', scenario: { attemptAccount: { livemode: true } } },
  { label: 'no linked account row', scenario: { attemptAccount: null } },
  { label: 'an account read error', scenario: { attemptAccountError: true } },
  { label: 'an account with no livemode', scenario: { attemptAccount: { livemode: null } } },
];

describe('the earlier attempt cannot be confirmed in the run’s Stripe mode', () => {
  it.each(unconfirmed)(
    'failed path, $label: no lookup, no queue, held as processing',
    async ({ scenario }) => {
      const world = run({ ...failedLast, ...scenario });
      await world.go();
      expect(world.list).not.toHaveBeenCalled();
      expect(world.rpc).not.toHaveBeenCalled();
      expect(world.create).not.toHaveBeenCalled();
      const writes = world.payoutWrites();
      expect(writes).toHaveLength(1);
      expect(writes[0].values).toEqual({ status: 'processing' });
      expect(writes[0].filters).toContainEqual(['eq', 'id', 'row-0']);
      expect(writes[0].filters).toContainEqual(['eq', 'status', 'failed']);
      expect(world.summary.attempt_mode_holds).toBe(1);
      expect(world.alertAdmin).toHaveBeenCalledWith(
        'Payout held: Stripe mode not confirmed: Fall Trial',
        expect.stringContaining('refunds are blocked'),
        { dedupeKey: 'payout-attempt-mode-show-1', severity: 'error' }
      );
      expect(world.release).toHaveBeenCalledTimes(1);
    }
  );

  it('a failed row with no linked account says why', async () => {
    const world = run({
      latestRow: { id: 'row-0', status: 'failed', club_stripe_account_id: null },
      amounts: [9000],
    });
    await world.go();
    expect(world.list).not.toHaveBeenCalled();
    expect(alertBody(world, 'Payout held: Stripe mode')).toContain('no linked Stripe account');
  });

  it('says plainly when the hold could not be written and refunds are NOT blocked', async () => {
    const world = run({
      ...failedLast,
      attemptAccount: { livemode: true },
      failWrite: isUpdate('processing'),
    });
    await world.go();
    expect(alertBody(world, 'Payout held: Stripe mode')).toContain('Refunds are NOT blocked');
  });

  it('the alert names the row and the exact step that clears the hold', async () => {
    const world = run({ ...failedLast, attemptAccount: { livemode: true } });
    await world.go();
    const body = alertBody(world, 'Payout held: Stripe mode') ?? '';
    expect(body).toContain('row-0');
    expect(body).toContain(escapeHtml(modeCheckedSql('row-0')));
    // The run is in test mode; the mismatched attempt was live.
    expect(body).toContain('in <strong>live mode</strong>, the mode the earlier attempt used');
    expect(body).toContain('other mode');
  });

  it.each(unconfirmed)(
    'stale path, $label: no lookup, never failed, stays processing',
    async ({ scenario }) => {
      const world = run({ staleRows: [staleRow], amounts: [0], ...scenario });
      await world.recoverStale();
      expect(world.list).not.toHaveBeenCalled();
      expect(world.payoutWrites()).toHaveLength(0);
      expect(world.summary.stale_recovered).toBe(0);
      expect(world.summary.attempt_mode_holds).toBe(1);
      expect(alertBody(world, 'Payout held: Stripe mode')).toContain('row-9');
    }
  );

  it('matching mode: the stale check works as before', async () => {
    const world = run({ staleRows: [staleRow], amounts: [0], attemptAccount: { livemode: false } });
    await world.recoverStale();
    expect(world.list).toHaveBeenCalledTimes(1);
    expect(world.payoutWrites()[0].values).toEqual({
      status: 'failed',
      failure_reason: 'stale_processing',
    });
    expect(world.summary.attempt_mode_holds).toBe(0);
  });

  it('matching mode: the failed path asks Stripe as before', async () => {
    const world = run({
      ...failedLast,
      claim: { data: { outcome: 'awaiting_approval', payout_id: 'row-1' }, error: null },
    });
    await world.go();
    expect(world.list).toHaveBeenCalledTimes(1);
    expect(world.rpc).toHaveBeenCalled();
    expect(world.summary.attempt_mode_holds).toBe(0);
  });
});

describe('the recovery step clears the hold', () => {
  // The operator's only statement, applied to a held row the way Postgres would.
  const applyOperatorCheck = (row: Record<string, unknown>) => {
    const sql = modeCheckedSql(String(row.id));
    const guarded = row.status === 'processing' && row.stripe_transfer_id == null;
    expect(sql).toContain(`where id = '${String(row.id)}'`);
    return guarded ? { ...row, failure_reason: MODE_CHECKED_REASON } : row;
  };
  const heldRow = { ...staleRow, status: 'processing', failure_reason: 'transfer_failed' };

  it('a held row the operator checked is reconciled by the run through its own path', async () => {
    // Before the check: held, nothing written, nothing asked.
    const before = run({ staleRows: [heldRow], amounts: [0], attemptAccount: { livemode: true } });
    await before.recoverStale();
    expect(before.list).not.toHaveBeenCalled();
    expect(before.payoutWrites()).toHaveLength(0);

    const checked = applyOperatorCheck(heldRow);
    expect(checked.status).toBe('processing');

    const world = run({
      staleRows: [checked],
      amounts: [0],
      attemptAccount: { livemode: true },
      transfers: [{ id: 'tr_run_mode', amount: 5000, destination: 'acct_club' }],
    });
    await world.recoverStale();
    expect(world.summary.attempt_mode_holds).toBe(0);
    expect(world.summary.reconciled).toBe(1);
    const done = world.payoutWrites().find(isUpdate('completed'));
    expect(done?.filters).toContainEqual(['eq', 'status', 'processing']);
    expect(done?.values).toMatchObject({
      stripe_transfer_id: 'tr_run_mode',
      amount_cents: 5000,
      club_stripe_account_id: 'csa-1',
      paid_stripe_account_id: 'acct_club',
      paid_destination_checked: true,
    });
    expect(world.create).not.toHaveBeenCalled();
  });

  it('the check changes nothing on a row that is no longer held', () => {
    const failed = { ...heldRow, status: 'failed' };
    expect(applyOperatorCheck(failed)).toBe(failed);
    const recorded = { ...heldRow, stripe_transfer_id: 'tr_x' };
    expect(applyOperatorCheck(recorded)).toBe(recorded);
  });

  it('after the stale path fails a checked row, the next pass asks in the run’s mode and queues again', async () => {
    const world = run({
      latestRow: { id: 'row-0', status: 'failed', failure_reason: MODE_CHECKED_REASON },
      amounts: [9000],
      attemptAccount: { livemode: true },
      claim: { data: { outcome: 'awaiting_approval', payout_id: 'row-1' }, error: null },
    });
    await world.go();
    expect(world.summary.attempt_mode_holds).toBe(0);
    expect(world.list).toHaveBeenCalledWith({ transfer_group: 'show-1', limit: 10 });
    expect(world.rpc).toHaveBeenCalled();
    expect(world.payoutWrites().find(isUpdate('processing'))).toBeUndefined();
  });

  it('a transfer found in the run’s mode is still recorded, not re-sent', async () => {
    const world = run({
      latestRow: { id: 'row-0', status: 'failed', failure_reason: MODE_CHECKED_REASON },
      amounts: [9000],
      attemptAccount: { livemode: true },
      transfers: [{ id: 'tr_live', amount: 9000, destination: 'acct_club' }],
    });
    await world.go();
    expect(world.create).not.toHaveBeenCalled();
    expect(world.rpc).not.toHaveBeenCalled();
    expect(world.payoutWrites().find(isUpdate('completed'))?.values).toMatchObject({
      stripe_transfer_id: 'tr_live',
    });
  });

  it('a checked row held again after a lookup error keeps the check when the stale path fails it', async () => {
    const world = run({
      staleRows: [{ ...staleRow, failure_reason: MODE_CHECKED_REASON }],
      amounts: [0],
      attemptAccount: { livemode: true },
    });
    await world.recoverStale();
    expect(world.summary.attempt_mode_holds).toBe(0);
    expect(world.list).toHaveBeenCalledTimes(1);
    expect(world.payoutWrites()[0].values).toEqual({
      status: 'failed',
      failure_reason: MODE_CHECKED_REASON,
    });
  });
});

describe('the run’s own key mode is unknown', () => {
  it('stops the run and alerts the operator', async () => {
    const alertAdmin = vi.fn(async () => undefined);
    await expect(refuseUnknownKeyMode({ alertAdmin }, 'unknown')).resolves.toBe(true);
    expect(alertAdmin).toHaveBeenCalledWith(
      'Payout run stopped: Stripe key mode unknown',
      expect.stringContaining('cannot tell whether it is in live or test mode'),
      { dedupeKey: 'payout-key-mode-unknown', severity: 'error' }
    );
  });

  it.each(['live', 'test'] as const)('lets a %s key run with no alert', async mode => {
    const alertAdmin = vi.fn(async () => undefined);
    await expect(refuseUnknownKeyMode({ alertAdmin }, mode)).resolves.toBe(false);
    expect(alertAdmin).not.toHaveBeenCalled();
  });
});
