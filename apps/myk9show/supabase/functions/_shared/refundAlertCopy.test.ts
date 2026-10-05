// @vitest-environment node
// Codex round 10 on #2689: the approval queue is the only way a queued refund
// leaves the platform, so no operator alert in the refund modules may tell
// anyone to refund outside it. A DECLARED list of builders and scenarios is
// run and every alert it produces is checked; nothing here greps source.
// MYK9-964 removed the one declared exception: cart overflow is queued too.
import { describe, expect, it } from 'vitest';
import * as copyModule from './refundAlertCopy';
import type { AlertCopy } from './refundAlertCopy';
import {
  cartClassesNotInShowChargeAlert,
  instructsManualRefund,
  noCartChargeAlert,
  paidAmountMismatchChargeAlert,
  REFUND_ALERT_BUILDERS,
  staleCheckoutChargeAlert,
  unclaimableCartChargeAlert,
} from './refundAlertCopy';
import { approveRefundRequest } from './refundApproval';
import { harness } from './refundApprovalTestHarness';
import {
  claimAbandonedCartRefund,
  settlePaymentLinkObligation,
  type PaymentLinkObligation,
  type RefundQueueDeps,
} from './refundRequests';
import { settleApprovedRefund } from './refundSettlement';
import {
  queueUnfulfilledChargeRefund,
  type UnfulfilledChargeReason,
} from './unfulfilledChargeRefund';

const INPUT = { requestId: 'rr-1', actorAuthUserId: 'admin-uid' };

describe('instructsManualRefund (known answers)', () => {
  it.each([
    'Recovery: refund that amount from the Stripe dashboard, then record it on the order.',
    'Refund owed but could not be queued — refund by hand',
    'Recovery: find the payment in the Stripe dashboard and refund it manually.',
    'Recovery: refund the no-service portion from Stripe, including the platform fee.',
    'No entries or orders were created for it, so the dashboard refund is the complete fix.',
  ])('flags: %s', text => {
    expect(instructsManualRefund(text)).toBe(true);
  });

  it.each([
    'Do NOT refund it from the Stripe dashboard: a dashboard refund carries no request.',
    'The runbook\'s "Never refund from the Stripe dashboard" section covers this.',
    'Approve it under Refunds awaiting approval on /admin/health.',
    'Check the payment in Stripe, then use Resolve without refund.',
    'Check the refund in Stripe before approving again.',
  ])('allows: %s', text => {
    expect(instructsManualRefund(text)).toBe(false);
  });
});

describe('REFUND_ALERT_BUILDERS', () => {
  it('lists every alert builder the module exports', () => {
    const exported = Object.entries(copyModule)
      .filter(([name, value]) => typeof value === 'function' && name.endsWith('Alert'))
      .map(([name]) => name)
      .sort();
    expect(Object.keys(REFUND_ALERT_BUILDERS).sort()).toEqual(exported);
  });

  it('declares no manual-refund exception: cart overflow is queued (MYK9-964)', () => {
    expect(Object.keys(copyModule)).not.toContain('ALLOWED_MANUAL_REFUND_ALERTS');
    expect(Object.keys(copyModule)).not.toContain('cartOverflowManualRefundAlert');
  });

  it.each(Object.entries(REFUND_ALERT_BUILDERS))(
    '%s never instructs a manual refund and points into the queue',
    (_name, build) => {
      const { title, html } = build();
      expect(instructsManualRefund(`${title}. ${html}`)).toBe(false);
      expect(html).toMatch(/Refunds awaiting approval|queue_payment_link_refund/);
    }
  );
});

/** Every alert path in refundRequests, refundApproval, refundCreateRejection and refundSettlement. */
const definitive = (code: string) =>
  Object.assign(new Error(code), { type: 'StripeInvalidRequestError', statusCode: 400, code });

function queueDeps(rpc: RefundQueueDeps['rpc']) {
  const texts: string[] = [];
  const deps: RefundQueueDeps = {
    rpc,
    alertAdmin: async (title, html) => {
      texts.push(`${title} ${html}`);
    },
  };
  return { deps, texts };
}

const LINK_OBLIGATION: PaymentLinkObligation = {
  sessionId: 'cs_1',
  paymentIntentId: 'pi_1',
  linkId: 'link-1',
  closeLinkFrom: 'open',
  owed: {
    amountCents: 900,
    reason: 'partial_invalid_entries',
    detail: {},
    summaryHtml: 'Entries were withdrawn.',
  },
  showId: null,
  paidEntryIds: [],
};

const LINK_ROW = {
  link_status: 'paid',
  link_closed: true,
  refund_request_id: 'rr-1',
  created: true,
  request_status: 'pending',
  amount_cents: 900,
  reason: 'partial_invalid_entries',
  stripe_payment_intent_id: 'pi_1',
};

// MYK9-963: the webhook alerts that used to say "refund it in the Stripe
// dashboard": each is now the summary of a queued request, by reason.
const UNFULFILLED: [UnfulfilledChargeReason, AlertCopy][] = [
  ['no_cart', noCartChargeAlert({ sessionId: 'cs', cartId: 'c' })],
  [
    'cart_classes_not_in_show',
    cartClassesNotInShowChargeAlert({ sessionId: 'cs', cartId: 'c', missingClassIds: ['k'] }),
  ],
  [
    'paid_amount_mismatch',
    paidAmountMismatchChargeAlert({ sessionId: 'cs', chargedCents: 107, authoritativeCents: 100 }),
  ],
  [
    'cart_not_claimable',
    unclaimableCartChargeAlert({ sessionId: 'cs', cartId: 'c', cartStatus: 'submitted' }),
  ],
  ['stale_checkout', staleCheckoutChargeAlert({ sessionId: 'cs', cartId: 'c', staleReason: 'x' })],
];

