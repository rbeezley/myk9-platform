// MYK9-2183 review: while it is uncertain whether Stripe moved money, the
// payout row stays 'processing' (refunds blocked) and the operator is told;
// 'failed' is only for a definite "no money moved".
import { describe, expect, it } from 'vitest';
import { run, type Query } from './payoutTestWorld';

const isUpdate = (status: string) => (q: Query) =>
  q.table === 'show_payouts' && q.op === 'update' && q.values?.status === status;
const subjects = (world: ReturnType<typeof run>) =>
  world.alertAdmin.mock.calls.map(call => call[0]);

describe('the Stripe check just before the send', () => {
  it('a lookup error sends nothing and leaves the row processing', async () => {
    const world = run({ amounts: [5000], brakeOn: false, listError: new Error('Stripe timeout') });
    await world.go();
    expect(world.create).not.toHaveBeenCalled();
    expect(world.payoutWrites().some(isUpdate('failed'))).toBe(false);
    expect(world.summary.transfer_lookup_errors).toBe(1);
    expect(world.summary.failed).toBe(0);
    expect(subjects(world)).toEqual(['Payout could not be checked with Stripe: Fall Trial']);
  });
});

describe('a transfer request Stripe did not clearly answer', () => {
  it('a network error leaves the row processing and warns the operator', async () => {
    const world = run({
      amounts: [5000],
      brakeOn: false,
      transferError: Object.assign(new Error('socket hang up'), { type: 'StripeConnectionError' }),
      showName: '<i>Fall</i>',
    });
    await world.go();
    expect(world.payoutWrites().some(isUpdate('failed'))).toBe(false);
    expect(world.summary.uncertain_transfers).toBe(1);
    expect(world.summary.failed).toBe(0);
    const call = world.alertAdmin.mock.calls.find(
      c => c[0] === 'Payout outcome unknown: <i>Fall</i>'
    );
    expect(call?.[2]).toEqual({ dedupeKey: 'payout-outcome-unknown-show-1', severity: 'warn' });
    expect(call?.[1]).toContain('&lt;i&gt;Fall&lt;/i&gt;');
    expect(call?.[1]).toContain('socket hang up');
  });

  it('an invalid-request rejection is marked failed, as before', async () => {
    const world = run({
      amounts: [5000],
      brakeOn: false,
      transferError: Object.assign(new Error('No such destination'), {
        type: 'StripeInvalidRequestError',
      }),
    });
    await world.go();
    const stamp = world.payoutWrites().find(isUpdate('failed'));
    expect(stamp?.values).toEqual({ status: 'failed', failure_reason: 'No such destination' });
    expect(world.summary.failed).toBe(1);
    expect(world.summary.uncertain_transfers).toBe(0);
    expect(subjects(world)).toContain('Payout FAILED: Fall Trial');
  });

  it('an insufficient balance stays the benign deferral', async () => {
    const world = run({
      amounts: [5000],
      brakeOn: false,
      transferError: new Error('Insufficient funds: balance_insufficient'),
    });
    await world.go();
    const stamp = world.payoutWrites().find(isUpdate('failed'));
    expect(stamp?.values?.failure_reason).toBe(
      'insufficient_balance: Insufficient funds: balance_insufficient'
    );
    expect(world.summary.failed).toBe(1);
    expect(world.alertAdmin).toHaveBeenCalledWith(
      'Payout deferred (benign): Fall Trial',
      expect.any(String),
      { dedupeKey: 'payout-insufficient-balance-show-1' }
    );
  });
});

describe('a step that throws after the money moved', () => {
  it('before the record is written: counted and alerted as a reconciliation error', async () => {
    const world = run({ amounts: [5000], brakeOn: false, throwWrite: isUpdate('completed') });
    await world.go();
    expect(world.create).toHaveBeenCalledTimes(1);
    expect(world.payoutWrites().some(isUpdate('failed'))).toBe(false);
    expect(world.summary.reconciliation_errors).toBe(1);
    expect(world.summary.completed).toBe(0);
    expect(world.summary.failed).toBe(0);
    expect(subjects(world)).toContain('Payout sent but not recorded: Fall Trial');
  });

  it('after the record is written (the club email): counted once, never failed', async () => {
    const world = run({
      amounts: [5000],
      brakeOn: false,
      clubEmailError: new Error('Resend down'),
    });
    await world.go();
    expect(world.summary.completed).toBe(1);
    expect(world.summary.reconciliation_errors).toBe(0);
    expect(world.payoutWrites().some(isUpdate('failed'))).toBe(false);
  });
});

