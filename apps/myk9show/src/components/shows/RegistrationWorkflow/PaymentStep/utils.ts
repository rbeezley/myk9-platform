import type {
  ClassSelectionData,
  PaymentStatus,
  EntryStatus,
} from '@/types/show-registration-types';
import {
  PaymentStatus as PaymentStatusEnum,
  EntryStatus as EntryStatusEnum,
} from '@/types/show-registration-types';
import type { FeeCalculationResult, FeeBreakdownItem } from './types';
import { getDogDisplayName } from '@/types/dog-types';

/**
 * Minimal subset of Dog used by fee calculation.
 * Keeps this module decoupled from the full Dog type.
 */
interface DogLike {
  id: string;
  callName?: string | undefined;
  name: string;
}

/**
 * Minimal subset of ClassData used by fee calculation.
 */
interface ClassLike {
  id: string;
  className?: string | undefined;
  entryFee?: number | undefined;
}

/**
 * Minimal subset of Show used by fee calculation.
 */
export interface ShowFeeInfo {
  preEntryFee: string;
  dayOfShowFee?: string | undefined;
  startDate: string;
}

/** Default entry fee when neither show nor class has a fee set. */
const DEFAULT_ENTRY_FEE = 25;

/**
 * Determine the entry fee for a class.
 *
 * Priority:
 * 1. Show-level fee tier based on date (pre-entry vs day-of-show)
 * 2. Class-level entryFee (fallback when show has no fees)
 * 3. DEFAULT_ENTRY_FEE ($25 fallback)
 *
 * Note: per-class fee overrides (e.g. detective costs more) require a
 * separate `feeOverride` flag on the class so template defaults don't
 * accidentally override show-level fees.
 */
export function getShowEntryFee(
  show: ShowFeeInfo | undefined,
  classEntryFee?: number | undefined
): number {
  // Show-level fee with date-based tier
  if (show) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const showStart = new Date(show.startDate);
    showStart.setHours(0, 0, 0, 0);

    if (now >= showStart && show.dayOfShowFee) {
      const dayFee = parseFloat(show.dayOfShowFee.replace(/[$,]/g, ''));
      if (!isNaN(dayFee) && dayFee > 0) return dayFee;
    }

    const preFee = parseFloat(show.preEntryFee.replace(/[$,]/g, ''));
    if (!isNaN(preFee) && preFee > 0) return preFee;
  }

  // Class-level fee as fallback
  return classEntryFee || DEFAULT_ENTRY_FEE;
}

/** Multi-dog discount threshold (number of dogs). */
const MULTI_DOG_THRESHOLD = 3;

/** Multi-dog discount rate. */
const MULTI_DOG_DISCOUNT_RATE = 0.1;

/** Early bird discount rate. */
const EARLY_BIRD_DISCOUNT_RATE = 0.05;

/**
 * Calculate the total fees, discounts, and per-dog breakdown for a registration.
 * When show info is provided, uses show-level fee tiers (pre-entry vs day-of-show)
 * based on current date. Falls back to class-level entryFee otherwise.
 */
