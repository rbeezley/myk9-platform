/** Verifies the Stripe return and shows entry confirmation. */

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, Receipt, Calendar, Dog, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { type CheckoutVerificationResult } from '@/lib/stripe';
import { useCartStore } from '@/store/cartStore';
import { supabase } from '@/lib/supabase';
import {
  type CartSplitCheckoutSummary,
  readCartSplitCheckoutSummary,
} from '@/features/payments/cartSplitCheckoutStorage';
import { checkCheckoutSession } from '@/features/payments/checkoutVerification';
import { CheckoutVerificationIssueCard } from '@/features/payments/CheckoutVerificationIssueCard';
import { CONFIRMATION_NUMBER_LABEL } from '@/features/registration/confirmationNumberDisplay';

interface EntryDetails {
  id: string;
  dog_name: string;
  class_name: string;
  class_level: string | null;
  // Armband is claimed at registration (per dog, per show), so it is usually
  // already known here. Null only when the claim failed or hasn't run yet.
  armband_number: string | null;
}

type SuccessfulCheckoutVerification = Extract<CheckoutVerificationResult, { success: true }>;
type VerificationIssue = Extract<CheckoutVerificationResult, { success: false }>;

const MAX_VERIFICATION_ATTEMPTS = 11;
const VERIFICATION_POLL_INTERVAL_MS = 2000;

