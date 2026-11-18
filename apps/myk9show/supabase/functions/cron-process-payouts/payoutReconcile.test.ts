// MYK9-2183: an uncertain payout is checked with Stripe before anything is
// queued for it, Stripe's own amount and destination are what get recorded,
// and a ledger write that fails is reported, never counted as done.
import { describe, expect, it } from 'vitest';
import { run, type Query } from './payoutTestWorld';

const LOST = { id: 'tr_lost', amount: 11111, destination: 'acct_club' };
const isUpdate = (status: string) => (q: Query) =>
  q.table === 'show_payouts' && q.op === 'update' && q.values?.status === status;

describe('a show whose last attempt failed is checked with Stripe first', () => {
  it('a lost transfer is recorded with Stripe’s amount and destination, and nothing is queued', async () => {
    const world = run({
      latestRow: { id: 'row-0', status: 'failed' },
      transfers: [LOST],
      amounts: [9999],
    });
    await world.go();

    expect(world.list).toHaveBeenCalledWith({ transfer_group: 'show-1', limit: 10 });
    expect(world.create).toHaveBeenCalledTimes(0);
    expect(world.rpc).not.toHaveBeenCalled();
    const writes = world.payoutWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].values).toMatchObject({
      status: 'completed',
      stripe_transfer_id: 'tr_lost',
      amount_cents: 11111,
      club_stripe_account_id: 'csa-1',
    });
    expect(writes[0].filters).toContainEqual(['eq', 'id', 'row-0']);
    expect(writes[0].filters).toContainEqual(['eq', 'status', 'failed']);
    expect(world.alertAdmin).toHaveBeenCalledWith(
      'Payout reconciled with Stripe: Fall Trial',
      expect.stringContaining('tr_lost'),
      { dedupeKey: 'payout-reconciled-show-1', severity: 'warn' }
    );
    expect(world.summary.reconciled).toBe(1);
    expect(world.summary.completed).toBe(0);
    expect(world.acquireMoneyLock).toHaveBeenCalledTimes(1);
    expect(world.release).toHaveBeenCalledTimes(1);
  });

  it('a Stripe lookup error queues nothing and sends nothing that run', async () => {
    const world = run({
      latestRow: { id: 'row-0', status: 'failed' },
      listError: new Error('Stripe is down'),
      amounts: [9999],
    });
    await world.go();

    expect(world.create).not.toHaveBeenCalled();
    expect(world.rpc).not.toHaveBeenCalled();
    // Only the guarded hold that keeps refunds blocked (MYK9-2183 review).
    expect(world.payoutWrites().map(w => w.values)).toEqual([{ status: 'processing' }]);
    expect(world.summary.transfer_lookup_errors).toBe(1);
    expect(world.alertAdmin).toHaveBeenCalledWith(
      'Payout could not be checked with Stripe: Fall Trial',
      expect.stringContaining('Stripe is down'),
      { dedupeKey: 'payout-transfer-lookup-error-show-1', severity: 'error' }
    );
    expect(world.release).toHaveBeenCalledTimes(1);
  });

  it('no transfer at Stripe: the retry goes through the claim under the same lock', async () => {
    const world = run({
      latestRow: { id: 'row-0', status: 'failed' },
      amounts: [9999],
      claim: { data: { outcome: 'awaiting_approval', payout_id: 'row-1' }, error: null },
    });
    await world.go();

    expect(world.rpc).toHaveBeenCalledWith(
      'claim_show_payout_for_send',
      expect.objectContaining({ p_amount_cents: 9999 })
    );
    expect(world.summary.awaiting_approval).toBe(1);
    expect(world.acquireMoneyLock).toHaveBeenCalledTimes(1);
    expect(world.release).toHaveBeenCalledTimes(1);
  });

  it('a show with no earlier attempt does not ask Stripe before the claim', async () => {
    const world = run({
      amounts: [5000],
      claim: { data: { outcome: 'awaiting_approval', payout_id: 'row-1' }, error: null },
    });
    await world.go();
    expect(world.list).not.toHaveBeenCalled();
  });
});

describe('a payout stuck in processing stays blocked until Stripe answers', () => {
  const stale = [
    {
      id: 'row-9',
      show_id: 'show-1',
      amount_cents: 5000,
      shows: { name: 'Fall Trial', club_id: 'club-1' },
    },
  ];

  it('a transfer Stripe has is recorded as sent with Stripe’s amount, never failed', async () => {
    const world = run({ staleRows: stale, transfers: [LOST], amounts: [0] });
    await world.recoverStale();

    const writes = world.payoutWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].values).toMatchObject({
      status: 'completed',
      stripe_transfer_id: 'tr_lost',
      amount_cents: 11111,
    });
    expect(writes[0].filters).toContainEqual(['eq', 'status', 'processing']);
    expect(world.summary.reconciled).toBe(1);
    expect(world.summary.stale_recovered).toBe(0);
    expect(world.alertAdmin).toHaveBeenCalledWith(
      'Payout reconciled with Stripe: Fall Trial',
      expect.stringContaining('tr_lost'),
      { dedupeKey: 'payout-reconciled-show-1', severity: 'warn' }
    );
  });

  it('no transfer at Stripe: failed for retry', async () => {
    const world = run({ staleRows: stale, amounts: [0] });
    await world.recoverStale();
    const writes = world.payoutWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].values).toEqual({ status: 'failed', failure_reason: 'stale_processing' });
    expect(writes[0].filters).toContainEqual(['eq', 'status', 'processing']);
    expect(world.summary.stale_recovered).toBe(1);
  });

  it('a Stripe lookup error leaves it processing, so refunds stay blocked', async () => {
    const world = run({ staleRows: stale, listError: new Error('timeout'), amounts: [0] });
    await world.recoverStale();
    expect(world.payoutWrites()).toHaveLength(0);
    expect(world.summary.transfer_lookup_errors).toBe(1);
    expect(world.summary.stale_recovered).toBe(0);
  });
});

