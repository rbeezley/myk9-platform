/**
 * MYK9-838: the wizard's quote for a junior handler equals what checkout charges,
 * end to end, so a junior's first card checkout never bounces on the heal-and-409.
 *
 * Three hops, one fixture per case:
 *  1. the wizard preview (`calculateTotalFees`),
 *  2. the cart lines the wizard writes (`submitRegistrationCartCheckout` ->
 *     `entry_cart_items.entry_fee_cents` + `junior_fee_declared`),
 *  3. the server's price for those same lines (`priceCartItems`, the ONE pricing
 *     function `stripe-checkout` and `stripe-webhook` share), and its drift gate
 *     (`findDriftedCartItems`, the check that heals and answers 409).
 *
 * Junior status is the exhibitor's declaration on both sides (MYK9-879, settled
 * by the owner in docs/plan-junior-handler-fee-v2.md "Settled in slice C"). No
 * date of birth is read on either side, so there is no second rule to keep in
 * step; this pins that the one rule gives the same cents in both places.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateTotalFees,
  type ShowFeeInfo,
} from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';
import {
  findDriftedCartItems,
  priceCartItems,
  type PricingShow,
  type StoredEntryJunior,
} from '../../../supabase/functions/_shared/cartItemPricing';
import { submitRegistrationCartCheckout } from './registrationCartCheckout';

const classSelections = [
  { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
  {
    dogId: 'dog-2',
    trialId: 'trial-1',
    selectedClasses: [{ classId: 'class-1' }, { classId: 'class-2' }],
  },
];
const classes = [
  { id: 'class-1', className: 'Interior Novice A', entryFee: 28 },
  { id: 'class-2', className: 'Exterior Novice A', entryFee: 28 },
];
const dogs = [
  { id: 'dog-1', name: 'Rocket' },
  { id: 'dog-2', name: 'Juno' },
];

const BEFORE_SHOW = '2099-04-01T17:00:00.000Z';
const SHOW_DAY = '2099-05-01T17:00:00.000Z';

/** The same show, in the wizard's shape and in the shape the server reads. */
function show(juniorHandlerFee: string | null): { client: ShowFeeInfo; server: PricingShow } {
  return {
    client: {
      preEntryFee: '30',
      dayOfShowFee: '45',
      startDate: '2099-05-01',
      entryCloseDate: '2099-04-20',
      entryWindowTimezone: 'UTC',
      ...(juniorHandlerFee !== null ? { juniorHandlerFee } : {}),
    },
    server: {
      pre_entry_fee: '30.00',
      day_of_show_fee: '45.00',
      start_date: '2099-05-01',
      junior_handler_fee: juniorHandlerFee,
      organization: 'AKC',
    },
  };
}

interface WrittenLine {
  dogId: string;
  classId: string;
  entryFeeCents: number;
  juniorFeeDeclared?: boolean;
}

