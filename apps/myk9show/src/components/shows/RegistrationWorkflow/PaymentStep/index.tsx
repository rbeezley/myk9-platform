import React, { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PaymentStatus, EntryStatus } from '@/types/show-registration-types';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useShowStore } from '@/store/showStore';
import { useRegistrationPermissions } from '@/hooks/useRegistrationPermissions';
import { calculateTotalFees } from './utils';
import { RegistrationSummary } from './RegistrationSummary';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { SecretaryPaymentManagement } from './SecretaryPaymentManagement';
import { PaymentSummaryCard } from './PaymentSummaryCard';
import type { PaymentStepProps } from './types';

/**
 * Top-level PaymentStep component that composes the sub-components for
 * registration fee summary, payment method selection, secretary management, and payment summary.
 */
export const PaymentStep: React.FC<PaymentStepProps> = ({
  selectedDogs,
  classSelections,
  paymentMethod,
  paymentStatus = PaymentStatus.PENDING,
  entryStatus = EntryStatus.PENDING,
  onPaymentMethodChange,
  onPaymentStatusChange,
  onEntryStatusChange,
  showId,
}) => {
  const { dogs } = useDogStoreCompat();
  const { classes = [] } = useClassStoreCompat();
  const { shows = [] } = useShowStore();
  useRegistrationPermissions();

  const show = showId ? shows.find(s => s.id === showId) : undefined;

  // Shared state: fee override and waiver (used by both SecretaryPaymentManagement and PaymentSummaryCard)
  const [feeOverride, setFeeOverride] = useState<number | null>(null);
  const [waiveFees, setWaiveFees] = useState(false);

  const feeCalculation = calculateTotalFees(selectedDogs, classSelections, dogs, classes, show);

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Payment Information</h3>
        <p className="text-sm text-gray-600 mt-1">Review your fees and select a payment method.</p>
      </div>

      {/* Fee Summary */}
      <RegistrationSummary feeCalculation={feeCalculation} />

      {/* Payment Method Selection */}
      <PaymentMethodSelector
        paymentMethod={paymentMethod}
        onPaymentMethodChange={onPaymentMethodChange}
      />

      {/* Secretary Features */}
      <SecretaryPaymentManagement
        paymentStatus={paymentStatus}
        entryStatus={entryStatus}
        feeCalculation={feeCalculation}
        selectedDogs={selectedDogs}
        waiveFees={waiveFees}
        feeOverride={feeOverride}
        onWaiveFeesChange={setWaiveFees}
        onFeeOverrideChange={setFeeOverride}
        onPaymentMethodChange={onPaymentMethodChange}
        onPaymentStatusChange={onPaymentStatusChange}
        onEntryStatusChange={onEntryStatusChange}
      />

      {/* Payment Summary */}
      <PaymentSummaryCard
        paymentMethod={paymentMethod}
        feeCalculation={feeCalculation}
        waiveFees={waiveFees}
        feeOverride={feeOverride}
      />

      {/* Payment Info Notice */}
      <Alert>
        <CreditCard className="h-4 w-4" />
        <AlertDescription>
          Your registration will be confirmed once payment is received. Online card payment via
          Stripe is coming soon.
        </AlertDescription>
      </Alert>
    </div>
  );
};
