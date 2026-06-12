import { useEffect, useRef, useState } from 'react';
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

const PAYOUT_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  completed: { label: 'Paid', className: 'bg-green-600 text-white hover:bg-green-600' },
  processing: { label: 'Sending', className: '' },
  pending: { label: 'Waiting for account', className: '' },
  failed: { label: 'Retrying', className: '' },
};

const RETURN_PATH = '/club-admin/payments';

// INTENT: The pre-flight checklist exists to pre-answer the SSN fear and
// prevent mid-form abandonment by non-technical club treasurers. Do not
// collapse the connect button into a direct redirect — the treasurer must see
// what they'll need BEFORE leaving for Stripe's hosted form.
const CHECKLIST_ITEMS = [
  'Your club’s EIN (it’s on the club’s tax paperwork)',
  'The club’s legal name and mailing address',
  'One of the club’s checks — use the club’s bank account, not a personal one',
  'The treasurer’s name, date of birth, home address, and the last 4 digits of their Social Security number',
];

interface ClubPaymentsCardProps {
  clubId: string;
}

export function ClubPaymentsCard({ clubId }: ClubPaymentsCardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const accountQuery = useClubStripeAccount(clubId);
  const payoutHistory = useClubPayoutHistory(clubId);
  const [showChecklist, setShowChecklist] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  // Returning from Stripe (?connect=return|refresh): refresh the account row
  // so the card reflects whatever the treasurer just completed.
  const connectParam = searchParams.get('connect');
  const { refetch } = accountQuery;
  useEffect(() => {
    if (!connectParam) return;
    refetch();
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('connect');
        return next;
      },
      { replace: true }
    );
  }, [connectParam, refetch, setSearchParams]);

  const handleContinueToStripe = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setConnectError(null);
    try {
      const url = await startConnectOnboarding(clubId, RETURN_PATH);
      window.location.assign(url);
    } catch (error) {
      setConnectError(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      inFlightRef.current = false;
    }
  };

  const account = accountQuery.data;
  const notConnected = !account;
  const onboardingIncomplete = !!account && !account.onboarding_complete;
  const inReview = !!account && account.onboarding_complete && !account.payouts_enabled;
  const enabled = !!account && account.payouts_enabled;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Payments</CardTitle>
          </div>
          {enabled && (
            <Badge className="bg-green-600 text-white hover:bg-green-600">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Payouts enabled
            </Badge>
          )}
          {inReview && (
            <Badge variant="secondary">
              <Clock className="mr-1 h-3.5 w-3.5" />
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
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Couldn&apos;t load your payment account status.{' '}
              <Button variant="link" className="h-auto p-0" onClick={() => accountQuery.refetch()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {connectError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {connectError}{' '}
              <Button variant="link" className="h-auto p-0" onClick={handleContinueToStripe}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!accountQuery.isLoading && !accountQuery.isError && (
          <>
            {enabled && (payoutHistory.data?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">
                You&apos;re all set. Payouts appear here after your first show closes.
              </p>
            )}

            {(payoutHistory.data?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Show payouts</h4>
                <ul className="divide-y rounded-lg border">
                  {payoutHistory.data!.map(payout => {
                    const status = PAYOUT_STATUS_LABELS[payout.status] ?? {
                      label: payout.status,
                      className: '',
                    };
                    return (
                      <li key={payout.id} className="flex items-center justify-between px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {payout.show?.name ?? 'Show'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(payout.completed_at ?? payout.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            ${(payout.amount_cents / 100).toFixed(2)}
                          </span>
                          <Badge
                            variant={payout.status === 'completed' ? 'default' : 'secondary'}
                            className={status.className}
                          >
                            {status.label}
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
                  Stripe is verifying your club&apos;s details — this usually finishes within a
                  day or two, and we&apos;ll enable payouts automatically the moment it clears.
                  If Stripe asked you for more information, you can add it here.
                </p>
                {/* Stripe can pause a submitted account with "actions required"
                    (missing address/DOB/etc.) — the resume link is the only way
                    the treasurer can un-stick it. Resuming is harmless when
                    nothing is due: Stripe just confirms they're all set.
                    2026-06-10 walkthrough finding. */}
                <Button variant="outline" onClick={handleContinueToStripe}>
                  Add missing information
                </Button>
              </div>
            )}

            {onboardingIncomplete && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Your setup with Stripe isn&apos;t finished yet. You can pick up right where you
                  left off.
                </p>
                <Button onClick={handleContinueToStripe}>Finish setting up</Button>
              </div>
            )}

            {notConnected && !showChecklist && (
              <Button onClick={() => setShowChecklist(true)}>Connect payment account</Button>
            )}

            {notConnected && showChecklist && (
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
                  <Button onClick={handleContinueToStripe}>Continue to Stripe</Button>
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
  );
}
