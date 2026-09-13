/**
 * Pure grouping and arithmetic for the wizard's "Your entries" panel.
 *
 * The panel is READ-ONLY over state the wizard already holds: the cart store's
 * items and the replicated dog / class / trial records the class-selection step
 * already loaded. Nothing here reads Supabase, so the panel adds no path that
 * bypasses replication.
 */

import type { CartItemWithDetails } from '@/store/cartStore';
import { formatWeekdayShort } from '@/lib/format/dates';
import {
  calculatePlatformFeeCents,
  formatCartCurrency,
  type PlatformFeeRates,
} from '@/store/cartStore.helpers';
import type { PaymentMethod } from '@/types/show-registration-types';
import { availabilityPlaceholder } from '../PaymentStep/types';
import type { FeeBreakdownItem, FeeCalculationResult } from '../PaymentStep/types';

/** Minimal dog shape — `useDogStoreCompat` rows satisfy it structurally. */
export interface PanelDog {
  id: string;
  name?: string | null | undefined;
  callName?: string | null | undefined;
}

/** Minimal class shape — `useClassStoreCompat` rows satisfy it structurally. */
export interface PanelClass {
  id: string;
  trialId?: string | null | undefined;
  element?: string | null | undefined;
  level?: string | null | undefined;
  className?: string | null | undefined;
}

/** Minimal trial shape — `useTrialStore` rows satisfy it structurally. */
export interface PanelTrial {
  id: string;
  name?: string | null | undefined;
  /** Bare `YYYY-MM-DD` DATE column; formatted calendar-safe, never as an instant. */
  trialDate?: string | null | undefined;
}

/** One class a dog is entered in. */
export interface PanelClassLine {
  /**
   * `dogId:classId` — the SAME composite key `reconcileCartToSelections` and
   * the payment step's `removingLineKey` already use, so a row here and a
   * pending removal there cannot address different things.
   */
  lineKey: string;
  classId: string;
  /** Abbreviated trial day ("Sat"), or '' when the trial's date is unknown. */
  dayLabel: string;
  label: string;
  feeCents: number;
}

/** One dog's block in the panel. A selected dog with no classes has `lines: []`. */
export interface PanelDogGroup {
  dogId: string;
  dogName: string;
  lines: PanelClassLine[];
}

function dogLabel(dog: PanelDog | undefined): string {
  return dog?.callName || dog?.name || 'Dog';
}

function classLabel(item: CartItemWithDetails, klass: PanelClass | undefined): string {
  const fromStore = [klass?.element, klass?.level].filter(Boolean).join(' ');
  if (fromStore) return fromStore;
  return klass?.className || item.class?.name || 'Class';
}

function resolveTrialId(item: CartItemWithDetails, klass: PanelClass | undefined): string {
  return klass?.trialId || item.class?.trial_id || '';
}

/**
 * Group cart rows into one block per dog, each line carrying the trial day, the
 * class level and the fee in integer cents.
 *
 * Dogs are ordered by `selectedDogIds` (the order the exhibitor picked them),
 * with any dog that has cart rows but is no longer selected appended rather
 * than dropped — its fees are still in the cart and still in the total.
 * Lines within a dog are ordered by trial date, then by label.
 */
export function groupCartByDogAndDay(
  cartItems: readonly CartItemWithDetails[],
  dogsById: ReadonlyMap<string, PanelDog>,
  classesById: ReadonlyMap<string, PanelClass>,
  trialsById: ReadonlyMap<string, PanelTrial>,
  selectedDogIds: readonly string[] = []
): PanelDogGroup[] {
  const order: string[] = [...selectedDogIds];
  const linesByDog = new Map<string, Array<PanelClassLine & { sortKey: string }>>();

  for (const item of cartItems) {
    if (!item.dog_id || !item.class_id) continue;
    if (!order.includes(item.dog_id)) order.push(item.dog_id);
    const klass = classesById.get(item.class_id);
    const trial = trialsById.get(resolveTrialId(item, klass));
    const label = classLabel(item, klass);
    const line = {
      lineKey: `${item.dog_id}:${item.class_id}`,
      classId: item.class_id,
      dayLabel: formatWeekdayShort(trial?.trialDate),
      label,
      feeCents: item.entry_fee_cents,
      sortKey: `${trial?.trialDate ?? '9999-99-99'}|${label}`,
    };
    const existing = linesByDog.get(item.dog_id);
    if (existing) existing.push(line);
    else linesByDog.set(item.dog_id, [line]);
  }

  return order.map(dogId => ({
    dogId,
    dogName: dogLabel(dogsById.get(dogId)),
    lines: (linesByDog.get(dogId) ?? [])
      .slice()
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map(({ sortKey: _sortKey, ...line }) => line),
  }));
}

