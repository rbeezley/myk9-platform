import React, { useState } from 'react';
import { CreditCard, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PaymentStatus, EntryStatus } from '@/types/show-registration-types';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useShowStore } from '@/store/showStore';
import { useCartItems, useCartStore } from '@/store/cartStore';
import { useRegistrationPermissions } from '@/hooks/useRegistrationPermissions';
import { toast } from 'sonner';
import { calculateTotalFees } from './utils';
import { RegistrationSummary } from './RegistrationSummary';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { SecretaryPaymentManagement } from './SecretaryPaymentManagement';
import { PaymentSummaryCard } from './PaymentSummaryCard';
import { EntryAgreementSection } from './EntryAgreementSection';
import { PAYMENT_MESSAGES } from './types';
import type { PaymentStepProps } from './types';
import { removeClassFromSelections } from '../ClassSelectionStep.helpers';

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
  onPaymentDetailsChange,
  onPaymentStatusChange,
  onEntryStatusChange,
  onAgreementChange,
  agreedToEntryAgreement = false,
  showId,
  onClassSelectionChange,
  capacityReady = true,
  capacityError,
  waitlistClassIds = new Set(),
  blockedClassIds = new Set(),
}) => {
  const { dogs } = useDogStoreCompat();
  const { classes = [] } = useClassStoreCompat();
  const { shows = [] } = useShowStore();
  const { isSecretary, isClubAdmin, isSiteAdmin } = useRegistrationPermissions();
  // On-behalf organizers cannot pay by card: Stripe checkout runs under the
  // logged-in user and stripe-checkout 403s any cart they don't own. They
  // record check/cash/secretary_paid/waived instead.
  const isOnBehalf = isSecretary || isClubAdmin || isSiteAdmin;

  const show = showId ? shows.find(s => s.id === showId) : undefined;
  const cartItems = useCartItems();
  const removeItem = useCartStore(state => state.removeItem);
  const [removingLineKey, setRemovingLineKey] = useState<string | null>(null);

  const acceptedMethods = {
    check: show?.acceptCheckPayments ?? true,
    cash: show?.acceptCashPayments ?? true,
  };

  // Shared state: fee override and waiver (used by both SecretaryPaymentManagement and PaymentSummaryCard)
  const [feeOverride, setFeeOverride] = useState<number | null>(null);
  const [waiveFees, setWaiveFees] = useState(false);

  // Agreement state: controlled when onAgreementChange is provided, local otherwise
  const [localAgreed, setLocalAgreed] = useState(false);
  const agreed = onAgreementChange ? agreedToEntryAgreement : localAgreed;
  const handleAgree = onAgreementChange ?? setLocalAgreed;

  const feeCalculation = calculateTotalFees(
    selectedDogs,
    classSelections,
    dogs,
    classes,
    show,
    waitlistClassIds
  );

  const handleRemoveSummaryLine = async (dogId: string, classId: string) => {
    if (!onClassSelectionChange) return;

    const lineKey = `${dogId}:${classId}`;
    setRemovingLineKey(lineKey);
    try {
      const cartItem = cartItems.find(item => item.dog_id === dogId && item.class_id === classId);
      if (cartItem) {
        const success = await removeItem(cartItem.id);
        if (!success) {
          toast.error('Failed to remove from cart');
          return;
        }
      }
      await onClassSelectionChange(removeClassFromSelections(classSelections, dogId, classId));
    } finally {
      setRemovingLineKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Payment Information</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Review your fees and select a payment method.
        </p>
      </div>

      {/* Fee Summary */}
      <RegistrationSummary
        feeCalculation={feeCalculation}
        capacityReady={capacityReady}
        onRemoveLine={onClassSelectionChange ? handleRemoveSummaryLine : undefined}
        removingLineKey={removingLineKey}
      />

      {!capacityReady && (
        <Alert role={capacityError ? 'alert' : 'status'}>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {capacityError
              ? 'We could not verify class availability. Refresh the page before continuing.'
              : 'Checking class availability before confirming what is payable.'}
          </AlertDescription>
        </Alert>
      )}

      {capacityReady && waitlistClassIds.size > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Full classes marked as wait-list requests are not charged now. Payment is due only if
            a spot is offered later.
          </AlertDescription>
        </Alert>
      )}

      {capacityReady && blockedClassIds.size > 0 && (
        <Alert role="alert" variant="destructive">
          <Info className="h-4 w-4" />
          <AlertDescription>
            A selected class is full and does not accept a wait list. Remove it from your
            selection to continue.
          </AlertDescription>
        </Alert>
      )}

      {/* Payment Method Selection */}
      <PaymentMethodSelector
        paymentMethod={paymentMethod}
        onPaymentMethodChange={onPaymentMethodChange}
        onPaymentDetailsChange={onPaymentDetailsChange}
        acceptedMethods={acceptedMethods}
        allowCardCheckout={!isOnBehalf}
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
        capacityReady={capacityReady}
        waiveFees={waiveFees}
        feeOverride={feeOverride}
      />

      {/* Entry Agreement */}
      {show?.organization && (
        <EntryAgreementSection
          organization={show.organization}
          agreed={agreed}
          onAgree={handleAgree}
          isOnBehalf={isSecretary || isClubAdmin || isSiteAdmin}
        />
      )}

      {/* Payment Info Notice */}
      <Alert>
        <CreditCard className="h-4 w-4" />
        <AlertDescription>{PAYMENT_MESSAGES.REGISTRATION_CONFIRMATION}</AlertDescription>
      </Alert>
    </div>
  );
};