export function calculateTotalFees(
  selectedDogs: string[],
  classSelections: ClassSelectionData[],
  dogs: DogLike[],
  classes: ClassLike[],
  show?: ShowFeeInfo
): FeeCalculationResult {
  let subtotal = 0;
  const breakdown: FeeBreakdownItem[] = [];

  selectedDogs.forEach(dogId => {
    const dog = dogs.find(d => d.id === dogId);
    const dogSelections = classSelections.find(s => s.dogId === dogId);

    if (dog && dogSelections) {
      const dogClasses = dogSelections.selectedClasses.map(sc => {
        const classData = classes.find(c => c.id === sc.classId);
        return {
          className: classData?.className || 'Unknown Class',
          fee: getShowEntryFee(show, classData?.entryFee),
        };
      });

      const dogSubtotal = dogClasses.reduce((sum, c) => sum + c.fee, 0);
      subtotal += dogSubtotal;

      breakdown.push({
        dogId,
        dogName: getDogDisplayName(dog),
        classes: dogClasses,
        subtotal: dogSubtotal,
      });
    }
  });

  // Calculate discounts
  const discounts: FeeCalculationResult['discounts'] = [];

  if (selectedDogs.length >= MULTI_DOG_THRESHOLD) {
    discounts.push({
      type: 'multi-dog',
      amount: subtotal * MULTI_DOG_DISCOUNT_RATE,
      description: '10% multi-dog discount (3+ dogs)',
    });
  }

  // Early bird discount (mock)
  const earlyBirdDiscount = subtotal * EARLY_BIRD_DISCOUNT_RATE;
  discounts.push({
    type: 'early-bird',
    amount: earlyBirdDiscount,
    description: '5% early bird discount',
  });

  const discountTotal = discounts.reduce((sum, d) => sum + d.amount, 0);
  const total = subtotal - discountTotal;

  return {
    subtotal,
    discounts,
    taxes: 0,
    total,
    breakdown,
  };
}

/** Supported card brand identifiers. */
export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown';

/**
 * Detect card brand from the card number prefix.
 *
 * Uses IIN (Issuer Identification Number) ranges:
 * - Visa: starts with 4
 * - Mastercard: starts with 51-55 or 2221-2720
 * - Amex: starts with 34 or 37
 * - Discover: starts with 6011, 644-649, or 65
 */
export function detectCardBrand(cardNumber: string): CardBrand {
  const digits = cardNumber.replace(/\s/g, '');
  if (!digits) return 'unknown';

  if (/^4/.test(digits)) return 'visa';
  if (/^5[1-5]/.test(digits) || /^2[2-7][0-9]{2}/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^6(?:011|5|4[4-9])/.test(digits)) return 'discover';

  return 'unknown';
}

/**
 * Format a credit card number with spaces every 4 digits.
 */
export function formatCardNumber(value: string): string {
  return value.replace(/\s/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
}

/**
 * Format an expiry date as MM/YY.
 */
export function formatExpiryDate(value: string): string {
  return value.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2');
}

/**
 * Strip non-digit characters from a string (used for CVV).
 */
export function stripNonDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Get the Tailwind badge color classes for an EntryStatus.
 */
export function getEntryStatusBadgeColor(status: EntryStatus): string {
  switch (status) {
    case EntryStatusEnum.ACCEPTED:
      return 'bg-teal-100 text-teal-800 border-teal-200';
    case EntryStatusEnum.REJECTED:
      return 'bg-red-100 text-red-800 border-red-200';
    case EntryStatusEnum.WAITLIST:
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case EntryStatusEnum.MISSING_INFO:
      return 'bg-orange-100 text-orange-800 border-orange-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

/**
 * Get the Tailwind badge color classes for a PaymentStatus.
 */
export function getPaymentStatusBadgeColor(status: PaymentStatus): string {
  switch (status) {
    case PaymentStatusEnum.PAID_ONLINE:
    case PaymentStatusEnum.PAID_BY_CHECK:
    case PaymentStatusEnum.PAID_BY_CASH:
      return 'bg-teal-100 text-teal-800 border-teal-200';
    case PaymentStatusEnum.REFUNDED:
    case PaymentStatusEnum.PARTIAL_REFUND:
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

/**
 * Get a human-readable label for a payment method code.
 */
export function getPaymentMethodLabel(method: string): string {
  switch (method) {
    case 'credit_card':
      return 'Credit/Debit Card';
    case 'check':
      return 'Check at Show';
    case 'cash':
      return 'Cash at Show';
    case 'secretary_paid':
      return 'Secretary Payment';
    case 'group_payment':
      return 'Group Payment';
    case 'waived':
      return 'Fees Waived';
    default:
      return method;
  }
}
