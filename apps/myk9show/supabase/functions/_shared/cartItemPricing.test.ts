// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildEntryPaymentLinkSession } from './entryPaymentLink';
import { calculatePlatformFeeCents } from './platformFee';
import {
  cartItemJuniorFlag,
  findDriftedCartItems,
  loadStoredEntryJunior,
  priceCartItems,
  priceExistingEntryCents,
  type CartItemForPricing,
  type StoredEntryJunior,
} from './cartItemPricing';

// MYK9-879. Checkout, the webhook and payment links all price a cart line through
// priceCartItems, so one test pins the exact charged cents for every line shape.
const show = {
  pre_entry_fee: 30,
  day_of_show_fee: 45,
  start_date: '2026-10-10',
  junior_handler_fee: 15,
};
const NOW = '2026-10-01T12:00:00Z';

function item(overrides: Partial<CartItemForPricing> = {}): CartItemForPricing {
  return {
    id: 'item-1',
    dog_id: 'dog-1',
    class_id: 'class-1',
    entry_id: null,
    junior_fee_declared: false,
    class_entry_fee: 28,
    ...overrides,
  };
}

const noStored = new Map<string, StoredEntryJunior>();

describe('priceCartItems: exact charged cents', () => {
  it('a declared junior line is charged the junior fee', () => {
    const priced = priceCartItems(show, [item({ junior_fee_declared: true })], noStored, NOW);
    expect(priced.get('item-1')).toBe(1500);
  });

  it('an undeclared line is charged the normal fee', () => {
    expect(priceCartItems(show, [item()], noStored, NOW).get('item-1')).toBe(3000);
  });

  it('declaring on a show with NO junior tier charges the normal fee', () => {
    for (const junior_handler_fee of [null, 0]) {
      const priced = priceCartItems(
        { ...show, junior_handler_fee },
        [item({ junior_fee_declared: true })],
        noStored,
        NOW
      );
      expect(priced.get('item-1')).toBe(3000);
    }
  });

  it('a junior fee above the normal fee is capped at the normal fee', () => {
    const priced = priceCartItems(
      { ...show, junior_handler_fee: 40 },
      [item({ junior_fee_declared: true })],
      noStored,
      NOW
    );
    expect(priced.get('item-1')).toBe(3000);
  });

  it('prices each line on its own declaration in one cart', () => {
    const priced = priceCartItems(
      show,
      [
        item({ id: 'a', junior_fee_declared: true }),
        item({ id: 'b', class_id: 'class-2' }),
        item({ id: 'c', class_id: 'class-3', junior_fee_declared: true }),
      ],
      noStored,
      NOW
    );
    expect([...priced.entries()]).toEqual([
      ['a', 1500],
      ['b', 3000],
      ['c', 1500],
    ]);
  });

  it('does not depend on who owns the dog: the declaration is about the handler', () => {
    // The pricing input carries no owner, handler or date of birth, so a
    // registrant who is an adult still gets the junior fee when they declare the
    // person showing the dog is under 18 (a parent entering a child's handler).
    const priced = priceCartItems(show, [item({ junior_fee_declared: true })], noStored, NOW);
    expect(priced.get('item-1')).toBe(1500);
  });
});

