// MYK9-2170: the payout run's per-show flow with the Stripe transfer calls
// observed, through the recording fake in payoutTestWorld.ts.
import { describe, expect, it } from 'vitest';
import { payoutRetryNote } from './processShow';
import { run } from './payoutTestWorld';

describe('processShow: an authorized send', () => {
  it('brake off: transfers exactly the recalculated amount to the club, once', async () => {
    const world = run({
      amounts: [12345],
      brakeOn: false,
      claim: { data: { outcome: 'claimed', payout_id: 'row-1' }, error: null },
    });
    await world.go();
    expect(world.create).toHaveBeenCalledTimes(1);
    expect(world.create).toHaveBeenCalledWith(
      {
        amount: 12345,
        currency: 'usd',
        destination: 'acct_club',
        transfer_group: 'show-1',
        metadata: { show_id: 'show-1', show_name: 'Fall Trial' },
      },
      { idempotencyKey: 'show-payout-row-row-1' }
    );
    expect(world.rpc).toHaveBeenCalledWith('claim_show_payout_for_send', {
      p_show_id: 'show-1',
      p_account_id: 'csa-1',
      p_destination: 'acct_club',
      p_amount_cents: 12345,
    });
  });

  it('approved: sends within the approval, after a refund lowered it', async () => {
    const world = run({
      liveRow: { id: 'row-1', status: 'approved' },
      amounts: [10000, 9000],
      claim: {
        data: { outcome: 'claimed', payout_id: 'row-1', approved_amount_cents: 10000 },
        error: null,
      },
    });
    await world.go();
    expect(world.create).toHaveBeenCalledTimes(1);
    expect(world.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 9000, destination: 'acct_club' }),
      { idempotencyKey: 'show-payout-row-row-1' }
    );
  });
});

describe('processShow: nothing sends without approval', () => {
  it.each(['awaiting_approval', 'approval_reset', 'held', 'busy', 'account_mismatch'])(
    'claim outcome %s makes no transfer',
    async outcome => {
      const world = run({
        amounts: [5000],
        claim: { data: { outcome, payout_id: 'row-1' }, error: null },
      });
      await world.go();
      expect(world.create).not.toHaveBeenCalled();
    }
  );

  it('a held row reaches the claim each run, so its amount follows refunds', async () => {
    const world = run({
      liveRow: { id: 'row-1', status: 'held' },
      amounts: [4000],
      claim: { data: { outcome: 'held', payout_id: 'row-1' }, error: null },
    });
    await world.go();
    expect(world.rpc).toHaveBeenCalledWith(
      'claim_show_payout_for_send',
      expect.objectContaining({ p_amount_cents: 4000 })
    );
    expect(world.create).not.toHaveBeenCalled();
  });

  it('a held row fully refunded is closed out, not sent', async () => {
    const world = run({ liveRow: { id: 'row-1', status: 'held' }, amounts: [0] });
    await world.go();
    expect(world.rpc).not.toHaveBeenCalled();
    expect(world.create).not.toHaveBeenCalled();
    const closeOut = world.writes.find(w => w.table === 'show_payouts' && w.op === 'update');
    expect(closeOut?.values).toMatchObject({ amount_cents: 0, status: 'completed' });
    expect(closeOut?.filters).toContainEqual([
      'in',
      'status',
      ['pending', 'awaiting_approval', 'approved', 'held'],
    ]);
  });

  it.each([
    { label: 'an RPC error', claim: { data: null, error: { message: 'function does not exist' } } },
    { label: 'an unreadable answer', claim: { data: { outcome: 'sent' }, error: null } },
  ])('a failed claim ($label) sends nothing and is counted and alerted', async ({ claim }) => {
    const world = run({ amounts: [5000], claim });
    await world.go();
    expect(world.create).not.toHaveBeenCalled();
    expect(world.summary.claim_errors).toBe(1);
    expect(world.alertAdmin).toHaveBeenCalledWith(
      'Payout could not be checked: Fall Trial',
      expect.stringContaining('Nothing was sent'),
      { dedupeKey: 'payout-claim-error-show-1' }
    );
  });

  it('escapes a club-written show name in the operator alert body', async () => {
    const world = run({
      amounts: [5000],
      claim: { data: null, error: { message: 'boom' } },
      showName: '<a href="https://evil.test">Pay here</a>',
    });
    await world.go();
    const body = world.alertAdmin.mock.calls[0]?.[1] as string;
    expect(body).toContain('&lt;a href=');
    expect(body).not.toContain('<a href=');
  });

  it('an amount above the approval after the claim goes back for approval, not to Stripe', async () => {
    const world = run({
      liveRow: { id: 'row-1', status: 'approved' },
      amounts: [10000, 12000],
      claim: {
        data: { outcome: 'claimed', payout_id: 'row-1', approved_amount_cents: 10000 },
        error: null,
      },
    });
    await world.go();
    expect(world.create).not.toHaveBeenCalled();
    const reset = world.writes.find(
      w => w.op === 'update' && w.values?.status === 'awaiting_approval'
    );
    expect(reset?.values).toMatchObject({
      amount_cents: 12000,
      approved_at: null,
      approved_amount_cents: null,
      approved_stripe_account_id: null,
    });
    expect(world.summary.awaiting_approval).toBe(1);
  });
});

describe('failure notices tell the truth in both brake modes', () => {
  it('brake on: a balance delay says it waits for approval again', async () => {
    const world = run({
      amounts: [5000],
      brakeOn: true,
      claim: {
        data: { outcome: 'claimed', payout_id: 'row-1', approved_amount_cents: 5000 },
        error: null,
      },
      transferError: new Error('Insufficient funds: balance_insufficient'),
    });
    await world.go();
    const html = world.alertAdmin.mock.calls[0]?.[1] as string;
    expect(html).toContain('waits for approval again');
    expect(html).not.toContain('retries automatically');
  });

  it('brake off keeps the automatic-retry wording', () => {
    expect(payoutRetryNote('balance_delay', false)).toContain('retries automatically');
    expect(payoutRetryNote('transfer_failed', false)).toContain('will retry tomorrow');
    expect(payoutRetryNote('stale_processing', false)).toContain('No action needed');
  });

  it.each(['balance_delay', 'transfer_failed', 'stale_processing'] as const)(
    '%s: brake on promises no automatic send, and no copy uses an em dash',
    kind => {
      expect(payoutRetryNote(kind, true)).toContain('waits for approval again');
      expect(payoutRetryNote(kind, true)).not.toContain('retries automatically');
      expect(payoutRetryNote(kind, true)).not.toContain('—');
      expect(payoutRetryNote(kind, false)).not.toContain('—');
    }
  );
});
