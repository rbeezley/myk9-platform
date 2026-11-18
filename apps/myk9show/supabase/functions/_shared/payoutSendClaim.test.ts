import { describe, expect, it, vi } from 'vitest';
import { claimShowPayoutForSend, exceedsApproval, type PayoutClaimClient } from './payoutSendClaim';

const REQUEST = {
  showId: 'show-1',
  accountId: 'csa-1',
  destination: 'acct_1',
  amountCents: 12345,
};

function clientReturning(data: unknown, error: { message?: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { client: { rpc } as PayoutClaimClient, rpc };
}

describe('claimShowPayoutForSend (MYK9-2170 payout brake)', () => {
  it('asks the database to claim with the show, account, destination and amount', async () => {
    const { client, rpc } = clientReturning({ outcome: 'claimed', payout_id: 'row-1' });
    await claimShowPayoutForSend(client, REQUEST);
    expect(rpc).toHaveBeenCalledWith('claim_show_payout_for_send', {
      p_show_id: 'show-1',
      p_account_id: 'csa-1',
      p_destination: 'acct_1',
      p_amount_cents: 12345,
    });
  });

  it('brake off: a claimed row comes back with no approval cap', async () => {
    const { client } = clientReturning({ outcome: 'claimed', payout_id: 'row-1' });
    expect(await claimShowPayoutForSend(client, REQUEST)).toEqual({
      outcome: 'claimed',
      payoutId: 'row-1',
      approvedAmountCents: null,
    });
  });

  it('approved: a claimed row carries the approved amount as its cap', async () => {
    const { client } = clientReturning({
      outcome: 'claimed',
      payout_id: 'row-1',
      approved_amount_cents: 12345,
    });
    expect(await claimShowPayoutForSend(client, REQUEST)).toEqual({
      outcome: 'claimed',
      payoutId: 'row-1',
      approvedAmountCents: 12345,
    });
  });

  it.each(['awaiting_approval', 'approval_reset', 'held', 'busy', 'account_mismatch'])(
    'brake on / hold: %s is passed through as not claimed',
    async outcome => {
      const { client } = clientReturning({ outcome, payout_id: 'row-1' });
      const claim = await claimShowPayoutForSend(client, REQUEST);
      expect(claim?.outcome).toBe(outcome);
      expect(claim?.outcome).not.toBe('claimed');
    }
  );

  it.each([
    { label: 'an RPC error', data: null, error: { message: 'function does not exist' } },
    { label: 'no data', data: null, error: null },
    { label: 'an unknown outcome', data: { outcome: 'sent', payout_id: 'row-1' }, error: null },
    { label: 'a claim with no row id', data: { outcome: 'claimed' }, error: null },
    { label: 'a non-object answer', data: 'claimed', error: null },
  ])('fails closed on $label', async ({ data, error }) => {
    const { client } = clientReturning(data, error);
    expect(await claimShowPayoutForSend(client, REQUEST)).toBeNull();
  });
});

describe('exceedsApproval', () => {
  it('never lets an approved send rise above the approved amount', () => {
    const approved = { outcome: 'claimed' as const, payoutId: 'r', approvedAmountCents: 1000 };
    expect(exceedsApproval(approved, 1001)).toBe(true);
    expect(exceedsApproval(approved, 1000)).toBe(false);
    expect(exceedsApproval(approved, 900)).toBe(false);
  });

  it('has nothing to compare when the brake was off', () => {
    const unapproved = { outcome: 'claimed' as const, payoutId: 'r', approvedAmountCents: null };
    expect(exceedsApproval(unapproved, 999999)).toBe(false);
  });
});
