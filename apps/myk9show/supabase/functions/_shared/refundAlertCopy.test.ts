// @vitest-environment node
// Codex round 10 on #2689: the approval queue is the only way a queued refund
// leaves the platform, so no operator alert in the refund modules may tell
// anyone to refund outside it. A DECLARED list of builders and scenarios is
// run and every alert it produces is checked; nothing here greps source.
import { describe, expect, it } from 'vitest';
import * as copyModule from './refundAlertCopy';
import { instructsManualRefund, REFUND_ALERT_BUILDERS } from './refundAlertCopy';
import { approveRefundRequest } from './refundApproval';
import { harness } from './refundApprovalTestHarness';
import { claimAbandonedCartRefund, queueRefundForApproval, type QueueDeps } from './refundRequests';
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
  it('lists every alert builder the module exports', () => {
    const exported = Object.entries(copyModule)
      .filter(([name, value]) => typeof value === 'function' && name.endsWith('Alert'))
      .map(([name]) => name)
      .sort();
    expect(Object.keys(REFUND_ALERT_BUILDERS).sort()).toEqual(exported);
  });

  it.each(Object.entries(REFUND_ALERT_BUILDERS))(
    '%s never instructs a manual refund and points into the queue',
    (_name, build) => {
      const { title, html } = build();
      expect(instructsManualRefund(`${title}. ${html}`)).toBe(false);
      expect(html).toMatch(/Refunds awaiting approval|request_refund_approval/);
    }
  );
});

/** Every alert path in refundRequests, refundApproval, refundCreateRejection and refundSettlement. */
const definitive = (code: string) =>
  Object.assign(new Error(code), { type: 'StripeInvalidRequestError', statusCode: 400, code });

function queueDeps(
  rpc: QueueDeps['rpc'],
  find: QueueDeps['findRefundRequest'] = async () => ({ data: null, error: null })
) {
  const texts: string[] = [];
  const deps: QueueDeps = {
    rpc,
    findRefundRequest: find,
    alertAdmin: async (title, html) => {
      texts.push(`${title} ${html}`);
    },
  };
  return { deps, texts };
}

const QUEUE_INPUT = {
  kind: 'cart_overflow' as const,
  sessionId: 'cs_1',
  paymentIntentId: 'pi_1',
  amountCents: 2500,
  reason: 'partial_no_service_lines',
  summaryHtml: 'Lines were denied.',
};

const SCENARIOS: [string, () => Promise<string[]>][] = [
  [
    'queue: awaiting approval',
    async () => {
      const { deps, texts } = queueDeps(async () => ({
        data: [{ refund_request_id: 'rr-1', created: true }],
        error: null,
      }));
      await queueRefundForApproval(deps, QUEUE_INPUT);
      return texts;
    },
  ],
  [
    'queue: missing inputs',
    async () => {
      const { deps, texts } = queueDeps(async () => ({ data: null, error: null }));
      await queueRefundForApproval(deps, { ...QUEUE_INPUT, paymentIntentId: null });
      return texts;
    },
  ],
  [
    'queue: unconfirmed',
    async () => {
      const { deps, texts } = queueDeps(async () => ({ data: null, error: { message: 'x' } }));
      await queueRefundForApproval(deps, QUEUE_INPUT).catch(() => undefined);
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
      const h = harness({ createStatus: 'pending', kind: 'cart_overflow' });
      await approveRefundRequest(h.deps, INPUT);
      await settleApprovedRefund(h.settleDeps, h.stripeSets('re_1', 'failed'));
      return h.alertTexts;
    },
  ],
  [
    'settlement: two live refunds',
    async () => {
      const h = harness({ createStatus: 'pending', kind: 'cart_overflow' });
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
