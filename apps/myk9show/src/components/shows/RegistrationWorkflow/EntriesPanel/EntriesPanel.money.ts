/**
 * Every money figure the entries panel renders, worked out once.
 *
 * The panel draws these, and the wizard's Pay button (MYK9-1964) reads its
 * amount from the very same result, so "Pay $32.10" can never name a figure
 * the panel's "Total due" does not show.
 */
import type { PlatformFeeRates } from '@/store/cartStore.helpers';
import type { PaymentMethod } from '@/types/show-registration-types';
import type { FeeCalculationResult } from '../PaymentStep/types';
import {
  computePaymentTotals,
  countPanelLines,
  formatAmountDue,
  sumPanelFeeCents,
  type PanelDogGroup,
  type PaymentTotals,
} from './EntriesPanel.helpers';

export interface EntriesPanelMoneyInput {
  groups: PanelDogGroup[];
  variant: 'default' | 'payment';
  paymentMethod: PaymentMethod | '';
  feeCalculation?: FeeCalculationResult | undefined;
  capacityReady: boolean;
  capacityUnavailable?: boolean | undefined;
  feeTier?: { isReady: boolean; isUnavailable: boolean } | undefined;
  rates: PlatformFeeRates;
}

export interface EntriesPanelMoney {
  /** Availability AND the fee tier are known. */
  capacityReady: boolean;
  capacityUnavailable: boolean;
  moneyPlaceholder: string | undefined;
  /** Payment step only. */
  totals: PaymentTotals | undefined;
  classCount: number;
  entryFeeCents: number;
  adjustmentCents: number;
  /** The headline string: the phone bar's amount and the totals block's "Total due". */
  headline: string;
}

export function resolveEntriesPanelMoney({
  groups,
  variant,
  paymentMethod,
  feeCalculation,
  capacityReady: capacityReadyInput,
  capacityUnavailable: capacityUnavailableInput,
  feeTier,
  rates,
}: EntriesPanelMoneyInput): EntriesPanelMoney {
  // One pair for every money read this panel makes. Two different unresolved
  // reads (class availability, the show's timezone) blank the same figures, so
  // they are combined once here rather than at each of the six call sites.
  const feeTierReady = feeTier?.isReady ?? true;
  const feeTierUnavailable = feeTier?.isUnavailable ?? false;
  const capacityReady = capacityReadyInput && feeTierReady;
  const capacityUnavailable = Boolean(capacityUnavailableInput) || feeTierUnavailable;
  // Which read is the reason decides the copy: "Checking availability" beside a
  // "Loading show details" alert names the wrong thing. Availability wins when
  // both are unresolved, because it is the one with a retry affordance.
  const moneyPlaceholder = capacityReadyInput
    ? feeTierUnavailable
      ? 'Not available'
      : 'Checking fees'
    : undefined;

  const totals =
    variant === 'payment' && feeCalculation
      ? computePaymentTotals({ paymentMethod, feeCalculation, capacityReady, rates })
      : undefined;

  const classCount = countPanelLines(groups);
  // ALWAYS the sum of the lines rendered above it (Codex #2210 round 6 P2). The
  // lines carry the server's per-line price and Total due the computed total;
  // any gap between them (junior minimum fee, a wait-list line, rounding, a
  // stale line price) is reconciled as its own "Adjustment" row (MYK9-1822).
  const entryFeeCents = sumPanelFeeCents(groups);
  const adjustmentCents = totals ? totals.entryFeeCents - entryFeeCents : 0;
  // The SAME string the totals block shows: one derivation, two widths.
  const headline = formatAmountDue({
    capacityReady,
    capacityUnavailable,
    placeholder: moneyPlaceholder,
    totals,
    entryFeeCents,
    classCount,
  });

  return {
    capacityReady,
    capacityUnavailable,
    moneyPlaceholder,
    totals,
    classCount,
    entryFeeCents,
    adjustmentCents,
    headline,
  };
}
