// @vitest-environment node
// Every outcome stripe-approve-refund can return, pinned to the copy an admin
// sees (Codex round 8 on #2689). "Nothing was refunded" is a promise about
// money: it may appear only where the server KNOWS no refund was created.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  approvalErrorMessage,
  DEFINITIVE_REJECTION_COPY,
  failedRowCopy,
  resolutionErrorMessage,
  UNCONFIRMED_REFUND_MESSAGE,
  UNCONFIRMED_RESOLUTION_MESSAGE,
} from './refundRequestsPresentation';

type Certainty = 'no_refund_created' | 'refund_exists' | 'unconfirmed' | 'neutral';

/** [server code, what the server knows, exact copy]. */
const APPROVAL_TABLE: [string, Certainty, string][] = [
  [
    'fulfilled',
    'no_refund_created',
    'Not refunded: this payment was fulfilled with entries after all. Check the entries before doing anything else.',
  ],
  [
    'resolved_without_refund',
    'no_refund_created',
    'Not refunded: this request was resolved without a refund, so it can no longer be approved.',
  ],
  ['not_found', 'neutral', 'This refund request no longer exists.'],
  [
    'claim_failed',
    'no_refund_created',
    'The approval could not start, so no refund was created. Try again.',
  ],
  [
    'refund_exists_for_other_attempt',
    'no_refund_created',
    'No new refund was created: Stripe still has a live refund for this request from an earlier approval. Check the payment in Stripe.',
  ],
  [
    'charge_already_refunded',
    'no_refund_created',
    'Not refunded by this approval: Stripe says this charge was already refunded. Check the payment in Stripe, then use Resolve without refund.',
  ],
  [
    'stripe_refund_rejected',
    'no_refund_created',
    'Stripe refused this refund, so nothing was refunded. You can approve it again or resolve it without a refund.',
  ],
  [
    'stripe_refund_failed',
    'no_refund_created',
    'Stripe reports this refund failed, so the customer was not paid. You can approve it again or resolve it without a refund.',
  ],
  [
    'stripe_refund_canceled',
    'no_refund_created',
    'Stripe reports this refund was canceled, so the customer was not paid. You can approve it again or resolve it without a refund.',
  ],
  [
    'refund_unrecorded',
    'refund_exists',
    'Stripe issued the refund, but it could not be recorded here. Check the payment in Stripe before approving again.',
  ],
  [
    'refund_attempt_conflict',
    'refund_exists',
    'The refund could not be matched to this approval. Check the payment in Stripe before trying again.',
  ],
  ['stripe_create_unconfirmed', 'unconfirmed', UNCONFIRMED_REFUND_MESSAGE],
  ['stripe_unreachable', 'unconfirmed', UNCONFIRMED_REFUND_MESSAGE],
  ['settle_busy', 'unconfirmed', UNCONFIRMED_REFUND_MESSAGE],
  ['record_failed', 'unconfirmed', UNCONFIRMED_REFUND_MESSAGE],
];

const NOTHING_REFUNDED = /nothing was refunded|not refunded|no (new )?refund was created|not paid/i;