export default function CheckoutSuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');
  const isWaitlistOnly = searchParams.get('waitlist') === '1';
  const splitCheckoutId = searchParams.get('split');
  const [splitSummary, setSplitSummary] = useState<CartSplitCheckoutSummary | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [verificationIssue, setVerificationIssue] = useState<VerificationIssue | null>(null);
  const [orderDetails, setOrderDetails] = useState<{
    orderId?: string;
    showName?: string;
    showId?: string;
    totalAmountCents?: number;
    entryIds?: string[];
    checkoutOutcome?: 'paid_entries' | 'full_overflow_refund';
    refundAmount?: number;
    refundStatus?: 'issued' | 'processing';
    confirmationNumber?: string;
  } | null>(null);
  const [entries, setEntries] = useState<EntryDetails[]>([]);

  const activeCartId = useCartStore(state => state.cart?.id ?? null);
  const resetCart = useCartStore(state => state.reset);
  const activeCartIdRef = useRef(activeCartId);
  const verificationGenerationRef = useRef(0);
  const manualCheckInFlightRef = useRef(false);
  activeCartIdRef.current = activeCartId;

  const completeCheckout = useCallback(
    (result: SuccessfulCheckoutVerification, generation: number) => {
      if (verificationGenerationRef.current !== generation) return;

      const nextSplitSummary = splitCheckoutId
        ? readCartSplitCheckoutSummary(splitCheckoutId)
        : null;
      setOrderDetails({
        ...(result.orderId !== undefined && { orderId: result.orderId }),
        ...(result.showName !== undefined && { showName: result.showName }),
        ...(result.showId !== undefined && { showId: result.showId }),
        ...(result.totalAmountCents !== undefined && { totalAmountCents: result.totalAmountCents }),
        ...(result.entryIds !== undefined && { entryIds: result.entryIds }),
        ...(result.checkoutOutcome !== undefined && {
          checkoutOutcome: result.checkoutOutcome,
        }),
        ...(result.refundAmount !== undefined && { refundAmount: result.refundAmount }),
        ...(result.refundStatus !== undefined && { refundStatus: result.refundStatus }),
        ...(result.confirmationNumber !== undefined && {
          confirmationNumber: result.confirmationNumber,
        }),
      });
      if (
        nextSplitSummary &&
        nextSplitSummary.showId === result.showId &&
        nextSplitSummary.confirmedEntryCount === (result.entryIds?.length ?? 0)
      ) {
        setSplitSummary(nextSplitSummary);
      } else {
        setSplitSummary(null);
      }

      setVerificationIssue(null);
      setIsLoading(false);
      const currentCartId = activeCartIdRef.current;
      if (!currentCartId || (result.cartId && currentCartId === result.cartId)) {
        resetCart();
      }

      if (result.entryIds && result.entryIds.length > 0) {
        const entryIds = result.entryIds;
        void (async () => {
          try {
            const { data } = await supabase
              .from('entries')
              .select(
                `
                  id,
                  armband,
                  dogs:dog_id (name, call_name),
                  classes:class_id (name, level)
                `
              )
              .in('id', entryIds);

            if (data && verificationGenerationRef.current === generation) {
              setEntries(
                data.map(e => ({
                  id: e.id,
                  dog_name:
                    (e.dogs as { call_name?: string; name: string })?.call_name ||
                    (e.dogs as { name: string })?.name ||
                    'Unknown',
                  class_name: (e.classes as { name: string })?.name || 'Unknown',
                  class_level: (e.classes as { level?: string })?.level || null,
                  armband_number: (e.armband as string | null) ?? null,
                }))
              );
            }
          } catch {
            // Payment confirmation is authoritative; entry details are optional.
          }
        })();
      }
    },
    [resetCart, splitCheckoutId]
  );

  useLayoutEffect(() => {
    const generation = verificationGenerationRef.current + 1;
    verificationGenerationRef.current = generation;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    setIsLoading(true);
    setIsCheckingStatus(false);
    setVerificationIssue(null);
    setOrderDetails(null);
    setEntries([]);
    setSplitSummary(null);

    const verifyPayment = async () => {
      if (!sessionId) {
        const pendingSummary = splitCheckoutId
          ? readCartSplitCheckoutSummary(splitCheckoutId)
          : null;
        if (isWaitlistOnly && pendingSummary && pendingSummary.confirmedEntryCount === 0) {
          setOrderDetails({
            showId: pendingSummary.showId,
          });
          setSplitSummary(pendingSummary);
          resetCart();
          setIsLoading(false);
          return;
        }
        setVerificationIssue({
          success: false,
          verificationStatus: 'unavailable',
          error: isWaitlistOnly
            ? 'We could not show your wait list confirmation. No payment was submitted.'
            : 'No checkout session was found, so we could not confirm this payment.',
        });
        setIsLoading(false);
        return;
      }

      // Stripe can redirect before the webhook-created order is visible. Poll
      // sequentially so slow checks never overlap, then land in a stable state.
      for (let attempt = 1; attempt <= MAX_VERIFICATION_ATTEMPTS; attempt += 1) {
        const result = await checkCheckoutSession(sessionId);
        if (verificationGenerationRef.current !== generation) return;

        if (result.success) {
          completeCheckout(result, generation);
          return;
        }

        if (result.verificationStatus !== 'processing' || attempt === MAX_VERIFICATION_ATTEMPTS) {
          setVerificationIssue(result);
          setIsLoading(false);
          return;
        }

        await new Promise<void>(resolve => {
          timeoutId = setTimeout(resolve, VERIFICATION_POLL_INTERVAL_MS);
        });
      }
    };

    void verifyPayment();

    return () => {
      if (verificationGenerationRef.current === generation) {
        verificationGenerationRef.current += 1;
      }
      manualCheckInFlightRef.current = false;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [completeCheckout, isWaitlistOnly, resetCart, sessionId, splitCheckoutId]);

  const handleCheckPaymentStatus = async () => {
    if (!sessionId || manualCheckInFlightRef.current) return;

    manualCheckInFlightRef.current = true;
    const generation = verificationGenerationRef.current;
    setIsCheckingStatus(true);

    try {
      const result = await checkCheckoutSession(sessionId);
      if (verificationGenerationRef.current !== generation) return;
      if (result.success) {
        completeCheckout(result, generation);
      } else {
        setVerificationIssue(result);
      }
    } finally {
      if (verificationGenerationRef.current === generation) {
        manualCheckInFlightRef.current = false;
        setIsCheckingStatus(false);
      }
    }
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };
  const paidEntryCount = orderDetails?.entryIds?.length ?? entries.length;
  const confirmedEntryCount = splitSummary?.confirmedEntryCount ?? paidEntryCount;
  const waitlistEntries = splitSummary?.waitlistEntries ?? [];
  const isWaitlistOnlySuccess = confirmedEntryCount === 0 && waitlistEntries.length > 0;
  const isFullOverflowRefund = orderDetails?.checkoutOutcome === 'full_overflow_refund';
  const pageTitle = isWaitlistOnlySuccess
    ? 'Added to Wait List'
    : isFullOverflowRefund
      ? 'Payment Refunded'
      : 'Entry Submitted Successfully!';
  const pageDescription = isWaitlistOnlySuccess
    ? 'Your wait list request has been recorded for the full classes in this cart.'
    : isFullOverflowRefund
      ? 'The remaining spots filled before your paid entries could be created.'
      : 'Your payment has been processed and your entries are confirmed.';

  if (isLoading) {
    return (
      <div className="bg-background pt-6">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <Card role="status" aria-label="Verifying payment">
            <CardContent className="py-16 text-center">
              <Skeleton className="mx-auto mb-4 h-12 w-12 rounded-full" />
              <Skeleton className="mx-auto mb-3 h-6 w-56" />
              <Skeleton className="mx-auto h-4 w-80 max-w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (verificationIssue) {
    return (
      <CheckoutVerificationIssueCard
        issue={verificationIssue}
        {...(isWaitlistOnly &&
          !sessionId && { titleOverride: 'Wait List Confirmation Unavailable' })}
        canCheckStatus={
          Boolean(sessionId) &&
          (verificationIssue.verificationStatus === 'processing' ||
            verificationIssue.verificationStatus === 'unavailable')
        }
        isCheckingStatus={isCheckingStatus}
        warnAgainstNewPayment={
          Boolean(sessionId) &&
          (verificationIssue.verificationStatus === 'processing' ||
            verificationIssue.verificationStatus === 'unavailable')
        }
        onCheckStatus={handleCheckPaymentStatus}
      />
    );
  }

  return (
    <div className="bg-background pt-6">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <Card>
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-success " />
            </div>
            <CardTitle className="text-2xl">{pageTitle}</CardTitle>
            <p className="text-muted-foreground mt-2">{pageDescription}</p>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Confirmation # */}
            {orderDetails?.confirmationNumber && (
              <div className="rounded-lg bg-success/10 border border-success/30 p-4 text-center">
                <p className="text-xs text-muted-foreground tracking-wide mb-1">
                  {CONFIRMATION_NUMBER_LABEL}
                </p>
                {/* break-all: pi_… fallback ids are 27 chars and must wrap on mobile */}
                <p className="text-xl font-mono font-bold break-all text-success ">
                  {orderDetails.confirmationNumber}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Save this number for your records
                </p>
              </div>
            )}

            {/* Order Summary */}
            {orderDetails?.totalAmountCents !== undefined && (
              <Alert className="bg-muted/50">
                <Receipt className="h-4 w-4" />
                <AlertDescription>
                  <div className="flex justify-between items-center">
                    <span>Order Total</span>
                    <span className="font-semibold">
                      {orderDetails.totalAmountCents
                        ? formatCurrency(orderDetails.totalAmountCents)
                        : '—'}
                    </span>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {isFullOverflowRefund && (
              <Alert className="bg-muted/50">
                <Receipt className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center gap-3">
                      <span>Full Refund</span>
                      <span className="font-semibold">
                        {orderDetails?.refundAmount
                          ? formatCurrency(orderDetails.refundAmount)
                          : 'Processing'}
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      {orderDetails?.refundStatus === 'issued'
                        ? 'Your payment has been fully refunded.'
                        : 'Your full refund is being issued.'}
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {splitSummary && (confirmedEntryCount > 0 || waitlistEntries.length > 0) && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <span className="font-semibold">Entry Summary: </span>
                  <span>
                    Paid: {confirmedEntryCount} {confirmedEntryCount === 1 ? 'entry' : 'entries'}
                  </span>
                  <span>{' · '}</span>
                  <span>
                    Waitlisted: {waitlistEntries.length}{' '}
                    {waitlistEntries.length === 1 ? 'entry' : 'entries'}
                  </span>
                  {waitlistEntries.length > 0 && (
                    <>
                      <span>{'. Positions: '}</span>
                      {waitlistEntries.map((entry, index) => (
                        <span key={entry.id}>
                          {`${entry.className ?? ''} #${entry.position}`.trimStart()}
                          {index < waitlistEntries.length - 1 ? ', ' : '.'}
                        </span>
                      ))}
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Show Info */}
            {orderDetails?.showName && (
              <div className="flex items-center gap-3 p-4 rounded-lg border">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Entering</p>
                  <p className="font-medium">{orderDetails.showName}</p>
                </div>
              </div>
            )}

            <Separator />

            {/* Entry Details */}
            {entries.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Dog className="h-4 w-4" />
                  Your Entries ({entries.length})
                </h3>
                <div className="space-y-2">
                  {entries.map(entry => (
                    <div
                      key={entry.id}
                      className="flex justify-between items-center p-3 rounded-lg bg-muted/30"
                    >
                      <div>
                        <p className="font-medium">{entry.dog_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {entry.class_name}
                          {entry.class_level && ` - ${entry.class_level}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.armband_number && (
                          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">
                            Armband #{entry.armband_number}
                          </span>
                        )}
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Next Steps */}
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-2">What happens next?</p>
              <ul className="list-disc list-inside space-y-1">
                {!isWaitlistOnlySuccess && !isFullOverflowRefund && (
                  <li>You'll receive a confirmation email shortly</li>
                )}
                {isFullOverflowRefund && <li>No paid entries were created for this checkout.</li>}
                {isFullOverflowRefund && (
                  <li>
                    {orderDetails?.refundStatus === 'issued'
                      ? 'The full refund has been issued to your original payment method.'
                      : 'The full refund is being issued to your original payment method.'}
                  </li>
                )}
                {confirmedEntryCount > 0 && !isFullOverflowRefund && (
                  <li>Check in at the venue on the day of the show</li>
                )}
                {confirmedEntryCount > 0 &&
                !isFullOverflowRefund &&
                entries.length > 0 &&
                entries.every(e => e.armband_number) ? (
                  <li>Bring your armband number(s) shown above when you check in</li>
                ) : confirmedEntryCount > 0 && !isFullOverflowRefund ? (
                  <li>
                    Your armband number will be confirmed by the show secretary before show day
                  </li>
                ) : !isFullOverflowRefund ? (
                  <li>We&apos;ll notify you if a spot opens up from the wait list.</li>
                ) : null}
              </ul>
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-2">
            <Button className="w-full" onClick={() => navigate('/my-entries')}>
              View My Shows
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            {orderDetails?.showId && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate(`/shows/${orderDetails.showId}`)}
              >
                View Show Details
              </Button>
            )}
            <Button variant="ghost" className="w-full" onClick={() => navigate('/shows')}>
              Browse More Shows
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
