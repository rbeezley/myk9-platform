import { describe, expect, it, vi } from 'vitest';
import { priceCartItems, type PricingShow } from './cartItemPricing';
import {
  CART_LINE_ITEMS_READ_LIMIT,
  cartLineSnapshotMetadata,
  cartSessionSnapshotMetadata,
  isVersionedCartSession,
  loadCartPriceSnapshotLineItems,
  readCartPriceSnapshotLineItems,
  SERVICE_FEE_LINE_METADATA,
  verifyCartAgainstSnapshot,
  verifyPaidCartCharge,
  type CartLineItemPage,
  type CartSnapshotItem,
} from './cartPriceSnapshot';
import { calculatePlatformFeeCents, stampPlatformFeeRates } from './platformFee';

// MYK9-2036: a paid cart session is verified against the prices Stripe recorded
// when the session was opened (its own line items), never against the fee rule
// in force when the webhook runs. Driven with injected line items, shaped like
// listLineItems(session, { expand: ['data.price.product'] }) returns them.

const RATES = { percent: 5, flatCents: 0, minCents: 0 };
const NOW = '2026-11-20T15:00:00.000Z';

const RULE_A: PricingShow = {
  pre_entry_fee: 25,
  day_of_show_fee: null,
  start_date: '2026-12-12',
  junior_handler_fee: null,
  organization: 'AKC',
  timezone: 'America/Chicago',
};

const ITEMS: CartSnapshotItem[] = [
  {
    id: 'ci-1',
    dog_id: 'dog-1',
    class_id: 'class-1',
    entry_id: null,
    junior_fee_declared: false,
    entry_fee_cents: 2500,
  },
  {
    id: 'ci-2',
    dog_id: 'dog-2',
    class_id: 'class-2',
    entry_id: null,
    junior_fee_declared: null,
    entry_fee_cents: 2500,
  },
];

function lineItem(amount: number, metadata: Record<string, string>, quantity = 1) {
  return {
    amount_total: amount,
    quantity,
    price: { metadata: {}, product: { metadata } },
  };
}

/** What Stripe hands back for a session stripe-checkout opened over these lines. */
function sessionLineItems(
  items: readonly CartSnapshotItem[],
  pricesById: ReadonlyMap<string, number>
): CartLineItemPage {
  const data = items.map(item =>
    lineItem(pricesById.get(item.id) ?? 0, cartLineSnapshotMetadata(item))
  );
  const subtotal = items.reduce((sum, item) => sum + (pricesById.get(item.id) ?? 0), 0);
  const fee = calculatePlatformFeeCents(subtotal, RATES);
  if (fee > 0) data.push(lineItem(fee, { ...SERVICE_FEE_LINE_METADATA }));
  return { data, has_more: false };
}

function pricedUnder(show: PricingShow, classFee: number | null) {
  return priceCartItems(
    show,
    ITEMS.map(item => ({ ...item, class_entry_fee: classFee })),
    new Map(),
    NOW
  );
}

const PRICES_A = pricedUnder(RULE_A, null);
const PAGE_A = sessionLineItems(ITEMS, PRICES_A);
const TOTAL_A = 5000 + calculatePlatformFeeCents(5000, RATES);

function verify(overrides: Partial<Parameters<typeof verifyCartAgainstSnapshot>[0]> = {}) {
  return verifyCartAgainstSnapshot({
    items: ITEMS,
    page: PAGE_A,
    freshTotalCents: TOTAL_A,
    platformFeeRates: RATES,
    ...overrides,
  });
}

function refusal(verdict: ReturnType<typeof verifyCartAgainstSnapshot>): string {
  if (verdict.ok) throw new Error('expected a refusal');
  return verdict.snapshotMismatch ?? '';
}

describe('testing phase 1: priced under rule A, paid after a change to rule B', () => {
  it('is fulfilled at the price the exhibitor paid', () => {
    expect(PRICES_A.get('ci-1')).toBe(2500);
    // Rule B: the class now carries its own $30 fee. Re-pricing would refuse.
    const pricesB = pricedUnder(RULE_A, 30);
    expect(pricesB.get('ci-1')).toBe(3000);
    const repricedTotal = 6000 + calculatePlatformFeeCents(6000, RATES);
    expect(repricedTotal).not.toBe(TOTAL_A);

    expect(verify()).toEqual({ ok: true, lineAmounts: { 'ci-1': 2500, 'ci-2': 2500 } });
  });
});

describe('testing phase 2: owner edits fees and subtotal in lockstep to $40', () => {
  it('is refused: each stored line fee is compared with its snapshot line (constraint 4)', () => {
    const tampered = ITEMS.map(item => ({ ...item, entry_fee_cents: 4000 }));
    const verdict = verify({ items: tampered });
    expect(verdict.ok).toBe(false);
    expect(refusal(verdict)).toContain('ci-1 is stored at 4000');
  });

  it('is refused when only one line was raised', () => {
    const tampered = [{ ...ITEMS[0], entry_fee_cents: 4000 }, ITEMS[1]];
    expect(refusal(verify({ items: tampered }))).toContain('ci-1 is stored at 4000');
  });
});

