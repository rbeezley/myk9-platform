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
}

/** A single class entry within a dog's fee breakdown. */
export interface FeeBreakdownClass {
  className: string;
  fee: number;
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
}

/** Props for the RegistrationSummary sub-component. */
export interface RegistrationSummaryProps {
  feeCalculation: FeeCalculationResult;
}

/** Props for the PaymentMethodSelector sub-component. */
export interface PaymentMethodSelectorProps {
  paymentMethod: PaymentMethod | '';
  onPaymentMethodChange: (method: PaymentMethod) => void;
  /** Fired whenever any payment-detail field changes (check number, date, reference, notes). */
  onPaymentDetailsChange?: ((details: PaymentDetails) => void) | undefined;
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

/** Props for the PaymentSummaryCard sub-component. */
export interface PaymentSummaryCardProps {
  paymentMethod: PaymentMethod | '';
  feeCalculation: FeeCalculationResult;
  waiveFees: boolean;
  feeOverride: number | null;
}
