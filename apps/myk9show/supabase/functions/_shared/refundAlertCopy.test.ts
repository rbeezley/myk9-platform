// @vitest-environment node
// Codex round 10 on #2689: the approval queue is the only way a queued refund
// leaves the platform, so no operator alert in the refund modules may tell
// anyone to refund outside it. A DECLARED list of builders and scenarios is
// run and every alert it produces is checked; nothing here greps source. The
// declared exceptions (ALLOWED_MANUAL_REFUND_ALERTS, round 13) are cart
// overflow, which is never queued, and must say so.
import { describe, expect, it } from 'vitest';
import * as copyModule from './refundAlertCopy';
import {
  ALLOWED_MANUAL_REFUND_ALERTS,
  instructsManualRefund,
  REFUND_ALERT_BUILDERS,
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
    'Approve it under Refunds awaiting approval on /admin/health.',
    'Check the payment in Stripe, then use Resolve without refund.',
    'Check the refund in Stripe before approving again.',
  ])('allows: %s', text => {
    expect(instructsManualRefund(text)).toBe(false);
  });
});

describe('REFUND_ALERT_BUILDERS', () => {
  it('lists every alert builder the module exports, in exactly one of the two lists', () => {
    const exported = Object.entries(copyModule)
      .filter(([name, value]) => typeof value === 'function' && name.endsWith('Alert'))
      .map(([name]) => name)
      .sort();
    const listed = [
      ...Object.keys(REFUND_ALERT_BUILDERS),
      ...Object.keys(ALLOWED_MANUAL_REFUND_ALERTS),
    ].sort();
    expect(listed).toEqual(exported);
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

describe('ALLOWED_MANUAL_REFUND_ALERTS (cart overflow, never queued; Codex round 13)', () => {
  it.each(Object.entries(ALLOWED_MANUAL_REFUND_ALERTS))(
    '%s: refund by hand, the app will not, and why (MYK9-964)',
    (_name, { reason, build }) => {
      const { title, html } = build();
      expect(reason.length).toBeGreaterThan(20);
      expect(instructsManualRefund(`${title}. ${html}`)).toBe(true);
      expect(html).toMatch(/The app will NOT refund this/);
      expect(html).toMatch(/MYK9-964/);
      expect(html).toMatch(/No refund request exists or can be created for it/);
    }
  );

  it('the cart-overflow alert names the session, the amount and the lines', () => {
    const { html } = ALLOWED_MANUAL_REFUND_ALERTS.cartOverflowManualRefundAlert.build();
    expect(html).toContain('<code>cs_1</code>');
    expect(html).toContain('25.00 USD');
    expect(html).toMatch(/waitlisted <code>ci-1<\/code>, denied\s+<code>ci-2<\/code>/);
  });

  it('says how it will be booked, and asks for NO ledger edit (owner decision, round 14)', () => {
    for (const [, { build }] of Object.entries(ALLOWED_MANUAL_REFUND_ALERTS)) {
      const { html } = build();
      expect(html).not.toMatch(/make_whole|make-whole/i);
    }
    const text = ALLOWED_MANUAL_REFUND_ALERTS.cartOverflowManualRefundAlert
      .build()
      .html.replace(/\s+/g, ' ');
    expect(text).toContain('refund exactly that amount from the Stripe dashboard');
    expect(text).toContain('The app will NOT refund this');
    expect(text).toContain(
      'The reconciliation report will show it as a post-hoc refund until MYK9-964'
    );
    expect(text).toContain(
      "The club's payout is unaffected: payouts are computed from accepted entries"
    );
  });
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

const SCENARIOS: [string, () => Promise<string[]>][] = [
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
        amountCents: 100,
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
        amountCents: null,
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