describe('testing phase 3: a successful read with a cart line that has no line item', () => {
  it('is refused, never fulfilled', () => {
    const page = { data: PAGE_A.data.slice(1), has_more: false };
    expect(refusal(verify({ page }))).toContain('ci-1 has no line item');
  });

  it('refuses a line item that names no cart line on the cart', () => {
    const extra = { ...ITEMS[0], id: 'ci-9' };
    const page = sessionLineItems([...ITEMS, extra], new Map([...PRICES_A, ['ci-9', 2500]]));
    expect(refusal(verify({ page, freshTotalCents: 7500 + 375 }))).toContain(
      'ci-9 is not on the cart'
    );
  });

  it('refuses a read Stripe says has more pages (the cap is one page of 100)', () => {
    expect(CART_LINE_ITEMS_READ_LIMIT).toBe(100);
    expect(refusal(verify({ page: { ...PAGE_A, has_more: true } }))).toContain('more than 100');
  });
});

describe('testing phase 4: captured amount or service fee disagrees', () => {
  it('refuses a captured amount that is not the line-item sum', () => {
    expect(refusal(verify({ freshTotalCents: TOTAL_A + 1 }))).toContain(`captured ${TOTAL_A + 1}`);
  });

  it('refuses a service fee that is not the stamped rate over the snapshot subtotal', () => {
    const data = [...PAGE_A.data];
    data[2] = lineItem(300, { ...SERVICE_FEE_LINE_METADATA });
    const verdict = verify({ page: { data, has_more: false }, freshTotalCents: 5300 });
    expect(refusal(verdict)).toContain('service fee line is 300');
  });

  it('refuses a missing service-fee line when the stamped rate charges one', () => {
    const page = { data: PAGE_A.data.slice(0, 2), has_more: false };
    expect(refusal(verify({ page, freshTotalCents: 5000 }))).toContain('no service fee line');
  });

  it('refuses a service-fee line when the stamped rate computes no fee (constraint 5)', () => {
    const noFee = { percent: 0, flatCents: 0, minCents: 0 };
    const verdict = verify({ platformFeeRates: noFee });
    expect(refusal(verdict)).toContain('no service fee is due');
  });

  it('accepts a zero-fee session with no service-fee line', () => {
    const noFee = { percent: 0, flatCents: 0, minCents: 0 };
    const page = { data: PAGE_A.data.slice(0, 2), has_more: false };
    expect(verify({ page, platformFeeRates: noFee, freshTotalCents: 5000 })).toEqual({
      ok: true,
      lineAmounts: { 'ci-1': 2500, 'ci-2': 2500 },
    });
  });
});

describe('constraint 1: each price is bound to the entry it was sold for', () => {
  it.each([
    ['class', { class_id: 'class-9' }, 'class_id'],
    ['dog', { dog_id: 'dog-9' }, 'dog_id'],
    ['junior declaration', { junior_fee_declared: true }, 'junior_fee_declared'],
    ['settled entry', { entry_id: 'entry-9' }, 'entry_id'],
  ])('same cart-item id and amount, different %s: refused', (_label, change, field) => {
    const changed = [{ ...ITEMS[0], ...change }, ITEMS[1]];
    const verdict = verify({ items: changed });
    expect(verdict.ok).toBe(false);
    expect(refusal(verdict)).toContain(`ci-1 ${field} changed`);
  });

  it('reads a Finish Payment line back with its entry id', () => {
    const settle = { ...ITEMS[0], entry_id: 'entry-1' };
    const page = sessionLineItems([settle, ITEMS[1]], PRICES_A);
    expect(verify({ items: [settle, ITEMS[1]], page }).ok).toBe(true);
  });
});

describe('constraint 5: the cart reader proves one to one over the raw line items', () => {
  it('refuses two line items for one cart line, which a by-id map would overwrite', () => {
    const data = [PAGE_A.data[0], PAGE_A.data[0], PAGE_A.data[1], PAGE_A.data[2]];
    const reading = readCartPriceSnapshotLineItems({ data, has_more: false });
    expect(reading).toEqual({ ok: false, problem: 'cart line ci-1 has 2 line items' });
  });

  it('refuses an untagged line item instead of dropping it', () => {
    const data = [...PAGE_A.data, lineItem(100, {})];
    const reading = readCartPriceSnapshotLineItems({ data, has_more: false });
    expect(reading.ok).toBe(false);
  });

  it('refuses two service-fee lines', () => {
    const data = [...PAGE_A.data, PAGE_A.data[2]];
    expect(readCartPriceSnapshotLineItems({ data, has_more: false })).toEqual({
      ok: false,
      problem: 'the session has 2 service fee lines',
    });
  });

  it('refuses a quantity other than one and a non-positive amount', () => {
    const qty = [lineItem(2500, cartLineSnapshotMetadata(ITEMS[0]), 2)];
    expect(readCartPriceSnapshotLineItems({ data: qty }).ok).toBe(false);
    const zero = [lineItem(0, cartLineSnapshotMetadata(ITEMS[0]))];
    expect(readCartPriceSnapshotLineItems({ data: zero }).ok).toBe(false);
  });

  it('refuses a line item whose product was not expanded', () => {
    const data = [{ amount_total: 2500, quantity: 1, price: { product: 'prod_1' } }];
    expect(readCartPriceSnapshotLineItems({ data }).ok).toBe(false);
  });

  it('reads the service-fee line apart from the cart lines', () => {
    const reading = readCartPriceSnapshotLineItems(PAGE_A);
    expect(reading.ok && reading.serviceFeeCents).toBe(250);
    expect(reading.ok && [...reading.lines.keys()]).toEqual(['ci-1', 'ci-2']);
  });
});

