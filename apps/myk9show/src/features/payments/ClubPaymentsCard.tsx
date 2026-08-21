import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Landmark, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import {
  useClubStripeAccount,
  useClubPayoutHistory,
  startConnectOnboarding,
} from './useClubStripeAccount';
import { resolvePayoutBadge, type PayoutsAccountState } from './payoutBadge';
import { useConnectReturn, useClearConnectParam } from './useConnectReturn';
import { ClubFinancialReconciliationCard } from '@/features/financial/components/ClubFinancialReconciliationCard';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/** Cents -> a fully formatted USD string with thousands separators ($1,240.00). */
function formatPayoutAmount(amountCents: number): string {
  return currencyFormatter.format(amountCents / 100);
}

const RETURN_PATH = '/club-admin/payments';

// INTENT: The pre-flight checklist exists to pre-answer the SSN fear and
// prevent mid-form abandonment by non-technical club treasurers. Do not
// collapse the connect button into a direct redirect — the treasurer must see
// what they'll need BEFORE leaving for Stripe's hosted form.
const CHECKLIST_ITEMS = [
  'Your club’s EIN (it’s on the club’s tax paperwork)',
  'The club’s legal name and mailing address',
  'One of the club’s checks, so you can use the club’s bank account, not a personal one',
  'The treasurer’s name, date of birth, home address, and the last 4 digits of their Social Security number',
];

interface ClubPaymentsCardProps {
  clubId: string;
}

