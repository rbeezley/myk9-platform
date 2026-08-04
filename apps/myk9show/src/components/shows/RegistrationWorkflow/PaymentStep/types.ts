import type {
  ClassSelectionData,
  PaymentMethod,
  PaymentDetails,
  PaymentStatus,
  EntryStatus,
} from '@/types/show-registration-types';

/** Props for the top-level PaymentStep component. */
export interface PaymentStepProps {
  selectedDogs: string[];
  classSelections: ClassSelectionData[];
  paymentMethod: PaymentMethod | '';
  paymentStatus?: PaymentStatus | undefined;
  entryStatus?: EntryStatus | undefined;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  /** Fired whenever any payment-detail field changes (check number, date, reference, notes). */
  onPaymentDetailsChange?: ((details: PaymentDetails) => void) | undefined;
  onPaymentStatusChange?: ((status: PaymentStatus) => void) | undefined;
  onEntryStatusChange?: ((status: EntryStatus, reason?: string) => void) | undefined;
  showId?: string | undefined;
  registrationId?: string | undefined;
  /** Callback when the entry agreement checkbox is toggled. */
  onAgreementChange?: ((agreed: boolean) => void) | undefined;
  /** Current state of the entry agreement checkbox. */
  agreedToEntryAgreement?: boolean | undefined;
  /** Updates class selections when a payment-summary line is removed. */
  onClassSelectionChange?: ((selections: ClassSelectionData[]) => void | Promise<void>) | undefined;
}

/** A single class entry within a dog's fee breakdown. */
export interface FeeBreakdownClass {
  classId: string;
  className: string;
  fee: number;
  /**
   * MYK9-122: the class is full, so submission will record a wait-list request
   * rather than an entry. `fee` is what it WOULD cost if a spot is offered — it
   * is excluded from the subtotal and never charged now.
   */
  isWaitlist?: boolean;
}

/** A single dog's fee breakdown. */
export interface FeeBreakdownItem {
  dogId: string;
  dogName: string;
  classes: FeeBreakdownClass[];
  subtotal: number;
}

/** A discount applied to the registration. */
export interface FeeDiscount {
  type: string;
  amount: number;
  description: string;
}

/** The result of the fee calculation. */
export interface FeeCalculationResult {
  subtotal: number;
  discounts: FeeDiscount[];
  taxes: number;
  total: number;
  breakdown: FeeBreakdownItem[];
  /** How many selected classes are full and will become wait-list requests. */
  waitlistCount: number;
  /** What those wait-list requests would cost if offered. Never part of `total`. */
  waitlistTotal: number;
}

/** Props for the RegistrationSummary sub-component. */
export interface RegistrationSummaryProps {
  feeCalculation: FeeCalculationResult;
  onRemoveLine?: ((dogId: string, classId: string) => void | Promise<void>) | undefined;
  removingLineKey?: string | null | undefined;
}

/** Props for the PaymentMethodSelector sub-component. */
export interface PaymentMethodSelectorProps {
  paymentMethod: PaymentMethod | '';
  onPaymentMethodChange: (method: PaymentMethod) => void;
  /** Fired whenever any payment-detail field changes (check number, date, reference, notes). */
  onPaymentDetailsChange?: ((details: PaymentDetails) => void) | undefined;
  /** Which at-show payment methods are enabled for this show. Defaults to all enabled. */
  acceptedMethods?: { check: boolean; cash: boolean } | undefined;
  /**
   * Whether online card checkout is offered. Defaults to true. Card checkout
   * routes through Stripe-hosted checkout under the LOGGED-IN user's account,
   * and stripe-checkout rejects any cart whose exhibitor isn't the caller — so
   * it only works for an exhibitor paying their OWN entries. On-behalf modes
   * (secretary/club admin/site admin) must use check/cash/secretary_paid/waived.
   */
  allowCardCheckout?: boolean | undefined;
}

/** Props for the SecretaryPaymentManagement sub-component. */
export interface SecretaryPaymentManagementProps {
  paymentStatus: PaymentStatus;
  entryStatus: EntryStatus;
  feeCalculation: FeeCalculationResult;
  selectedDogs: string[];
  waiveFees: boolean;
  feeOverride: number | null;
  onWaiveFeesChange: (waived: boolean) => void;
  onFeeOverrideChange: (override: number | null) => void;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onPaymentStatusChange?: ((status: PaymentStatus) => void) | undefined;
  onEntryStatusChange?: ((status: EntryStatus, reason?: string) => void) | undefined;
}

/** Shared payment messaging for the wizard's Stripe handoff. */
export const PAYMENT_MESSAGES = {
  CARD_CHECKOUT_REDIRECT:
    "You'll be taken to our secure checkout to complete payment. Your entries will be confirmed once payment is processed.",
  REGISTRATION_CONFIRMATION: 'Your registration will be confirmed once payment is received.',
} as const;

/** Props for the PaymentSummaryCard sub-component. */
export interface PaymentSummaryCardProps {
  paymentMethod: PaymentMethod | '';
  feeCalculation: FeeCalculationResult;
  waiveFees: boolean;
  feeOverride: number | null;
}

/** Props for the EntryAgreementSection sub-component. */
export interface EntryAgreementSectionProps {
  organization: string;
  agreed: boolean;
  onAgree: (agreed: boolean) => void;
  /** True when a secretary/admin is entering on behalf of an exhibitor. */
  isOnBehalf?: boolean;
}
