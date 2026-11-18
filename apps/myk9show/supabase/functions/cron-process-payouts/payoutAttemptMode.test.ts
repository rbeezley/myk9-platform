// MYK9-2183 Codex round 1: an earlier attempt Stripe cannot answer for (Stripe
// down, or a key in the other mode) keeps the payout blocked as 'processing';
// a destination that is not the club's is recorded as no account, and only a
// confirmed mismatch says so.
import { describe, expect, it } from 'vitest';
import { run, type Query } from './payoutTestWorld';

const isUpdate = (status: string) => (q: Query) =>
  q.table === 'show_payouts' && q.op === 'update' && q.values?.status === status;
const alertBody = (world: ReturnType<typeof run>, prefix: string) =>
  world.alertAdmin.mock.calls.find(c => c[0].startsWith(prefix))?.[1];
const failedLast = { latestRow: { id: 'row-0', status: 'failed' }, amounts: [9000] };
const stale = [
  {
    id: 'row-9',
    show_id: 'show-1',
    amount_cents: 5000,
    shows: { name: 'Fall Trial', club_id: 'club-1' },
  },
];

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

describe('the earlier attempt was made in the other Stripe mode', () => {
  it.each([
    { label: 'a mode mismatch', scenario: { attemptAccount: { livemode: true } } },
    { label: 'no linked account', scenario: { attemptAccount: null } },
    { label: 'an account read error', scenario: { attemptAccountError: true } },
  ])('failed path, $label: no lookup, no queue, held as processing', async ({ scenario }) => {
    const world = run({ ...failedLast, ...scenario });
    await world.go();
    expect(world.list).not.toHaveBeenCalled();
    expect(world.rpc).not.toHaveBeenCalled();
    const writes = world.payoutWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].values).toEqual({ status: 'processing' });
    expect(writes[0].filters).toContainEqual(['eq', 'status', 'failed']);
    expect(world.summary.attempt_mode_holds).toBe(1);
    expect(world.alertAdmin).toHaveBeenCalledWith(
      'Payout held: Stripe mode not confirmed: Fall Trial',
      expect.stringContaining('refunds are blocked'),
      { dedupeKey: 'payout-attempt-mode-show-1', severity: 'error' }
    );
  });

  it('a failed row with no linked account says why', async () => {
    const world = run({
      latestRow: { id: 'row-0', status: 'failed', club_stripe_account_id: null },
      amounts: [9000],
    });
    await world.go();
    expect(world.list).not.toHaveBeenCalled();
    expect(alertBody(world, 'Payout held: Stripe mode')).toContain('no linked Stripe account');
  });

  it.each([
    { label: 'a mode mismatch', scenario: { attemptAccount: { livemode: true } } },
    { label: 'no linked account', scenario: { attemptAccount: null } },
    { label: 'an account read error', scenario: { attemptAccountError: true } },
  ])('stale path, $label: no lookup, never failed, stays processing', async ({ scenario }) => {
    const world = run({ staleRows: stale, amounts: [0], ...scenario });
    await world.recoverStale();
    expect(world.list).not.toHaveBeenCalled();
    expect(world.payoutWrites()).toHaveLength(0);
    expect(world.summary.stale_recovered).toBe(0);
    expect(world.summary.attempt_mode_holds).toBe(1);
  });

  it('matching mode: the stale check works as before', async () => {
    const world = run({ staleRows: stale, amounts: [0], attemptAccount: { livemode: false } });
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
