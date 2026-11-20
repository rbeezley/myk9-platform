// MYK9-2195: every completed transfer records the Stripe account Stripe says
// it paid (paid_stripe_account_id, paid_destination_checked = true), or says
// explicitly that the destination was not checked (NULL, false). The approval
// tally counts a payout as matched only when that account is the approved one.
import { describe, expect, it } from 'vitest';
import { run, type Query, type StripeTransferRow } from './payoutTestWorld';

const completedWrite = (writes: Query[]) =>
  writes.find(w => w.op === 'update' && w.values?.status === 'completed');

describe('a new transfer records the account Stripe reports paying', () => {
  const send = (createdDestination?: string | null) =>
    run({
      amounts: [12345],
      brakeOn: false,
      claim: { data: { outcome: 'claimed', payout_id: 'row-1' }, error: null },
      createdDestination,
    });

  it('the approved account', async () => {
    const world = send();
    await world.go();
    expect(completedWrite(world.payoutWrites())?.values).toEqual({
      status: 'completed',
      stripe_transfer_id: 'tr_1',
      completed_at: expect.any(String),
      paid_stripe_account_id: 'acct_club',
      paid_destination_checked: true,
    });
  });

  it('another account, as Stripe reported it', async () => {
    const world = send('acct_other');
    await world.go();
    expect(completedWrite(world.payoutWrites())?.values).toMatchObject({
      paid_stripe_account_id: 'acct_other',
      paid_destination_checked: true,
    });
  });

  it('no destination in Stripe’s answer: recorded as not checked', async () => {
    const world = send(null);
    await world.go();
    expect(completedWrite(world.payoutWrites())?.values).toMatchObject({
      paid_stripe_account_id: null,
      paid_destination_checked: false,
    });
  });
});

describe('a reconciled transfer records the account Stripe reports paying', () => {
  const found = (destination: string | null): StripeTransferRow => ({
    id: 'tr_lost',
    amount: 11111,
    destination,
  });
  const reconcile = (destination: string | null, destinationLookupError = false) =>
    run({
      latestRow: { id: 'row-0', status: 'failed' },
      transfers: [found(destination)],
      amounts: [9999],
      destinationLookupError,
    });

  it('the approved account', async () => {
    const world = reconcile('acct_club');
    await world.go();
    expect(completedWrite(world.payoutWrites())?.values).toMatchObject({
      stripe_transfer_id: 'tr_lost',
      club_stripe_account_id: 'csa-1',
      paid_stripe_account_id: 'acct_club',
      paid_destination_checked: true,
    });
  });

  it('another account: recorded as Stripe reported it, not as the club’s', async () => {
    const world = reconcile('acct_other');
    await world.go();
    expect(completedWrite(world.payoutWrites())?.values).toMatchObject({
      club_stripe_account_id: null,
      paid_stripe_account_id: 'acct_other',
      paid_destination_checked: true,
    });
  });

  it('no destination from Stripe: recorded as not checked', async () => {
    const world = reconcile(null);
    await world.go();
    const values = completedWrite(world.payoutWrites())?.values;
    expect(values).toMatchObject({
      stripe_transfer_id: 'tr_lost',
      paid_stripe_account_id: null,
      paid_destination_checked: false,
    });
    // The club account link is left as it was.
    expect(values).not.toHaveProperty('club_stripe_account_id');
  });

  it('the club-account lookup failing still records what Stripe reported', async () => {
    const world = reconcile('acct_club', true);
    await world.go();
    const values = completedWrite(world.payoutWrites())?.values;
    expect(values).toMatchObject({
      paid_stripe_account_id: 'acct_club',
      paid_destination_checked: true,
    });
    expect(values).not.toHaveProperty('club_stripe_account_id');
  });

  it('a stale processing row reconciled from Stripe records it too', async () => {
    const world = run({
      staleRows: [
        {
          id: 'row-9',
          show_id: 'show-1',
          amount_cents: 5000,
          shows: { name: 'Fall Trial', club_id: 'club-1' },
        },
      ],
      transfers: [found('acct_other')],
      amounts: [0],
    });
    await world.recoverStale();
    expect(completedWrite(world.payoutWrites())?.values).toMatchObject({
      paid_stripe_account_id: 'acct_other',
      paid_destination_checked: true,
    });
  });
});
