// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildEntryPaymentLinkSession } from './entryPaymentLink';
import {
  priceCartItems,
  priceExistingEntryCents,
  type CartItemForPricing,
  type StoredEntryJunior,
} from './cartItemPricing';
import { authoritativeEntryFeeCents } from './authoritativeFee';

// Codex P1 on MYK9-879: an entry that already exists is charged the fee FROZEN on
// it (entries.entry_fee), never re-priced from the show's current tiers. Every
// money path that settles an existing entry reads it: the Finish Payment line at
// checkout, the webhook's per-line amount and paid-total check (the same
// priceCartItems), and the secretary payment link.
const show = {
  pre_entry_fee: 30,
  day_of_show_fee: 45,
  start_date: '2026-10-10',
  junior_handler_fee: 15,
};
const NOW = '2026-10-01T12:00:00Z';

const line = (over: Partial<CartItemForPricing> = {}): CartItemForPricing => ({
  id: 'item-1',
  dog_id: 'dog-1',
  class_id: 'class-1',
  entry_id: 'entry-1',
  junior_fee_declared: false,
  class_entry_fee: 28,
  ...over,
});

const stored = (entry_fee: number | string | null, over: Partial<StoredEntryJunior> = {}) =>
  new Map<string, StoredEntryJunior>([
    [
      'entry-1',
      {
        dog_id: 'dog-1',
        class_id: 'class-1',
        entry_fee,
        junior_fee_declared: true,
        junior_fee_override_by: null,
        ...over,
      },
    ],
  ]);

// The show's junior tier is LATER raised from 15 to 20.
const raisedTier = { ...show, junior_handler_fee: 20 };

describe('an existing entry is charged its FROZEN entry_fee', () => {
  it('Finish Payment line: frozen at 15.00, tier later 20 => 1500', () => {
    expect(priceCartItems(raisedTier, [line()], stored('15.00'), NOW).get('item-1')).toBe(1500);
    expect(priceCartItems(raisedTier, [line()], stored(15), NOW).get('item-1')).toBe(1500);
  });

  it('webhook parity: the per-line amount and the subtotal it verifies are the frozen fee', () => {
    const lines = priceCartItems(raisedTier, [line()], stored('15.00'), NOW);
    expect([...lines.values()].reduce((sum, c) => sum + c, 0)).toBe(1500);
  });

  it('payment link: frozen at 15.00, tier later 20 => a 1500-cent Stripe line', () => {
    const entry = { entry_fee: '15.00', junior_fee_declared: true, junior_fee_override_by: null };
    const cents = priceExistingEntryCents(raisedTier, entry, 28, NOW);
    expect(cents).toBe(1500);
    const session = buildEntryPaymentLinkSession({
      entries: [
        {
          entryId: 'e1',
          authoritativeFeeCents: cents,
          dogName: 'Rex',
          className: 'Novice A',
          showName: 'Spring Trial',
        },
      ],
      platformFeeRates: { percent: 0, flatCents: 0, minCents: 0 },
      successUrl: 'https://myk9show.com/ok',
      cancelUrl: 'https://myk9show.com/no',
      expiresAtEpoch: 1_900_000_000,
    });
    expect(session.line_items[0].price_data.unit_amount).toBe(1500);
  });

  it('an entry frozen at the NORMAL fee stays normal after a junior tier appears', () => {
    const entry = { entry_fee: 30, junior_fee_declared: false, junior_fee_override_by: null };
    expect(priceExistingEntryCents(show, entry, 28, NOW)).toBe(3000);
    const normal = stored(30, { junior_fee_declared: false });
    expect(priceCartItems(show, [line()], normal, NOW).get('item-1')).toBe(3000);
    // Even a stored declaration flag does not re-price it: the fee is the record.
    expect(priceCartItems(show, [line()], stored(30), NOW).get('item-1')).toBe(3000);
  });

  it('survives a CHANGED normal fee as well', () => {
    const normal = stored(30, { junior_fee_declared: false });
    expect(
      priceCartItems({ ...show, pre_entry_fee: 99 }, [line()], normal, NOW).get('item-1')
    ).toBe(3000);
  });

  it('a NEW line is still priced from the tiers and the declaration', () => {
    const fresh = line({ entry_id: null, junior_fee_declared: true });
    expect(priceCartItems(raisedTier, [fresh], new Map(), NOW).get('item-1')).toBe(2000);
  });

  it('falls back to the tiers only when the entry holds no positive fee', () => {
    for (const fee of [null, 0, '0.00']) {
      expect(priceCartItems(show, [line()], stored(fee), NOW).get('item-1')).toBe(1500);
    }
  });

  it('does not borrow another dog or class entry fee', () => {
    const other = stored(5, { dog_id: 'other' });
    // Not that entry's fee (5.00) and not its junior flag: the normal tier.
    expect(priceCartItems(show, [line()], other, NOW).get('item-1')).toBe(3000);
  });
});

describe('ASCA honors no declaration (server side)', () => {
  it('prices a declared new line at the normal fee on an ASCA show', () => {
    const declared = [line({ entry_id: null, junior_fee_declared: true })];
    const asca = { ...show, organization: 'ASCA' };
    expect(priceCartItems(asca, declared, new Map(), NOW).get('item-1')).toBe(3000);
    const akc = { ...show, organization: 'AKC' };
    expect(priceCartItems(akc, declared, new Map(), NOW).get('item-1')).toBe(1500);
  });

  it('authoritativeEntryFeeCents ignores the declaration for ASCA', () => {
    const input = {
      showPreEntryFee: 30,
      showDayOfShowFee: 45,
      showStartDate: '2026-10-10',
      classEntryFee: 28,
      nowIso: NOW,
      showJuniorHandlerFee: 15,
      juniorDeclared: true,
    };
    expect(authoritativeEntryFeeCents({ ...input, showOrganization: 'ASCA' })).toBe(3000);
    expect(authoritativeEntryFeeCents({ ...input, showOrganization: 'UKC' })).toBe(1500);
  });
});