describe('constraint 2: sessions opened before the rollout keep the re-price check', () => {
  const legacyMetadata = { cart_id: 'cart-1', type: 'entry', ...stampPlatformFeeRates(RATES) };

  it.each([
    ['no metadata', null],
    ['pre-rollout metadata', legacyMetadata],
    ['an unknown version', { ...legacyMetadata, price_snapshot: '0' }],
  ])('%s is not versioned', (_label, metadata) => {
    expect(isVersionedCartSession(metadata)).toBe(false);
  });

  it('an unversioned session is verified by re-pricing, never refused as snapshot missing', async () => {
    const loadLineItems = vi.fn();
    const repriceTotal = vi.fn(async () => ({
      expectedCents: TOTAL_A,
      lineAmounts: { 'ci-1': 2500, 'ci-2': 2500 },
    }));
    const verdict = await verifyPaidCartCharge(
      { loadLineItems, repriceTotal },
      {
        sessionMetadata: legacyMetadata,
        items: ITEMS,
        freshTotalCents: TOTAL_A,
        platformFeeRates: RATES,
      }
    );
    expect(loadLineItems).not.toHaveBeenCalled();
    expect(repriceTotal).toHaveBeenCalledTimes(1);
    expect(verdict).toEqual({ ok: true, lineAmounts: { 'ci-1': 2500, 'ci-2': 2500 } });
  });

  it('an unversioned session the current rule disagrees with is refused the old way', async () => {
    const verdict = await verifyPaidCartCharge(
      {
        loadLineItems: vi.fn(),
        repriceTotal: async () => ({ expectedCents: 6300, lineAmounts: {} }),
      },
      {
        sessionMetadata: legacyMetadata,
        items: ITEMS,
        freshTotalCents: TOTAL_A,
        platformFeeRates: RATES,
      }
    );
    expect(verdict).toEqual({
      ok: false,
      expectedCents: 6300,
      snapshotMismatch: null,
      detail: { authoritative_cents: 6300 },
    });
  });

  it('a versioned session is verified from its line items and never re-priced', async () => {
    const repriceTotal = vi.fn();
    const verdict = await verifyPaidCartCharge(
      { loadLineItems: async () => PAGE_A, repriceTotal },
      {
        sessionMetadata: { ...legacyMetadata, ...cartSessionSnapshotMetadata() },
        items: ITEMS,
        freshTotalCents: TOTAL_A,
        platformFeeRates: RATES,
      }
    );
    expect(repriceTotal).not.toHaveBeenCalled();
    expect(verdict).toEqual({ ok: true, lineAmounts: { 'ci-1': 2500, 'ci-2': 2500 } });
  });
});

describe('the snapshot fits Stripe metadata limits', () => {
  it('stays inside 50 keys, 40-character keys and 500-character values', () => {
    for (const metadata of [
      cartLineSnapshotMetadata({ ...ITEMS[0], entry_id: '00000000-0000-0000-0000-000000000000' }),
      {
        ...stampPlatformFeeRates(RATES),
        cart_id: ITEMS[0].id,
        type: 'entry',
        ...cartSessionSnapshotMetadata(),
      },
    ]) {
      const entries = Object.entries(metadata);
      expect(entries.length).toBeLessThanOrEqual(50);
      for (const [key, value] of entries) {
        expect(key.length).toBeLessThanOrEqual(40);
        expect(value.length).toBeGreaterThan(0);
        expect(value.length).toBeLessThanOrEqual(500);
      }
    }
  });
});

describe('loadCartPriceSnapshotLineItems', () => {
  it('reads one expanded page of 100', async () => {
    const listLineItems = vi.fn(async () => PAGE_A);
    await loadCartPriceSnapshotLineItems({ listLineItems }, 'cs_1');
    expect(listLineItems).toHaveBeenCalledWith('cs_1', {
      limit: 100,
      expand: ['data.price.product'],
    });
  });

  it('lets a failed read throw, so the webhook answers non-2xx and Stripe redelivers', async () => {
    const listLineItems = vi.fn(async () => {
      throw new Error('Request timed out');
    });
    await expect(loadCartPriceSnapshotLineItems({ listLineItems }, 'cs_1')).rejects.toThrow(
      'Request timed out'
    );
  });
});