describe('Finish Payment lines (entry_id set): the stored record decides, never the cart', () => {
  const recovered = item({ entry_id: 'entry-1' });
  const stored = (over: Partial<StoredEntryJunior> = {}) =>
    new Map<string, StoredEntryJunior>([
      [
        'entry-1',
        {
          dog_id: 'dog-1',
          class_id: 'class-1',
          junior_fee_declared: false,
          junior_fee_override_by: null,
          ...over,
        },
      ],
    ]);

  it('keeps the junior fee on an entry that was declared at creation', () => {
    const priced = priceCartItems(show, [recovered], stored({ junior_fee_declared: true }), NOW);
    expect(priced.get('item-1')).toBe(1500);
  });

  it('keeps the junior fee on an entry the secretary charged at the desk', () => {
    const priced = priceCartItems(
      show,
      [recovered],
      stored({ junior_fee_override_by: 'person-secretary' }),
      NOW
    );
    expect(priced.get('item-1')).toBe(1500);
  });

  it('ignores a NEW declaration on the cart line: the fee is fixed at entry creation', () => {
    const priced = priceCartItems(
      show,
      [item({ entry_id: 'entry-1', junior_fee_declared: true })],
      stored(),
      NOW
    );
    expect(priced.get('item-1')).toBe(3000);
  });

  it('does not borrow another dog or class entry record', () => {
    const wrongDog = priceCartItems(
      show,
      [recovered],
      stored({ junior_fee_declared: true, dog_id: 'someone-elses-dog' }),
      NOW
    );
    const wrongClass = priceCartItems(
      show,
      [recovered],
      stored({ junior_fee_declared: true, class_id: 'other-class' }),
      NOW
    );
    expect(wrongDog.get('item-1')).toBe(3000);
    expect(wrongClass.get('item-1')).toBe(3000);
  });

  it('prices at the normal tier when the entry record is missing', () => {
    expect(priceCartItems(show, [recovered], noStored, NOW).get('item-1')).toBe(3000);
  });

  it('cartItemJuniorFlag reads the declaration only for a new line', () => {
    expect(cartItemJuniorFlag(item({ junior_fee_declared: true }), noStored)).toBe(true);
    expect(cartItemJuniorFlag(item(), noStored)).toBe(false);
    expect(cartItemJuniorFlag(item({ junior_fee_declared: null }), noStored)).toBe(false);
  });
});

describe('loadStoredEntryJunior', () => {
  function client(rows: unknown[] | null, error: { message: string } | null = null) {
    const calls: { table: string; cols: string; ids: string[] }[] = [];
    return {
      calls,
      from(table: string) {
        return {
          select(cols: string) {
            return {
              in(_col: string, ids: string[]) {
                calls.push({ table, cols, ids });
                return Promise.resolve({ data: rows, error });
              },
            };
          },
        };
      },
    };
  }

  it('reads nothing when no line points at an entry', async () => {
    const c = client([]);
    const result = await loadStoredEntryJunior(c, [item()]);
    expect(result.error).toBeNull();
    expect(result.stored.size).toBe(0);
    expect(c.calls).toHaveLength(0);
  });

  it('reads the stored record of every entry a line points at, once each', async () => {
    const c = client([
      {
        id: 'entry-1',
        dog_id: 'dog-1',
        class_id: 'class-1',
        junior_fee_declared: true,
        junior_fee_override_by: null,
      },
    ]);
    const result = await loadStoredEntryJunior(c, [
      item({ id: 'a', entry_id: 'entry-1' }),
      item({ id: 'b', entry_id: 'entry-1' }),
      item({ id: 'c' }),
    ]);
    expect(c.calls).toEqual([
      {
        table: 'entries',
        cols: 'id, dog_id, class_id, entry_fee, moved_from_entry_id, junior_fee_declared, junior_fee_override_by',
        ids: ['entry-1'],
      },
    ]);
    expect(result.stored.get('entry-1')?.junior_fee_declared).toBe(true);
  });

  it('surfaces a read error so the caller can fail closed', async () => {
    const result = await loadStoredEntryJunior(client(null, { message: 'boom' }), [
      item({ entry_id: 'entry-1' }),
    ]);
    expect(result.error?.message).toBe('boom');
  });
});

describe('findDriftedCartItems (the checkout gate)', () => {
  it('flags a line whose stored cents are not the authoritative price', () => {
    const priced = new Map([
      ['a', 1500],
      ['b', 3000],
    ]);
    const drifted = findDriftedCartItems(
      [
        { id: 'a', entry_fee_cents: 3000 }, // declared junior, quoted at normal
        { id: 'b', entry_fee_cents: 3000 },
      ],
      priced
    );
    expect(drifted).toEqual([
      { item: { id: 'a', entry_fee_cents: 3000 }, authoritativeCents: 1500 },
    ]);
  });

  it('flags a client that lowered a normal line to the junior price without declaring', () => {
    const priced = priceCartItems(show, [item()], noStored, NOW);
    expect(findDriftedCartItems([{ id: 'item-1', entry_fee_cents: 1500 }], priced)).toHaveLength(1);
  });

  it('passes a declared line quoted at the junior fee', () => {
    const priced = priceCartItems(show, [item({ junior_fee_declared: true })], noStored, NOW);
    expect(findDriftedCartItems([{ id: 'item-1', entry_fee_cents: 1500 }], priced)).toHaveLength(0);
  });
});