function unfulfilledScenario(
  reason: UnfulfilledChargeReason,
  copy: AlertCopy,
  rpc: RefundQueueDeps['rpc'],
  paymentIntentId: string | null = 'pi'
): () => Promise<string[]> {
  return async () => {
    const { deps, texts } = queueDeps(rpc);
    await queueUnfulfilledChargeRefund(deps, {
      sessionId: 'cs',
      paymentIntentId,
      chargedCents: 107,
      reason,
      cartId: 'c',
      showId: null,
      detail: {},
      copy,
    }).catch(() => undefined);
    return texts;
  };
}

const QUEUED_ROW = {
  outcome: 'queued',
  refund_request_id: 'rr-963',
  request_status: 'pending',
  amount_cents: 107,
  reason: 'no_cart',
  stripe_payment_intent_id: 'pi',
};

const SCENARIOS: [string, () => Promise<string[]>][] = [
  ...UNFULFILLED.flatMap(([reason, copy]): [string, () => Promise<string[]>][] => [
    [
      `unfulfilled ${reason}: awaiting approval`,
      unfulfilledScenario(reason, copy, async () => ({ data: [QUEUED_ROW], error: null })),
    ],
    [
      `unfulfilled ${reason}: missing inputs`,
      unfulfilledScenario(reason, copy, async () => ({ data: null, error: null }), null),
    ],
    [
      `unfulfilled ${reason}: unconfirmed`,
      unfulfilledScenario(reason, copy, async () => ({ data: null, error: { message: 'x' } })),
    ],
  ]),
  [
    'payment link: awaiting approval',
    async () => {
      const { deps, texts } = queueDeps(async () => ({ data: [LINK_ROW], error: null }));
      await settlePaymentLinkObligation(deps, LINK_OBLIGATION);
      return texts;
    },
  ],
  [
    'payment link: missing inputs',
    async () => {
      const { deps, texts } = queueDeps(async () => ({ data: [LINK_ROW], error: null }));
      await settlePaymentLinkObligation(deps, { ...LINK_OBLIGATION, paymentIntentId: null });
      return texts;
    },
  ],
  [
    'payment link: unconfirmed',
    async () => {
      const { deps, texts } = queueDeps(async () => ({ data: null, error: { message: 'x' } }));
      await settlePaymentLinkObligation(deps, LINK_OBLIGATION).catch(() => undefined);
      return texts;
    },
  ],
  [
    'abandoned cart: claimed',
    async () => {
      const { deps, texts } = queueDeps(async () => ({
        data: [{ outcome: 'claimed', refund_request_id: 'rr-9' }],
        error: null,
      }));
      await claimAbandonedCartRefund(deps, {
        cartId: 'c',
        sessionId: 'cs',
        paymentIntentId: 'pi',
        chargedCents: 107,
      });
      return texts;
    },
  ],
  [
    'abandoned cart: missing inputs',
    async () => {
      const { deps, texts } = queueDeps(async () => ({ data: null, error: null }));
      await claimAbandonedCartRefund(deps, {
        cartId: 'c',
        sessionId: 'cs',
        paymentIntentId: null,
        chargedCents: null,
      });
      return texts;
    },
  ],
  [
    'approval: another attempt live',
    async () => {
      const h = harness();
      h.stripeRefunds.push({
        id: 're_stray',
        amount: 1,
        status: 'pending',
        metadata: { refund_request_id: 'rr-1', refund_attempt_no: '7' },
      });
      await approveRefundRequest(h.deps, INPUT);
      return h.alertTexts;
    },
  ],
  [
    'approval: ambiguous create error',
    async () => {
      const h = harness({ createThrows: true });
      await approveRefundRequest(h.deps, INPUT);
      return h.alertTexts;
    },
  ],
  [
    'approval: charge already refunded',
    async () => {
      const h = harness();
      h.setCreateError(definitive('charge_already_refunded'));
      await approveRefundRequest(h.deps, INPUT);
      return h.alertTexts;
    },
  ],
  [
    'approval: other definitive rejection',
    async () => {
      const h = harness();
      h.setCreateError(definitive('amount_too_large'));
      await approveRefundRequest(h.deps, INPUT);
      return h.alertTexts;
    },
  ],
  [
    'settlement: failure reopens the request',
    async () => {
      const h = harness({
        createStatus: 'pending',
        kind: 'entry_payment_link',
        reason: 'partial_invalid_entries',
      });
      await approveRefundRequest(h.deps, INPUT);
      await settleApprovedRefund(h.settleDeps, h.stripeSets('re_1', 'failed'));
      return h.alertTexts;
    },
  ],
  [
    'settlement: two live refunds',
    async () => {
      const h = harness({
        createStatus: 'pending',
        kind: 'entry_payment_link',
        reason: 'partial_invalid_entries',
      });
      await approveRefundRequest(h.deps, INPUT);
      await settleApprovedRefund(h.settleDeps, h.stripeSets('re_1', 'failed'));
      await approveRefundRequest(h.deps, INPUT);
      await settleApprovedRefund(h.settleDeps, h.stripeSets('re_1', 'succeeded'));
      return h.alertTexts;
    },
  ],
];

describe('every refund-module alert stays inside the queue', () => {
  it.each(SCENARIOS)('%s', async (_name, run) => {
    const texts = await run();
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) expect(instructsManualRefund(text)).toBe(false);
  });
});
