// @vitest-environment node
// MYK9-2036 at the webhook boundary. index.ts reads Deno.env at module scope and
// cannot be imported under vitest, so this drives the real request handler
// (webhookHandler.ts) and the real verifier (cartPriceSnapshot.ts) with the
// order index.ts runs them in: verify, then refuse through the unfulfilled-charge
// queue or claim the cart with the verified line amounts. The wiring of that
// order inside index.ts is pinned from its text below.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  cartLineSnapshotMetadata,
  cartSessionSnapshotMetadata,
  loadCartPriceSnapshotLineItems,
  SERVICE_FEE_LINE_METADATA,
  verifyPaidCartCharge,
  type CartLineItemPage,
  type CartSnapshotItem,
} from '../_shared/cartPriceSnapshot';
import { stampPlatformFeeRates } from '../_shared/platformFee';
import { createWebhookRequestHandler } from './webhookHandler';

const RATES = { percent: 5, flatCents: 0, minCents: 0 };
const SESSION_METADATA = {
  cart_id: 'cart-1',
  type: 'entry',
  ...stampPlatformFeeRates(RATES),
  ...cartSessionSnapshotMetadata(),
};

const ITEMS: CartSnapshotItem[] = [
  { id: 'ci-1', dog_id: 'd-1', class_id: 'c-1', entry_id: null, entry_fee_cents: 2500 },
  { id: 'ci-2', dog_id: 'd-2', class_id: 'c-2', entry_id: null, entry_fee_cents: 2500 },
];

const line = (amount: number, metadata: Record<string, string>) => ({
  amount_total: amount,
  quantity: 1,
  price: { product: { metadata } },
});

const PAGE: CartLineItemPage = {
  data: [
    line(2500, cartLineSnapshotMetadata(ITEMS[0])),
    line(2500, cartLineSnapshotMetadata(ITEMS[1])),
    line(250, { ...SERVICE_FEE_LINE_METADATA }),
  ],
  has_more: false,
};

function harness(cartItems: CartSnapshotItem[], listLineItems: () => Promise<CartLineItemPage>) {
  const claim = vi.fn(async (_lineAmounts: Record<string, number>) => undefined);
  const queue = vi.fn(async (_input: Record<string, unknown>) => undefined);
  const client = { listLineItems: vi.fn(listLineItems) };
  const handle = createWebhookRequestHandler<{ id: string }>({
    verifyEvent: async body => JSON.parse(body) as { id: string },
    platformSecret: 'whsec_test',
    alertAdmin: vi.fn(async () => undefined),
    dispatch: async () => {
      const verdict = await verifyPaidCartCharge(
        {
          loadLineItems: () => loadCartPriceSnapshotLineItems(client, 'cs_1'),
          repriceTotal: vi.fn(),
        },
        {
          sessionMetadata: SESSION_METADATA,
          items: cartItems,
          freshTotalCents: 5250,
          platformFeeRates: RATES,
        }
      );
      if (!verdict.ok) {
        await queue({ reason: 'paid_amount_mismatch', detail: verdict.detail });
        return;
      }
      await claim(verdict.lineAmounts);
    },
  });
  const deliver = () =>
    handle(
      new Request('https://example.test/stripe-webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig' },
        body: JSON.stringify({ id: 'evt_1' }),
      })
    );
  return { claim, queue, client, deliver };
}

describe('testing phase 3a: the Stripe line-item read fails (constraint 3)', () => {
  it('answers non-2xx with the cart unclaimed and no refund request; the redelivery fulfils', async () => {
    let calls = 0;
    const { claim, queue, client, deliver } = harness(ITEMS, async () => {
      calls += 1;
      if (calls === 1) throw new Error('Request timed out');
      return PAGE;
    });

    const first = await deliver();
    expect(first.status).toBe(500);
    expect(claim).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();

    const redelivery = await deliver();
    expect(redelivery.status).toBe(200);
    expect(client.listLineItems).toHaveBeenCalledTimes(2);
    expect(claim).toHaveBeenCalledWith({ 'ci-1': 2500, 'ci-2': 2500 });
    expect(queue).not.toHaveBeenCalled();
  });
});

describe('testing phase 2 at the boundary: fees and subtotal raised to $40 together', () => {
  it('queues the charge as unfulfilled and fulfils nothing', async () => {
    const tampered = ITEMS.map(item => ({ ...item, entry_fee_cents: 4000 }));
    const { claim, queue, deliver } = harness(tampered, async () => PAGE);
    expect((await deliver()).status).toBe(200);
    expect(claim).not.toHaveBeenCalled();
    expect(queue).toHaveBeenCalledWith({
      reason: 'paid_amount_mismatch',
      detail: {
        price_snapshot_mismatch: 'cart line ci-1 is stored at 4000 cents but was sold at 2500',
        snapshot_cents: 5250,
      },
    });
  });
});

describe('index.ts and stripe-checkout wiring (source-pinned)', () => {
  const webhook = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');
  const start = webhook.indexOf('async function handleEntryPaymentCompleted(');
  const body = webhook.slice(start, webhook.indexOf('\nasync function ', start + 1));
  const checkout = readFileSync(resolve(__dirname, '../stripe-checkout/index.ts'), 'utf8');
  const snapshotModule = readFileSync(
    resolve(__dirname, '../_shared/cartPriceSnapshot.ts'),
    'utf8'
  );

  it('verifies before the claim and claims with the verified line amounts', () => {
    const verifyAt = body.indexOf('await verifyPaidCartCharge(');
    expect(verifyAt).toBeGreaterThan(0);
    expect(body).toContain(
      'loadLineItems: () => loadCartPriceSnapshotLineItems(stripe.checkout.sessions, session.id)'
    );
    expect(body).toContain('sessionMetadata: freshSession.metadata,');
    expect(verifyAt).toBeLessThan(body.indexOf("reason: 'paid_amount_mismatch'"));
    expect(verifyAt).toBeLessThan(body.indexOf('beginCartFulfillment('));
    expect(body).toContain('lineAmounts: verdict.lineAmounts,');
  });

  it('stripe-checkout tags every line, the service fee and the session', () => {
    expect(checkout).toContain('metadata: cartLineSnapshotMetadata(item),');
    expect(checkout).toContain('metadata: { ...SERVICE_FEE_LINE_METADATA },');
    expect(checkout).toContain('...cartSessionSnapshotMetadata(),');
  });

  it('the verifier never refunds: a refusal only reaches the approval queue', () => {
    expect(snapshotModule).not.toMatch(/refunds\s*\.\s*create/);
    expect(snapshotModule).not.toMatch(/try\s*\{/);
  });
});