/**
 * Project the wizard's fee breakdown into the cart-row shape the grouper reads.
 *
 * The panel itemises what `calculateTotalFees` totalled, NOT what the cart
 * store happens to hold, for two reasons. The breakdown is the figure the Next
 * gate (`liveTotalFees`) and the payment step already use, so a panel fed from
 * it cannot disagree with the amount due (design.md decision 3 — MYK9-367 was
 * exactly that class of bug). And it is the only source that covers the staff
 * flows, where selections are local and no cart row is ever written.
 *
 * `entry_fee_cents` is the breakdown's dollars rounded to integer cents once,
 * here, so every downstream sum stays in cents.
 */
export function cartItemsFromFeeBreakdown(
  breakdown: readonly FeeBreakdownItem[]
): CartItemWithDetails[] {
  return breakdown.flatMap(dog =>
    dog.classes.map(klass => ({
      id: `${dog.dogId}:${klass.classId}`,
      cart_id: '',
      dog_id: dog.dogId,
      class_id: klass.classId,
      handler_id: null,
      entry_fee_cents: Math.round(klass.fee * 100),
      jump_height: null,
      special_requests: null,
      created_at: '',
      class: {
        id: klass.classId,
        name: klass.className,
        level: null,
        trial_id: '',
        allow_waitlist: null,
      },
    }))
  );
}

/** Entry-fee total across every dog, in integer cents. */
export function sumPanelFeeCents(groups: readonly PanelDogGroup[]): number {
  return groups.reduce(
    (total, group) => total + group.lines.reduce((sum, line) => sum + line.feeCents, 0),
    0
  );
}

/** How many classes are in the cart — the bar's "N classes" count. */
export function countPanelLines(groups: readonly PanelDogGroup[]): number {
  return groups.reduce((count, group) => count + group.lines.length, 0);
}

/** Inputs to the payment-step money block. */
export interface PaymentTotalsInput {
  paymentMethod: PaymentMethod | '';
  feeCalculation: FeeCalculationResult;
  capacityReady: boolean;
  waiveFees: boolean;
  feeOverride: number | null;
  rates: PlatformFeeRates;
}

/** The payment-step money block. */
export interface PaymentTotals {
  isWaived: boolean;
  /** True when the service fee applies: card, payable, and availability known. */
  isPayableCard: boolean;
  entryFeeCents: number;
  serviceFeeCents: number;
  amountDueCents: number;
  /** Payment is due but no method is chosen yet. */
  requiresPaymentMethod: boolean;
}

/**
 * The payment step's amount due.
 *
 * Lifted VERBATIM out of `PaymentSummaryCard`, which this panel retires — the
 * predicate (`capacityReady && !isWaived && credit_card && entryFeeCents > 0`)
 * and the cent rounding are the ones that shipped, not a re-derivation. The
 * arithmetic itself still belongs to `calculatePlatformFeeCents`; nothing here
 * re-implements it.
 */
export function computePaymentTotals({
  paymentMethod,
  feeCalculation,
  capacityReady,
  waiveFees,
  feeOverride,
  rates,
}: PaymentTotalsInput): PaymentTotals {
  const isWaived = paymentMethod === 'waived' || waiveFees;
  const entryFeeCents = Math.round((feeOverride ?? feeCalculation.total) * 100);
  const isPayableCard =
    capacityReady && !isWaived && paymentMethod === 'credit_card' && entryFeeCents > 0;
  const serviceFeeCents = isPayableCard ? calculatePlatformFeeCents(entryFeeCents, rates) : 0;
  const amountDueCents = entryFeeCents + serviceFeeCents;
  return {
    isWaived,
    isPayableCard,
    entryFeeCents,
    serviceFeeCents,
    amountDueCents,
    requiresPaymentMethod: capacityReady && !isWaived && amountDueCents > 0 && !paymentMethod,
  };
}

export interface AmountDueInput {
  capacityReady: boolean;
  capacityUnavailable?: boolean | undefined;
  /** Payment step only. Absent = the headline is entry fees. */
  totals?: PaymentTotals | undefined;
  /** Used when `totals` is absent (every step before payment). */
  entryFeeCents: number;
}

/**
 * The one derivation of the headline money string.
 *
 * The phone bar and the desktop totals block render the same entry at two
 * widths, so two derivations is two chances to disagree — and they did: the bar
 * formatted `amountDueCents` unconditionally, quoting $30.00 for a waived entry
 * whose Details block said "$0.00 (Waived)", and a dollar figure while Details
 * said "Checking availability". Both now call this.
 */
export function formatAmountDue({
  capacityReady,
  capacityUnavailable,
  totals,
  entryFeeCents,
}: AmountDueInput): string {
  // Capacity first: until it is read, no figure on this screen is trustworthy.
  if (!capacityReady) return availabilityPlaceholder(capacityUnavailable);
  if (totals?.isWaived) return '$0.00 (Waived)';
  return formatCartCurrency(totals ? totals.amountDueCents : entryFeeCents);
}
