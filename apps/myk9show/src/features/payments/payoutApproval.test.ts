import type {
  LedgerPayout,
  LedgerPayoutDetail,
  LedgerRow,
  PayoutApprovalState,
  PayoutStatus,
} from './payoutLedger';
import {
  canApprovePayout,
  describePayoutActionError,
  formatApprovalTally,
  holdReasonProblem,
  payoutsInApprovalQueue,
  tallyApprovals,
} from './payoutApproval';

function payout(overrides: Partial<LedgerPayoutDetail> = {}): LedgerPayoutDetail {
  return {
    id: 'payout-1',
    amountCents: 10000,
    approvedAt: null,
    approvedAmountCents: null,
    approvedStripeAccountId: null,
    holdReason: null,
    approvalResetReason: null,
    destination: { stripeAccountId: 'acct_1', payoutsEnabled: true },
    ...overrides,
  };
}

function row(
  status: PayoutStatus | null,
  detail: LedgerPayoutDetail | null,
  stripeTransferId: string | null = null
): LedgerRow {
  return {
    showId: `show-${Math.random()}`,
    showName: 'Spring Trial',
    clubId: 'c1',
    clubName: 'Club One',
    showUnavailable: false,
    onlineCollectedCents: 10000,
    refundedCents: 0,
    uncollectedRefundCents: 0,
    uncollectedRefundCount: 0,
    unresolvedRefundDecisionCount: 0,
    netOwedCents: 10000,
    netOwedSource: 'transfer',
    computedNetCents: 10000,
    settleDate: '2026-11-20',
    payoutStatus: status,
    stripeTransferId,
    payout: detail,
  };
}

const approvedDetail = (amount: number, approved: number) =>
  payout({
    amountCents: amount,
    approvedAt: '2026-11-18T10:00:00Z',
    approvedAmountCents: approved,
    approvedStripeAccountId: 'acct_1',
  });

describe('approval queue', () => {
  it('offers Approve for waiting and held payouts only', () => {
    expect(canApprovePayout(row('awaiting_approval', payout()))).toBe(true);
    expect(canApprovePayout(row('held', payout({ holdReason: 'Wait' })))).toBe(true);
    expect(canApprovePayout(row('approved', approvedDetail(10000, 10000)))).toBe(false);
    expect(canApprovePayout(row('pending', payout()))).toBe(false);
    expect(canApprovePayout(row('awaiting_approval', null))).toBe(false);
  });

  it('lists waiting, held and approved-but-unsent payouts', () => {
    const rows = [
      row('awaiting_approval', payout()),
      row('held', payout()),
      row('approved', approvedDetail(10000, 10000)),
      row('completed', approvedDetail(10000, 10000), 'tr_1'),
      row('processing', payout()),
      row('approved', null),
      row(null, null),
    ];
    expect(payoutsInApprovalQueue(rows).map(r => r.payoutStatus)).toEqual([
      'awaiting_approval',
      'held',
      'approved',
    ]);
  });
});

