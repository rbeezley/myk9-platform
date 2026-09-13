/**
 * The wizard's single answer to "how is this entry being paid for?".
 *
 * These inputs used to be read inside `PaymentStep`, which derived the effective
 * method privately and only wrote it back to parent state in an effect. Until
 * that effect ran, the entries panel — which reads parent state — quoted
 * "Credit/Debit Card" and a service fee while the controls underneath showed
 * Check (Codex #2210 round 5 P2). Lifting the reads to the page gives the panel
 * and the step the SAME value in the same render.
 *
 * No new data path: the same three hooks PaymentStep already called, moved.
 */

import { useShowStore } from '@/store/showStore';
import { useRegistrationPermissions } from '@/hooks/useRegistrationPermissions';
import { useClubStripePaymentReadiness } from '@/features/payments/useClubStripeAccount';
import type { Show } from '@/types/show-types';
import type { PaymentMethod } from '@/types/show-registration-types';
import { getEffectivePaymentMethod, type AcceptedPaymentMethods } from './utils';

export interface PaymentMethodResolution {
  /** The method actually in force — the card fallback already applied. */
  effectivePaymentMethod: PaymentMethod | '';
  acceptedMethods: AcceptedPaymentMethods;
  cardCheckoutAvailable: boolean;
  /** The club's Stripe readiness is still in flight; a card pick may yet stand. */
  accountCheckPending: boolean;
  /** Why card is not on offer, or undefined when it is (or the user is staff). */
  cardCheckoutUnavailableReason: string | undefined;
  /** Staff entering on an exhibitor's behalf. Also gates the entry agreement. */
  isOnBehalf: boolean;
  /** The show record this lookup already resolved — reused for fees and the
   *  entry agreement rather than looked up a second time. */
  show: Show | undefined;
}

export function usePaymentMethodResolution(
  showId: string | undefined,
  paymentMethod: PaymentMethod | ''
): PaymentMethodResolution {
  const { shows = [] } = useShowStore();
  const { isSecretary, isClubAdmin, isSiteAdmin } = useRegistrationPermissions();
  // On-behalf organizers cannot pay by card: Stripe checkout runs under the
  // logged-in user and stripe-checkout 403s any cart they don't own. They
  // record check/cash/secretary_paid/waived instead.
  const isOnBehalf = isSecretary || isClubAdmin || isSiteAdmin;

  const show = showId ? shows.find(s => s.id === showId) : undefined;
  const clubStripeAccountQuery = useClubStripePaymentReadiness(show?.clubId);
  const cardCheckoutAvailable =
    !isOnBehalf && clubStripeAccountQuery.isSuccess && clubStripeAccountQuery.data === true;
  const acceptedMethods: AcceptedPaymentMethods = {
    check: show?.acceptCheckPayments ?? true,
    cash: show?.acceptCashPayments ?? true,
  };

  return {
    effectivePaymentMethod: getEffectivePaymentMethod({
      paymentMethod,
      acceptedMethods,
      cardCheckoutAvailable,
    }),
    acceptedMethods,
    cardCheckoutAvailable,
    accountCheckPending:
      !isOnBehalf && (clubStripeAccountQuery.isPending || clubStripeAccountQuery.isFetching),
    isOnBehalf,
    show,
    cardCheckoutUnavailableReason: isOnBehalf
      ? undefined
      : !show?.clubId
        ? "Online card payment isn't available because this show has no hosting club payment account. Choose check or cash instead."
        : clubStripeAccountQuery.isPending || clubStripeAccountQuery.isFetching
          ? 'Checking online payment availability for this club.'
          : "Online card payment isn't available for this club. Choose check or cash instead.",
  };
}
