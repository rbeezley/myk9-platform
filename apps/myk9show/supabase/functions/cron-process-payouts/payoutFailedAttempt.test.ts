// MYK9-2183: a failed attempt Stripe cannot be asked about keeps refunds
// blocked (moved back to 'processing'), and a transfer to a destination that
// is not the club's account is recorded with no account; only a confirmed
// mismatch says so. The Stripe-mode check is MYK9-2187.
import { describe, expect, it } from 'vitest';
import { run, type Query } from './payoutTestWorld';

const isUpdate = (status: string) => (q: Query) =>
  q.table === 'show_payouts' && q.op === 'update' && q.values?.status === status;
const alertBody = (world: ReturnType<typeof run>, prefix: string) =>
  world.alertAdmin.mock.calls.find(c => c[0].startsWith(prefix))?.[1];
const failedLast = { latestRow: { id: 'row-0', status: 'failed' }, amounts: [9000] };

describe('a failed attempt Stripe cannot be asked about', () => {
  it('a lookup error moves the row to processing, guarded, and queues nothing', async () => {
    const world = run({ ...failedLast, listError: new Error('Stripe is down') });
    await world.go();
    const writes = world.payoutWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].values).toEqual({ status: 'processing' });
    expect(writes[0].filters).toContainEqual(['eq', 'id', 'row-0']);
    expect(writes[0].filters).toContainEqual(['eq', 'status', 'failed']);
    expect(world.rpc).not.toHaveBeenCalled();
    expect(world.create).not.toHaveBeenCalled();
    expect(world.summary.transfer_lookup_errors).toBe(1);
    expect(alertBody(world, 'Payout could not be checked')).toContain('refunds are blocked');
    expect(world.release).toHaveBeenCalledTimes(1);
  });

  it('says plainly when that move fails and refunds are NOT blocked', async () => {
    const world = run({
      ...failedLast,
      listError: new Error('Stripe is down'),
      failWrite: isUpdate('processing'),
    });
    await world.go();
    expect(alertBody(world, 'Payout could not be checked')).toContain('Refunds are NOT blocked');
  });
});

describe('a destination that is not the club’s account', () => {
  const found = {
    ...failedLast,
    transfers: [{ id: 'tr_else', amount: 9000, destination: 'acct_other' }],
  };

  it('a confirmed mismatch records no account and names the real destination', async () => {
    const world = run(found);
    await world.go();
    const done = world.payoutWrites().find(isUpdate('completed'));
    expect(done?.values).toMatchObject({
      stripe_transfer_id: 'tr_else',
      club_stripe_account_id: null,
    });
    const body = alertBody(world, 'Payout reconciled');
    expect(body).toContain('acct_other');
    expect(body).toContain('not this club’s Stripe account');
  });

  it('an account-query error leaves the account alone and says it could not be checked', async () => {
    const world = run({ ...found, destinationLookupError: true });
    await world.go();
    const done = world.payoutWrites().find(isUpdate('completed'));
    expect(done?.values).not.toHaveProperty('club_stripe_account_id');
    const body = alertBody(world, 'Payout reconciled');
    expect(body).toContain('could not be checked');
    expect(body).not.toContain('not this club’s Stripe account');
  });
});