describe('the pre-send Stripe check records what Stripe sent', () => {
  it('records Stripe’s amount, not the recompute, and keeps the mismatch alert', async () => {
    const world = run({
      amounts: [5000],
      brakeOn: false,
      transfers: [{ id: 'tr_prior', amount: 7000, destination: 'acct_club' }],
    });
    await world.go();
    expect(world.create).not.toHaveBeenCalled();
    const done = world.payoutWrites().find(isUpdate('completed'));
    expect(done?.values).toMatchObject({
      stripe_transfer_id: 'tr_prior',
      amount_cents: 7000,
      club_stripe_account_id: 'csa-1',
    });
    expect(world.alertAdmin).toHaveBeenCalledWith(
      'Reconciled payout amount mismatch: Fall Trial',
      expect.any(String),
      { dedupeKey: 'payout-reconcile-mismatch-show-1' }
    );
    expect(world.summary.completed).toBe(1);
  });
});

describe('a ledger write that fails is reported, not counted', () => {
  it('money sent but the completion write failed: a reconciliation error, not success or failure', async () => {
    const world = run({
      amounts: [5000],
      brakeOn: false,
      failWrite: isUpdate('completed'),
      showName: '<b>Fall</b>',
    });
    await world.go();
    expect(world.create).toHaveBeenCalledTimes(1);
    expect(world.summary.completed).toBe(0);
    expect(world.summary.failed).toBe(0);
    expect(world.summary.reconciliation_errors).toBe(1);
    expect(world.payoutWrites().some(isUpdate('failed'))).toBe(false);
    const call = world.alertAdmin.mock.calls.find(c =>
      c[0].startsWith('Payout sent but not recorded')
    );
    expect(call?.[2]).toEqual({ dedupeKey: 'payout-reconcile-error-show-1', severity: 'error' });
    expect(call?.[1]).toContain('tr_1');
    expect(call?.[1]).toContain('&lt;b&gt;Fall&lt;/b&gt;');
    expect(call?.[1]).not.toContain('<b>Fall</b>');
  });

  it('a zero-dollar close-out that fails is not counted as skipped', async () => {
    const world = run({
      liveRow: { id: 'row-1', status: 'held' },
      amounts: [0],
      failWrite: isUpdate('completed'),
    });
    await world.go();
    expect(world.summary.skipped_no_online_money).toBe(0);
    expect(world.summary.ledger_write_errors).toBe(1);
  });

  it('an approval reset that fails is not counted as awaiting approval', async () => {
    const world = run({
      liveRow: { id: 'row-1', status: 'approved' },
      amounts: [10000, 12000],
      claim: {
        data: { outcome: 'claimed', payout_id: 'row-1', approved_amount_cents: 10000 },
        error: null,
      },
      failWrite: isUpdate('awaiting_approval'),
    });
    await world.go();
    expect(world.create).not.toHaveBeenCalled();
    expect(world.summary.awaiting_approval).toBe(0);
    expect(world.summary.ledger_write_errors).toBe(1);
  });

  it('an amount change after the claim that fails sends nothing', async () => {
    const world = run({
      amounts: [5000, 4000],
      brakeOn: false,
      failWrite: q => q.op === 'update' && q.values?.amount_cents === 4000 && !q.values?.status,
    });
    await world.go();
    expect(world.create).not.toHaveBeenCalled();
    expect(world.summary.ledger_write_errors).toBe(1);
  });

  it('a failure stamp that fails is a ledger error, not a counted failure', async () => {
    const world = run({
      amounts: [5000],
      brakeOn: false,
      transferError: Object.assign(new Error('No such destination'), {
        type: 'StripeInvalidRequestError',
      }),
      failWrite: isUpdate('failed'),
    });
    await world.go();
    expect(world.summary.failed).toBe(0);
    expect(world.summary.ledger_write_errors).toBe(1);
  });

  it('a parked amount refresh that fails is not counted as parked', async () => {
    const world = run({
      liveRow: { id: 'row-1', status: 'pending' },
      amounts: [5000],
      payoutsEnabled: false,
      failWrite: q => q.op === 'update',
    });
    await world.go();
    expect(world.summary.pending_not_onboarded).toBe(0);
    expect(world.summary.ledger_write_errors).toBe(1);
  });
});