describe('what the Stripe list shows', () => {
  const failedLast = { latestRow: { id: 'row-0', status: 'failed' }, amounts: [9000] };

  it('more transfers than one page: a lookup error, nothing written', async () => {
    const world = run({
      ...failedLast,
      transfers: [{ id: 'tr_a', amount: 9000, destination: 'acct_club' }],
      transfersHasMore: true,
    });
    await world.go();
    expect(world.list).toHaveBeenCalledWith({ transfer_group: 'show-1', limit: 10 });
    // Only the guarded hold that keeps refunds blocked (MYK9-2183 review).
    expect(world.payoutWrites().map(w => w.values)).toEqual([{ status: 'processing' }]);
    expect(world.rpc).not.toHaveBeenCalled();
    expect(world.summary.transfer_lookup_errors).toBe(1);
  });

  it('a fully reversed transfer is not a payout: the retry goes on to the claim', async () => {
    const world = run({
      ...failedLast,
      transfers: [
        {
          id: 'tr_back',
          amount: 9000,
          destination: 'acct_club',
          reversed: true,
          amount_reversed: 9000,
        },
      ],
      claim: { data: { outcome: 'awaiting_approval', payout_id: 'row-1' }, error: null },
    });
    await world.go();
    expect(world.payoutWrites().some(isUpdate('completed'))).toBe(false);
    expect(world.rpc).toHaveBeenCalled();
  });

  it('a partly reversed transfer is recorded and the reversal is named', async () => {
    const world = run({
      ...failedLast,
      transfers: [{ id: 'tr_part', amount: 9000, destination: 'acct_club', amount_reversed: 2500 }],
    });
    await world.go();
    expect(world.payoutWrites().find(isUpdate('completed'))?.values).toMatchObject({
      stripe_transfer_id: 'tr_part',
      amount_cents: 9000,
    });
    const body = world.alertAdmin.mock.calls.find(c => c[0].startsWith('Payout reconciled'))?.[1];
    expect(body).toContain('$25.00 of it was reversed');
  });

  it('a destination that is not the club’s account is recorded and named', async () => {
    const world = run({
      ...failedLast,
      transfers: [{ id: 'tr_else', amount: 9000, destination: 'acct_other' }],
    });
    await world.go();
    const done = world.payoutWrites().find(isUpdate('completed'));
    expect(done?.values).toMatchObject({ stripe_transfer_id: 'tr_else', amount_cents: 9000 });
    expect(done?.values).toMatchObject({ club_stripe_account_id: null });
    const body = world.alertAdmin.mock.calls.find(c => c[0].startsWith('Payout reconciled'))?.[1];
    expect(body).toContain('not this club’s Stripe account');
  });

  it('two live transfers: records the newest, alerts a possible double payment, sends nothing', async () => {
    const world = run({
      ...failedLast,
      transfers: [
        { id: 'tr_new', amount: 9000, destination: 'acct_club' },
        { id: 'tr_old', amount: 9000, destination: 'acct_club' },
      ],
    });
    await world.go();
    expect(world.create).not.toHaveBeenCalled();
    expect(world.payoutWrites().find(isUpdate('completed'))?.values?.stripe_transfer_id).toBe(
      'tr_new'
    );
    const body = world.alertAdmin.mock.calls.find(c => c[0].startsWith('Payout reconciled'))?.[1];
    expect(body).toContain('possible double payment');
  });
});

describe('a lost transfer whose record could not be written (last attempt failed)', () => {
  const lost = {
    latestRow: { id: 'row-0', status: 'failed' },
    amounts: [9000],
    transfers: [{ id: 'tr_lost', amount: 9000, destination: 'acct_club' }],
  };

  it('moves the row to processing so refunds are blocked', async () => {
    const world = run({ ...lost, failWrite: isUpdate('completed') });
    await world.go();
    const hold = world.payoutWrites().find(isUpdate('processing'));
    expect(hold?.filters).toContainEqual(['eq', 'id', 'row-0']);
    expect(hold?.filters).toContainEqual(['eq', 'status', 'failed']);
    expect(world.summary.reconciliation_errors).toBe(1);
    const body = world.alertAdmin.mock.calls.find(c => c[0].startsWith('Payout sent but'))?.[1];
    expect(body).toContain('refunds are blocked');
  });

  it('says plainly when refunds are NOT blocked', async () => {
    const world = run({
      ...lost,
      failWrite: q => isUpdate('completed')(q) || isUpdate('processing')(q),
    });
    await world.go();
    const body = world.alertAdmin.mock.calls.find(c => c[0].startsWith('Payout sent but'))?.[1];
    expect(body).toContain('Refunds are NOT blocked');
  });
});