describe('approvalErrorMessage: each server outcome and its copy', () => {
  it.each(APPROVAL_TABLE)('%s (%s)', (code, certainty, copy) => {
    const message = approvalErrorMessage(code);
    expect(message).toBe(copy);
    if (certainty === 'no_refund_created') expect(message).toMatch(NOTHING_REFUNDED);
    else expect(message).not.toMatch(NOTHING_REFUNDED);
    if (certainty === 'unconfirmed')
      expect(message).toMatch(/couldn't confirm.*may have gone through/);
  });

  it.each([
    ['no code (timeout, network, a crash before the body)', undefined],
    ['an unknown code', 'something_new'],
    ['an unknown stripe_refund_ status', 'stripe_refund_requires_action'],
  ])('%s is unconfirmed, never "nothing refunded"', (_label, code) => {
    expect(approvalErrorMessage(code)).toBe(UNCONFIRMED_REFUND_MESSAGE);
    expect(UNCONFIRMED_REFUND_MESSAGE).not.toMatch(NOTHING_REFUNDED);
    expect(UNCONFIRMED_REFUND_MESSAGE).toMatch(/Check status/);
  });

  it('the table covers every error code the approval server can return', () => {
    const shared = resolve(__dirname, '../../../supabase/functions/_shared');
    const source = ['refundApproval.ts', 'refundCreateRejection.ts']
      .map(f => readFileSync(resolve(shared, f), 'utf8'))
      .join('\n');
    const emitted = new Set([...source.matchAll(/error: '([a-z_]+)'/g)].map(m => m[1]));
    // toApprovalResult's `stripe_refund_${status}` for a settled failed/canceled attempt.
    expect(source).toContain('`stripe_refund_${result.status}`');
    emitted.add('stripe_refund_failed');
    emitted.add('stripe_refund_canceled');
    // Ternaries in refundCreateRejection.ts.
    expect(source).toContain("'charge_already_refunded' : 'stripe_refund_rejected'");
    emitted.add('charge_already_refunded');
    emitted.add('stripe_refund_rejected');
    expect(emitted.size).toBeGreaterThan(10);
    const pinned = new Set(APPROVAL_TABLE.map(([code]) => code));
    expect([...emitted].filter(code => !pinned.has(code))).toEqual([]);
  });
});

describe('resolutionErrorMessage: each server outcome and its copy', () => {
  it.each([
    ['note_required', 'Add a note saying how the charge was honored.'],
    [
      'has_live_attempt',
      'Not resolved: a refund for this request is still with Stripe or already went through. Check its status first.',
    ],
    ['not_resolvable', 'Not resolved: this request can no longer be resolved without a refund.'],
    ['not_found', 'This refund request no longer exists.'],
    ['resolve_failed', UNCONFIRMED_RESOLUTION_MESSAGE],
    [undefined, UNCONFIRMED_RESOLUTION_MESSAGE],
  ])('%s', (code, copy) => {
    expect(resolutionErrorMessage(code)).toBe(copy);
  });

  it('an unconfirmed resolution never claims nothing changed', () => {
    expect(UNCONFIRMED_RESOLUTION_MESSAGE).not.toMatch(/nothing changed/i);
    expect(UNCONFIRMED_RESOLUTION_MESSAGE).toMatch(/couldn't confirm/);
  });
});

/**
 * Failed rows (Codex round 9 on #2689). `lastFailure` is "<attempt status>:
 * <failure_reason>"; the reason is a definitive create-rejection code or
 * Stripe's own reason for a refund it reports failed or canceled.
 */
describe('failedRowCopy: each failure_reason and its copy', () => {
  const NOT_PAID = /customer was not paid/;

  it.each([
    [
      'failed: charge_already_refunded',
      'Stripe says this charge was already refunded. Check the payment in Stripe, then Resolve without refund.',
      'resolve',
    ],
    [
      'failed: amount_too_large',
      'Stripe refused the refund: the amount is more than is left to refund on this charge (amount_too_large). No refund was made by us. Check the payment in Stripe, then approve again or resolve without refund.',
      'approve_again',
    ],
    [
      'failed: charge_disputed',
      'Stripe refused the refund: this charge is disputed (charge_disputed). No refund was made by us. Settle the dispute in Stripe, then approve again or resolve without refund.',
      'approve_again',
    ],
    [
      'failed: refund_disputed_payment',
      'Stripe refused the refund: the payment is under dispute (refund_disputed_payment). No refund was made by us. Settle the dispute in Stripe, then approve again or resolve without refund.',
      'approve_again',
    ],
    [
      'failed: expired_or_canceled_card',
      'Stripe could not complete the refund (expired_or_canceled_card); the customer was not paid. Approve again or resolve without refund.',
      'approve_again',
    ],
    [
      'canceled: no reason given',
      'Stripe canceled the refund (no reason given); the customer was not paid. Approve again or resolve without refund.',
      'approve_again',
    ],
    [
      null,
      'Stripe could not complete the refund (no reason given); the customer was not paid. Approve again or resolve without refund.',
      'approve_again',
    ],
  ])('%s', (lastFailure, message, primaryAction) => {
    expect(failedRowCopy(lastFailure)).toEqual({ message, primaryAction });
  });

  it('a definitive rejection never says the customer was not paid; a Stripe-reported failure does', () => {
    for (const code of Object.keys(DEFINITIVE_REJECTION_COPY)) {
      expect(failedRowCopy(`failed: ${code}`).message).not.toMatch(NOT_PAID);
    }
    expect(failedRowCopy('failed: lost_or_stolen_card').message).toMatch(NOT_PAID);
  });

  it('every code fail_unissued_refund_attempt can write has its own failed-row copy', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../supabase/functions/_shared/refundCreateRejection.ts'),
      'utf8'
    );
    const block = source.slice(
      source.indexOf('export const PERMANENT_CREATE_CODES'),
      source.indexOf(']);', source.indexOf('export const PERMANENT_CREATE_CODES'))
    );
    const codes = [...block.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    expect(codes.length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(DEFINITIVE_REJECTION_COPY).sort()).toEqual([...codes].sort());
  });
});
