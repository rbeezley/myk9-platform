import type { ClassSelectionData } from '@/types/show-registration-types';
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

type NonPayableClassIds = ReadonlySet<string>;

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
    // Parse startDate as local midnight; "YYYY-MM-DD" alone parses as UTC and
    // shifts by a day in negative timezones. (Note: @/utils/dateLocal has a
    // shared parseLocalDateString, but importing it here pulls LoggingService
    // into the tree, which many registration tests don't mock.)
    const startDateStr = show.startDate.includes('T')
      ? show.startDate
      : `${show.startDate}T00:00:00`;
    const showStart = new Date(startDateStr);
    showStart.setHours(0, 0, 0, 0);

    if (now >= showStart && show.dayOfShowFee) {
      const dayFee = parseFloat(show.dayOfShowFee.replace(/[$,]/g, ''));
      // Zero means "no day-of tier", NOT "free". Leaving Day-of-Show Fee blank in
      // the creation wizard persists "0.00" rather than NULL, so there is nothing
      // else to distinguish "unset" from "deliberately free" -- and a day-of tier
      // exists to charge more, never less than nothing. Accepting 0 here overrode
      // the pre-entry fee for every entry taken from the show's start date onward
      // and stored it `payment_status: paid`, so no downstream check ever flagged
      // the missing money. Any positive amount still wins, even below pre-entry.
      if (!isNaN(dayFee) && dayFee > 0) return dayFee;
    }

    const preFee = parseFloat(show.preEntryFee.replace(/[$,]/g, ''));
    if (!isNaN(preFee) && preFee >= 0) return preFee;
  }

  // Class-level fee as fallback. Use ?? so an explicit 0 is respected
  // (a legitimately free class should not silently fall back to $25).
  return classEntryFee ?? DEFAULT_ENTRY_FEE;
}

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
  show?: ShowFeeInfo,
  nonPayableClassIds: NonPayableClassIds = new Set()
): FeeCalculationResult {
  let subtotal = 0;
  const breakdown: FeeBreakdownItem[] = [];

  selectedDogs.forEach(dogId => {
    const dog = dogs.find(d => d.id === dogId);
    const dogSelections = classSelections.find(s => s.dogId === dogId);

    if (dog && dogSelections) {
      const dogClasses = dogSelections.selectedClasses.map(sc => {
        const classData = classes.find(c => c.id === sc.classId);
        const isWaitlist = nonPayableClassIds.has(sc.classId);
        return {
          classId: sc.classId,
          className: classData?.className || 'Unknown Class',
          fee: isWaitlist ? 0 : getShowEntryFee(show, classData?.entryFee),
          ...(isWaitlist ? { isWaitlist: true } : {}),
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

  // Keep the result shape ready for server-honoured discounts, but do not
  // promise a discount that the checkout path does not apply. Nothing on the
  // money path has ever applied one: the cart, registrationCartCheckout and
  // every edge function charge the full entry fee per line. See MYK9-265.
  const discounts: FeeCalculationResult['discounts'] = [];
  const total = subtotal;

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