export function ClubPaymentsCard({ clubId }: ClubPaymentsCardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const accountQuery = useClubStripeAccount(clubId);
  const account = accountQuery.data;
  // `isSuccess` is the only state that means "we have a real answer". Deriving
  // from `!!account` instead folds loading, error, and never-asked into the same
  // `false` as a genuinely un-onboarded club, and that false claim then reaches
  // the treasurer as a badge (see PayoutsAccountState).
  const accountState: PayoutsAccountState = !accountQuery.isSuccess
    ? 'unknown'
    : account?.payouts_enabled
      ? 'enabled'
      : 'not-enabled';
  const enabled = accountState === 'enabled';
  // Only load payout history once payouts are actually enabled. Otherwise a
  // failed history fetch would surface a "Couldn't load your payout history"
  // error beside the connect/setup flow for a club that isn't connected yet.
  const payoutHistory = useClubPayoutHistory(enabled ? clubId : undefined);
  const [showChecklist, setShowChecklist] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isStartingOnboarding, setIsStartingOnboarding] = useState(false);
  const inFlightRef = useRef(false);

  // Returning from Stripe (?connect=return|refresh): the account row is written
  // by a webhook, so absence right after the redirect means "not yet", not "no".
  const connectParam = searchParams.get('connect');
  const { refetch } = accountQuery;
  const clearConnectParam = useClearConnectParam(setSearchParams);
  const { status: connectReturnStatus } = useConnectReturn({
    connectParam,
    accountPresent: !!account,
    refetchAccount: refetch,
    clearConnectParam,
  });

  const handleContinueToStripe = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsStartingOnboarding(true);
    setConnectError(null);
    try {
      const url = await startConnectOnboarding(clubId, RETURN_PATH);
      window.location.assign(url);
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : 'Something went wrong');
      // Only released on the failure path: on success the browser is navigating
      // away, and re-enabling the button would invite a second click during the
      // hand-off to Stripe.
      setIsStartingOnboarding(false);
    } finally {
      inFlightRef.current = false;
    }
  };

  const notConnected = !account;
  const onboardingIncomplete = !!account && !account.onboarding_complete;
  const inReview = !!account && account.onboarding_complete && !account.payouts_enabled;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <CardTitle>Bank account</CardTitle>
            </div>
            {enabled && (
              <Badge className="shrink-0 bg-success text-success-foreground hover:bg-success">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Payouts enabled
              </Badge>
            )}
            {inReview && (
              <Badge variant="secondary" className="shrink-0">
                <Clock className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Under review by Stripe
              </Badge>
            )}
          </div>
          <CardDescription>
            {enabled
              ? 'Entry fees from your shows are deposited to your club’s bank account automatically after each show.'
              : 'Connect your club’s bank account so entry fees can be deposited automatically after each show.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {accountQuery.isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-4 w-72" />
            </div>
          )}

          {accountQuery.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>
                Couldn&apos;t load your payment account status.{' '}
                <Button
                  variant="link"
                  className="inline-flex min-h-[44px] items-center p-0"
                  onClick={() => accountQuery.refetch()}
                >
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {connectError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>
                {connectError}{' '}
                <Button
                  variant="link"
                  className="inline-flex min-h-[44px] items-center p-0"
                  onClick={handleContinueToStripe}
                >
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {accountQuery.isSuccess && (
            <>
              {enabled &&
                !payoutHistory.isLoading &&
                !payoutHistory.isError &&
                (payoutHistory.data?.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground">
                    You&apos;re all set. Payouts appear here after your first show closes.
                  </p>
                )}

              {enabled && payoutHistory.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  <AlertDescription>
                    Couldn&apos;t load your payout history.{' '}
                    <Button
                      variant="link"
                      className="inline-flex min-h-[44px] items-center p-0"
                      onClick={() => payoutHistory.refetch()}
                    >
                      Try again
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {enabled && (payoutHistory.data?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Show payouts</h4>
                  <p className="text-xs text-muted-foreground">
                    Amounts shown are deposited to your club&apos;s bank account.
                  </p>
                  <ul className="divide-y rounded-lg border">
                    {payoutHistory.data!.map(payout => {
                      const badge = resolvePayoutBadge(payout, accountState);
                      const isPaid = !!payout.completed_at;
                      const dateLabel = isPaid ? 'Paid' : 'Started';
                      const dateValue = new Date(
                        payout.completed_at ?? payout.created_at
                      ).toLocaleDateString();
                      return (
                        <li
                          key={payout.id}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {payout.show?.name ?? 'Show'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {dateLabel} {dateValue}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-sm font-semibold tabular-nums">
                              {formatPayoutAmount(payout.amount_cents)}
                            </span>
                            <Badge variant={badge.variant} className={badge.className}>
                              {badge.label}
                            </Badge>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {inReview && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Stripe is verifying your club&apos;s details. This usually finishes within a day
                    or two, and we&apos;ll enable payouts automatically the moment it clears. If
                    Stripe asked you for more information, you can add it here.
                  </p>
                  {/* Stripe can pause a submitted account with "actions required"
                    (missing address/DOB/etc.) — the resume link is the only way
                    the treasurer can un-stick it. Resuming is harmless when
                    nothing is due: Stripe just confirms they're all set.
                    2026-06-10 walkthrough finding. */}
                  <Button
                    variant="outline"
                    onClick={handleContinueToStripe}
                    disabled={isStartingOnboarding}
                  >
                    {isStartingOnboarding ? 'Opening Stripe' : 'Add missing information'}
                  </Button>
                </div>
              )}

              {onboardingIncomplete && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Your setup with Stripe isn&apos;t finished yet. You can pick up right where you
                    left off.
                  </p>
                  <Button onClick={handleContinueToStripe} disabled={isStartingOnboarding}>
                    {isStartingOnboarding ? 'Opening Stripe' : 'Finish setting up'}
                  </Button>
                </div>
              )}

              {notConnected && connectReturnStatus === 'confirming' && (
                <div className="space-y-3" role="status">
                  <p className="text-sm text-muted-foreground">
                    Confirming your setup with Stripe. This usually takes a few seconds.
                  </p>
                </div>
              )}

              {notConnected && connectReturnStatus === 'timed-out' && (
                <div className="space-y-3" role="status">
                  <p className="text-sm text-muted-foreground">
                    Stripe hasn&apos;t confirmed your setup yet. This can take another minute to
                    come through, and nothing you entered was lost.
                  </p>
                  <Button variant="outline" onClick={() => void refetch()}>
                    Check again
                  </Button>
                </div>
              )}

              {notConnected && connectReturnStatus === 'link-expired' && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Your Stripe setup link expired before you finished. Nothing you entered was
                    lost, and you can pick up where you left off.
                  </p>
                  <Button onClick={handleContinueToStripe} disabled={isStartingOnboarding}>
                    {isStartingOnboarding ? 'Opening Stripe' : 'Continue to Stripe'}
                  </Button>
                </div>
              )}

              {notConnected && connectReturnStatus === 'idle' && !showChecklist && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    No bank account is connected yet, so your club can&apos;t receive entry fees.
                    Connecting takes about 10 minutes.
                  </p>
                  <Button onClick={() => setShowChecklist(true)}>Connect payment account</Button>
                </div>
              )}

              {notConnected && connectReturnStatus === 'idle' && showChecklist && (
                <div className="space-y-4 rounded-lg border p-4">
                  <div>
                    <h4 className="font-medium">Before you start, have these four things ready:</h4>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                      {CHECKLIST_ITEMS.map(item => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Stripe is required by federal banking law to verify the identity of the person
                    opening the account. myK9Show never sees or stores this information.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    This takes about 10 minutes. You can safely stop and resume later.
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={handleContinueToStripe} disabled={isStartingOnboarding}>
                      {isStartingOnboarding ? 'Opening Stripe' : 'Continue to Stripe'}
                    </Button>
                    <Button variant="ghost" onClick={() => setShowChecklist(false)}>
                      Not now
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      {/* Rendered regardless of `enabled`. A club can have paid orders and money
          pending settlement BEFORE Stripe onboarding finishes — gating the whole
          card on payouts_enabled hid charge verification and net-to-club exactly
          when settlement was pending and the treasurer most wanted to see it.
          `accountState` governs the payout BADGE WORDING inside the card
          (Scheduled vs Waiting for account vs Not sent yet), not whether it
          renders at all. It is deliberately a tri-state: this card sits outside
          the guard above, so it renders while the account query is still in
          flight, and a boolean would assert "not onboarded" the whole time. */}
      <ClubFinancialReconciliationCard
        clubId={clubId}
        accountState={accountState}
        payoutHistory={payoutHistory.data}
      />
    </div>
  );
}