describe('tallyApprovals', () => {
  function attempt(
    status: PayoutStatus,
    amount: number,
    approval: Partial<PayoutApprovalState> | null,
    transferId: string | null = null
  ): LedgerPayout {
    return {
      id: `p-${Math.random()}`,
      show_id: 's',
      amount_cents: amount,
      status,
      stripe_transfer_id: transferId,
      completed_at: null,
      created_at: null,
      approval: approval
        ? {
            approvedAt: '2026-11-18T10:00:00Z',
            approvedAmountCents: 10000,
            approvedStripeAccountId: 'acct_1',
            holdReason: null,
            approvalResetReason: null,
            destination: { stripeAccountId: 'acct_1', payoutsEnabled: true },
            ...approval,
          }
        : undefined,
    };
  }

  it('matches only a completed transfer for the approved amount to the approved account', () => {
    const tally = tallyApprovals([
      attempt('completed', 10000, {}, 'tr_1'),
      attempt('completed', 9000, {}, 'tr_2'),
      attempt('approved', 10000, {}),
      attempt('completed', 10000, null, 'tr_3'),
      attempt('awaiting_approval', 10000, null),
    ]);
    // Approved: the three carrying an approval. Matched: only the one Stripe sent
    // for the approved amount; a lower send and an unsent approval are not.
    expect(tally).toEqual({ approved: 3, matchedStripe: 1 });
  });

  it('does not count a transfer to another account, or an unknown one, as matched', () => {
    expect(
      tallyApprovals([
        attempt(
          'completed',
          10000,
          { destination: { stripeAccountId: 'acct_other', payoutsEnabled: true } },
          'tr_1'
        ),
        attempt('completed', 10000, { destination: null }, 'tr_2'),
      ])
    ).toEqual({ approved: 2, matchedStripe: 0 });
  });

  it('keeps counting a failed approved send after its replacement is created', () => {
    expect(
      tallyApprovals([attempt('failed', 10000, {}), attempt('awaiting_approval', 10000, null)])
    ).toEqual({ approved: 1, matchedStripe: 0 });
  });

  it('does not count a row with an approval time but no approved amount', () => {
    expect(
      tallyApprovals([attempt('completed', 10000, { approvedAmountCents: null }, 'tr_1')])
    ).toEqual({ approved: 0, matchedStripe: 0 });
  });

  it('does not count a completed row with no transfer id as matched', () => {
    expect(tallyApprovals([attempt('completed', 10000, {}, null)])).toEqual({
      approved: 1,
      matchedStripe: 0,
    });
  });

  it('reads as one sentence', () => {
    expect(formatApprovalTally({ approved: 14, matchedStripe: 14 })).toBe(
      '14 payouts approved, 14 matched Stripe'
    );
    expect(formatApprovalTally({ approved: 1, matchedStripe: 0 })).toBe(
      '1 payout approved, 0 matched Stripe'
    );
  });
});

describe('holdReasonProblem', () => {
  it('needs a reason of 1 to 500 characters after trimming', () => {
    expect(holdReasonProblem('   ')).toBe('Say why the payout is held');
    expect(holdReasonProblem('x'.repeat(501))).toBe('Keep the reason under 500 characters');
    expect(holdReasonProblem(` ${'x'.repeat(500)} `)).toBeNull();
  });
});

describe('describePayoutActionError', () => {
  it('asks for the password again when the step-up was not confirmed', () => {
    expect(describePayoutActionError('approve', { code: 'MKAUT', message: 'x' })).toBe(
      'Nothing was approved. Confirm your password to continue.'
    );
  });

  it('rewords the "review it again" refusals without raw cents or account ids', () => {
    expect(
      describePayoutActionError('approve', {
        code: '22023',
        message: 'The amount is now 13000 cents; review it again',
      })
    ).toBe(
      'Nothing was approved. The amount changed since you looked. The new amount is shown; review it again.'
    );
    expect(
      describePayoutActionError('approve', {
        code: '22023',
        message: "The club's bank account changed since you looked; review it again",
      })
    ).toBe(
      "Nothing was approved. The club's bank account changed since you looked. Review it again."
    );
    expect(
      describePayoutActionError('approve', {
        code: '22023',
        message: 'This payout is already approved for 9000 cents to acct_9',
      })
    ).not.toMatch(/acct_|cents/);
  });

  it('passes the plain server sentences through', () => {
    expect(
      describePayoutActionError('hold', {
        code: '22023',
        message: 'This payout is processing, so it cannot be held',
      })
    ).toBe('The payout was not held. This payout is processing, so it cannot be held.');
    expect(
      describePayoutActionError('approve', {
        code: '22023',
        message: 'This payout has no bank account to send to yet',
      })
    ).toBe('Nothing was approved. This payout has no bank account to send to yet.');
  });

  it('names the permission and not-found refusals, and falls back to a plain retry', () => {
    expect(describePayoutActionError('brake-off', { code: '42501', message: '' })).toBe(
      'The brake was not changed. Only a site admin can do this.'
    );
    expect(describePayoutActionError('hold', { code: 'P0002', message: 'Payout not found' })).toBe(
      'The payout was not held. This payout no longer exists.'
    );
    expect(describePayoutActionError('brake-off', new Error('fetch failed'))).toBe(
      'The brake was not changed. Something went wrong. Try again.'
    );
  });
});