describe('checkout and webhook agree on the charged total', () => {
  const rates = { percent: 7, flatCents: 0, minCents: 0 };
  const cart = [
    item({ id: 'a', junior_fee_declared: true }),
    item({ id: 'b', class_id: 'class-2' }),
  ];

  it('the Stripe total checkout charges is the total the webhook accepts, and no other', () => {
    // stripe-checkout charges the per-line authoritative cents plus the fee on the
    // subtotal; stripe-webhook recomputes the same and compares to amount_total.
    const lines = priceCartItems(show, cart, noStored, NOW);
    const subtotal = [...lines.values()].reduce((sum, c) => sum + c, 0);
    expect([...lines.values()]).toEqual([1500, 3000]);
    expect(subtotal).toBe(4500);
    const charged = subtotal + calculatePlatformFeeCents(subtotal, rates);
    expect(charged).toBe(4815);

    const webhookView = priceCartItems(show, cart, noStored, NOW);
    const webhookSubtotal = [...webhookView.values()].reduce((sum, c) => sum + c, 0);
    expect(webhookSubtotal + calculatePlatformFeeCents(webhookSubtotal, rates)).toBe(charged);

    // A session charged at the normal price for the declared line is NOT accepted.
    const normalSubtotal = 6000;
    expect(normalSubtotal + calculatePlatformFeeCents(normalSubtotal, rates)).not.toBe(charged);
  });
});

describe('priceExistingEntryCents and the payment link', () => {
  const entry = (over = {}) => ({
    junior_fee_declared: false,
    junior_fee_override_by: null as string | null,
    ...over,
  });

  it('prices an existing entry from its stored record', () => {
    expect(priceExistingEntryCents(show, entry(), 28, NOW)).toBe(3000);
    expect(priceExistingEntryCents(show, entry({ junior_fee_declared: true }), 28, NOW)).toBe(1500);
    expect(priceExistingEntryCents(show, entry({ junior_fee_override_by: 'p-1' }), 28, NOW)).toBe(
      1500
    );
  });

  it('charges the normal fee when the show has no junior tier or the junior fee is above it', () => {
    const declared = entry({ junior_fee_declared: true });
    expect(priceExistingEntryCents({ ...show, junior_handler_fee: null }, declared, 28, NOW)).toBe(
      3000
    );
    expect(priceExistingEntryCents({ ...show, junior_handler_fee: 0 }, declared, 28, NOW)).toBe(
      3000
    );
    expect(priceExistingEntryCents({ ...show, junior_handler_fee: 40 }, declared, 28, NOW)).toBe(
      3000
    );
  });

  it('the payment-link Stripe line carries the stored junior fee', () => {
    const session = buildEntryPaymentLinkSession({
      entries: [
        {
          entryId: 'e-junior',
          authoritativeFeeCents: priceExistingEntryCents(
            show,
            entry({ junior_fee_declared: true }),
            28,
            NOW
          ),
          dogName: 'Rex',
          className: 'Novice A',
          showName: 'Spring Trial',
        },
        {
          entryId: 'e-adult',
          authoritativeFeeCents: priceExistingEntryCents(show, entry(), 28, NOW),
          dogName: 'Bella',
          className: 'Open B',
          showName: 'Spring Trial',
        },
      ],
      platformFeeRates: { percent: 0, flatCents: 0, minCents: 0 },
      successUrl: 'https://myk9show.com/ok',
      cancelUrl: 'https://myk9show.com/no',
      expiresAtEpoch: 1_900_000_000,
    });
    expect(session.line_items.map(l => l.price_data.unit_amount)).toEqual([1500, 3000]);
  });
});
