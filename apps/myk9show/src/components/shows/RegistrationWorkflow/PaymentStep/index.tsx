import React, { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PaymentStatus, EntryStatus, type PaymentMethod } from '@/types/show-registration-types';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { calculateTotalFees } from './utils';
import { useEntryWindowTimezone } from '@/hooks/useEntryWindowTimezone';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { SecretaryPaymentManagement } from './SecretaryPaymentManagement';
import { EntryAgreementSection } from './EntryAgreementSection';
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
  onPaymentMethodClear,
  onPaymentDetailsChange,
  onPaymentStatusChange,
  onEntryStatusChange,
  onAgreementChange,
  agreedToEntryAgreement = false,
  showId,
  capacityReady = true,
  capacityError,
  capacityUnavailable,
  onRetryAvailability,
  waitlistClassIds = new Set(),
  blockedClassIds = new Set(),
  waiveFees = false,
  feeOverride = null,
  onWaiveFeesChange,
  onFeeOverrideChange,
  paymentResolution,
}) => {
  const { dogs } = useDogStoreCompat();
  const { classes = [] } = useClassStoreCompat();
  // Resolved here, from the same hook the wizard's Next gate and the class step
  // use, rather than threaded down as a prop: one rule, one reader, no chance of
  // this step and the gate disagreeing about whether the zone is known.
  const {
    timeZone: entryWindowTimezone,
    isReady: entryWindowTimezoneReady,
    isUnavailable: entryWindowTimezoneUnavailable,
  } = useEntryWindowTimezone(showId);

  // Resolved by the PAGE and handed down, so the entries panel and these
  // controls can never disagree about how the entry is being paid for. The
  // derivation itself is `getEffectivePaymentMethod` in ./utils.
  const {
    effectivePaymentMethod,
    acceptedMethods,
    cardCheckoutAvailable,
    accountCheckPending,
    cardCheckoutUnavailableReason,
    isOnBehalf,
    show,
  } = paymentResolution;

  const pendingCardSelection = useRef(false);
  const handlePaymentMethodSelect = (method: PaymentMethod) => {
    pendingCardSelection.current = false;
    onPaymentMethodChange(method);
  };

  // The write-back still exists: parent state must come to hold the fallback so
  // submission records what was really agreed. It is now driven by the lifted
  // value rather than by a second, private derivation.
  useEffect(() => {
    if (cardCheckoutAvailable && pendingCardSelection.current) {
      pendingCardSelection.current = false;
      onPaymentMethodChange('credit_card');
      return;
    }

    if (effectivePaymentMethod === paymentMethod) return;
    if (accountCheckPending && paymentMethod === 'credit_card') {
      pendingCardSelection.current = true;
      return;
    }
    if (effectivePaymentMethod) {
      onPaymentMethodChange(effectivePaymentMethod);
    } else {
      onPaymentMethodClear?.();
    }
  }, [
    accountCheckPending,
    cardCheckoutAvailable,
    effectivePaymentMethod,
    onPaymentMethodChange,
    onPaymentMethodClear,
    paymentMethod,
  ]);

  // Agreement state: controlled when onAgreementChange is provided, local otherwise
  const [localAgreed, setLocalAgreed] = useState(false);
  const agreed = onAgreementChange ? agreedToEntryAgreement : localAgreed;
  const handleAgree = onAgreementChange ?? setLocalAgreed;

  // The fee tier is decided in the SHOW's timezone, not the viewer's. `show`
  // comes from the show store and carries no zone, so handing it straight to
  // `calculateTotalFees` priced this step in whatever zone the browser is in
  // while the payment path and the server used the show's own (MYK9-642 L-F2).
  // And until the trial read resolves that zone there is no honest total to
  // render at all, so nothing fee-bearing is shown (L-F1).
  const feeCalculation = calculateTotalFees(
    selectedDogs,
    classSelections,
    dogs,
    classes,
    show && entryWindowTimezoneReady ? { ...show, entryWindowTimezone } : undefined,
    waitlistClassIds
  );

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Payment Information</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Review your fees and select a payment method.
        </p>
      </div>

      {!entryWindowTimezoneReady && (
        // Two states the user experiences very differently, split the way the
        // capacity alert below already splits them: still reading, and cannot
        // be read. "Loading" about a failed read describes a wait that never
        // ends (MYK9-642 N-F3).
        <Alert role={entryWindowTimezoneUnavailable ? 'alert' : 'status'}>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {entryWindowTimezoneUnavailable
              ? 'We could not load this show\u2019s details, so we cannot work out the entry fee. Check your connection and reload the page.'
              : "Loading show details before totalling this entry. The entry fee depends on the show's own timezone, so nothing is totalled until it is known."}
          </AlertDescription>
        </Alert>
      )}

      {entryWindowTimezoneReady && !capacityReady && (
        <Alert role={capacityError || capacityUnavailable ? 'alert' : 'status'}>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {/* capacityUnavailable covers the case capacityError misses: a
                paused query reports no error at all. Saying "checking" there
                describes a wait that never ends, and contradicts the blocking
                reason under the Next button. */}
            {capacityError || capacityUnavailable ? (
              <span className="flex flex-wrap items-center gap-2">
                <span>
                  We could not confirm class availability, so we cannot total this entry yet.
                </span>
                {onRetryAvailability && (
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    onClick={onRetryAvailability}
                  >
                    Try again
                  </Button>
                )}
              </span>
            ) : (
              'Checking class availability before confirming what is payable.'
            )}
          </AlertDescription>
        </Alert>
      )}

      {capacityReady && waitlistClassIds.size > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Full classes marked as wait-list requests are not charged now. Payment is due only if a
            spot is offered later.
          </AlertDescription>
        </Alert>
      )}

      {capacityReady && blockedClassIds.size > 0 && (
        <Alert role="alert" variant="destructive">
          <Info className="h-4 w-4" />
          <AlertDescription>
            A selected class is full and does not accept a wait list. Remove it from your selection
            to continue.
          </AlertDescription>
        </Alert>
      )}

      {/* Payment Method Selection */}
      <PaymentMethodSelector
        paymentMethod={effectivePaymentMethod}
        onPaymentMethodChange={handlePaymentMethodSelect}
        onPaymentDetailsChange={onPaymentDetailsChange}
        acceptedMethods={acceptedMethods}
        allowCardCheckout={cardCheckoutAvailable}
        cardCheckoutUnavailableReason={cardCheckoutUnavailableReason}
      />

      {/* Secretary Features. Fee-bearing, so it waits for the resolved zone. */}
      {entryWindowTimezoneReady && (
        <SecretaryPaymentManagement
          paymentStatus={paymentStatus}
          entryStatus={entryStatus}
          feeCalculation={feeCalculation}
          selectedDogs={selectedDogs}
          waiveFees={waiveFees}
          feeOverride={feeOverride}
          onWaiveFeesChange={onWaiveFeesChange ?? (() => {})}
          onFeeOverrideChange={onFeeOverrideChange ?? (() => {})}
          onPaymentMethodChange={onPaymentMethodChange}
          onPaymentStatusChange={onPaymentStatusChange}
          onEntryStatusChange={onEntryStatusChange}
        />
      )}

      {/* Entry Agreement */}
      {show?.organization && (
        <EntryAgreementSection
          organization={show.organization}
          agreed={agreed}
          onAgree={handleAgree}
          isOnBehalf={isOnBehalf}
        />
      )}
    </div>
  );
};
