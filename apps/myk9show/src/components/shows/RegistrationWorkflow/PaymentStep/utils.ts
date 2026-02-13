import type { ClassSelectionData, PaymentStatus, EntryStatus } from '@/types/show-registration-types';
import { PaymentStatus as PaymentStatusEnum, EntryStatus as EntryStatusEnum } from '@/types/show-registration-types';
import type { FeeCalculationResult, FeeBreakdownItem } from './types';

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

/** Default entry fee when a class has no explicit fee set. */
const DEFAULT_ENTRY_FEE = 25;

/** Multi-dog discount threshold (number of dogs). */
const MULTI_DOG_THRESHOLD = 3;

/** Multi-dog discount rate. */
const MULTI_DOG_DISCOUNT_RATE = 0.1;

/** Early bird discount rate. */
const EARLY_BIRD_DISCOUNT_RATE = 0.05;

/**
 * Calculate the total fees, discounts, and per-dog breakdown for a registration.
 */
export function calculateTotalFees(
  selectedDogs: string[],
  classSelections: ClassSelectionData[],
  dogs: DogLike[],
  classes: ClassLike[]
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
          fee: classData?.entryFee || DEFAULT_ENTRY_FEE,
        };
      });

      const dogSubtotal = dogClasses.reduce((sum, c) => sum + c.fee, 0);
      subtotal += dogSubtotal;

      breakdown.push({
        dogId,
        dogName: dog.callName || dog.name,
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
      return 'bg-green-100 text-green-800 border-green-200';
    case EntryStatusEnum.REJECTED:
      return 'bg-red-100 text-red-800 border-red-200';
    case EntryStatusEnum.WAITLIST:
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
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
      return 'bg-green-100 text-green-800 border-green-200';
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