async function quoteAndCharge(
  fees: { client: ShowFeeInfo; server: PricingShow },
  declared: ReadonlySet<string>,
  nowIso: string
) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(nowIso));

  const preview = calculateTotalFees(
    ['dog-1', 'dog-2'],
    classSelections,
    dogs,
    classes,
    fees.client,
    new Set(),
    declared
  );

  const addItem = vi.fn().mockResolvedValue(true);
  await submitRegistrationCartCheckout({
    showId: 'show-1',
    ownerResolution: { ok: true, ownerId: 'people-1' },
    exhibitorProfileId: 'profile-1',
    classSelections,
    handlerAssignments: {},
    classes,
    showFeeInfo: fees.client,
    juniorHandlerDogIds: declared,
    deps: {
      ensureCart: vi.fn().mockResolvedValue({ kind: 'ready', cart: { id: 'cart-1', items: [] } }),
      clearCart: vi.fn().mockResolvedValue(true),
      addItem,
      abandonCart: vi.fn().mockResolvedValue(true),
      navigate: vi.fn(),
    },
  });

  // The rows stripe-checkout reads back: what the wizard wrote, plus the class fee.
  const written = addItem.mock.calls.map(([line]) => line as WrittenLine);
  const cartRows = written.map((line, index) => ({
    id: `item-${index + 1}`,
    dog_id: line.dogId,
    class_id: line.classId,
    entry_id: null,
    junior_fee_declared: line.juniorFeeDeclared === true,
    entry_fee_cents: line.entryFeeCents,
    class_entry_fee: classes.find(c => c.id === line.classId)?.entryFee ?? null,
  }));
  const serverPrices = priceCartItems(
    fees.server,
    cartRows,
    new Map<string, StoredEntryJunior>(),
    nowIso
  );

  return {
    previewCents: Math.round(preview.total * 100),
    previewLineCents: preview.breakdown.flatMap(dog =>
      dog.classes.map(c => [dog.dogId, c.classId, Math.round(c.fee * 100)])
    ),
    cartRows,
    serverLineCents: cartRows.map(row => [row.dog_id, row.class_id, serverPrices.get(row.id)]),
    serverTotalCents: [...serverPrices.values()].reduce((sum, cents) => sum + cents, 0),
    drifted: findDriftedCartItems(cartRows, serverPrices),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('wizard quote equals the server charge (MYK9-838)', () => {
  it('prices a declared junior line at the junior fee in the quote, the cart and on the server', async () => {
    const result = await quoteAndCharge(show('15'), new Set(['dog-1']), BEFORE_SHOW);

    expect(result.previewLineCents).toEqual([
      ['dog-1', 'class-1', 1500],
      ['dog-2', 'class-1', 3000],
      ['dog-2', 'class-2', 3000],
    ]);
    expect(result.serverLineCents).toEqual(result.previewLineCents);
    expect(result.cartRows[0]).toMatchObject({ entry_fee_cents: 1500, junior_fee_declared: true });
    expect(result.previewCents).toBe(7500);
    expect(result.serverTotalCents).toBe(7500);
    // No line disagrees, so stripe-checkout neither heals nor answers 409.
    expect(result.drifted).toEqual([]);
  });

  it('adult control: no declaration charges the regular fee everywhere', async () => {
    const result = await quoteAndCharge(show('15'), new Set(), BEFORE_SHOW);

    expect(result.previewCents).toBe(9000);
    expect(result.serverTotalCents).toBe(9000);
    expect(result.serverLineCents).toEqual(result.previewLineCents);
    expect(result.drifted).toEqual([]);
  });

  it('a show with no junior fee charges the regular fee even for a declared dog', async () => {
    for (const fee of [null, '', '0']) {
      const result = await quoteAndCharge(show(fee), new Set(['dog-1', 'dog-2']), BEFORE_SHOW);

      expect(result.previewCents).toBe(9000);
      expect(result.serverTotalCents).toBe(9000);
      expect(result.drifted).toEqual([]);
    }
  });

  it('day of show: the junior fee still wins against the higher day-of fee, and the adult pays day-of', async () => {
    const result = await quoteAndCharge(show('15'), new Set(['dog-2']), SHOW_DAY);

    expect(result.previewLineCents).toEqual([
      ['dog-1', 'class-1', 4500],
      ['dog-2', 'class-1', 1500],
      ['dog-2', 'class-2', 1500],
    ]);
    expect(result.serverLineCents).toEqual(result.previewLineCents);
    expect(result.previewCents).toBe(7500);
    expect(result.drifted).toEqual([]);
  });

  it('a junior fee above the regular fee is capped at the regular fee on both sides', async () => {
    const result = await quoteAndCharge(show('40'), new Set(['dog-1']), BEFORE_SHOW);

    expect(result.previewCents).toBe(9000);
    expect(result.serverTotalCents).toBe(9000);
    expect(result.drifted).toEqual([]);
  });
});
