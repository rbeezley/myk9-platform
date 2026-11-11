import React, { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { PaymentMethod } from '@/types/show-registration-types';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { parseJuniorHandlerFee } from './utils';
import { useEntryWindowTimezone } from '@/hooks/useEntryWindowTimezone';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { JuniorHandlerDeclarationControl } from './JuniorHandlerDeclaration';
import { SecretaryPaymentManagement } from './SecretaryPaymentManagement';
import { EntryAgreementSection } from './EntryAgreementSection';
import type { PaymentStepProps } from './types';

/**
 * Top-level PaymentStep component that composes the sub-components for
 * registration fee summary, payment method selection, secretary management, and payment summary.
 */
export const PaymentStep: React.FC<PaymentStepProps> = ({
  selectedDogs,
  paymentMethod,
  onPaymentMethodChange,
  onPaymentMethodClear,
  onPaymentDetailsChange,
  getPaymentDetails,
  onAgreementChange,
  agreedToEntryAgreement = false,
  preTickAgreement = false,
  showId,
  capacityReady = true,
  capacityError,
  capacityUnavailable,
  onRetryAvailability,
  waitlistClassIds = new Set(),
  blockedClassIds = new Set(),
  paymentResolution,
  juniorDeclaration,
}) => {
  const { dogs } = useDogStoreCompat();
  // Resolved here, from the same hook the wizard's Next gate and the class step
  // use, rather than threaded down as a prop: one rule, one reader, no chance of
  // this step and the gate disagreeing about whether the zone is known.
  const { isReady: entryWindowTimezoneReady, isUnavailable: entryWindowTimezoneUnavailable } =
    useEntryWindowTimezone(showId);

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
    canChargeJuniorFee,
    canUseDeskPaymentActions,
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

  // This step totals nothing itself (MYK9-1822): the one total on screen is the
  // entries panel's, from the page's `liveFeeCalculation`, which prices in the
  // show's own timezone and withholds money until that zone is known (MYK9-642).
  const juniorFeeOffered = juniorDeclaration?.canDeclare ? parseJuniorHandlerFee(show) : null;

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
              ? 'We could not load this show\u2019s details, so we cannot work out the entry fee. Check your connection, then restart the app.'
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
            Good news: joining a waitlist is free. You&rsquo;re never charged just for joining, so
            the waitlist classes in your selection cost nothing today. If a spot opens, we&rsquo;ll
            let you know, and you pay only if you decide to claim it.
          </AlertDescription>
        </Alert>
      )}

      {capacityReady && blockedClassIds.size > 0 && (
        <Alert role="alert" variant="destructive">
          <Info className="h-4 w-4" />
          <AlertDescription>
            A selected class is full and does not accept a waitlist. Remove it from your selection
            to continue.
          </AlertDescription>
        </Alert>
      )}

      {/* Payment Method Selection */}
      <PaymentMethodSelector
        paymentMethod={effectivePaymentMethod}
        onPaymentMethodChange={handlePaymentMethodSelect}
        onPaymentDetailsChange={onPaymentDetailsChange}
        getInitialDetails={getPaymentDetails}
        acceptedMethods={acceptedMethods}
        allowCardCheckout={cardCheckoutAvailable}
        cardCheckoutUnavailableReason={cardCheckoutUnavailableReason}
        juniorFee={canChargeJuniorFee ? parseJuniorHandlerFee(show) : null}
        allowFreeEntry={canUseDeskPaymentActions}
      />

      {/* MYK9-879: card checkout only. Fee-bearing, so it waits for the resolved
          zone: the tier it is cheaper than is not known until then. */}
      {entryWindowTimezoneReady && juniorDeclaration && juniorFeeOffered !== null && (
        <JuniorHandlerDeclarationControl
          fee={juniorFeeOffered}
          dogs={selectedDogs.flatMap(dogId => dogs.filter(dog => dog.id === dogId))}
          declaration={juniorDeclaration}
          organization={show?.organization}
        />
      )}

      {/* Secretary desk actions. No money on it, so it needs no resolved zone;
          its paid and free shortcuts call the list's own handler (MYK9-1822). */}
      {canUseDeskPaymentActions && (
        <SecretaryPaymentManagement
          paymentMethod={effectivePaymentMethod}
          onPaymentMethodChange={handlePaymentMethodSelect}
        />
      )}

      {/* Entry Agreement */}
      {show?.organization && (
        <EntryAgreementSection
          organization={show.organization}
          agreed={agreed}
          onAgree={handleAgree}
          isOnBehalf={isOnBehalf}
          preTick={preTickAgreement}
        />
      )}
    </div>
  );
};
