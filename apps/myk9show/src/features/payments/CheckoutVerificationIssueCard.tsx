import { AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { CheckoutVerificationResult } from '@/lib/stripe';

type VerificationIssue = Extract<CheckoutVerificationResult, { success: false }>;

interface CheckoutVerificationIssueCardProps {
  issue: VerificationIssue;
  titleOverride?: string;
  canCheckStatus: boolean;
  isCheckingStatus: boolean;
  warnAgainstNewPayment: boolean;
  /** True while the page's bounded background re-check chain is running. */
  autoRecheckActive?: boolean;
  onCheckStatus: () => void;
}

export function CheckoutVerificationIssueCard({
  issue,
  titleOverride,
  canCheckStatus,
  isCheckingStatus,
  warnAgainstNewPayment,
  autoRecheckActive = false,
  onCheckStatus,
}: CheckoutVerificationIssueCardProps) {
  const title =
    titleOverride ??
    (issue.verificationStatus === 'processing'
      ? 'Payment Still Processing'
      : issue.verificationStatus === 'not_found'
        ? 'Payment Not Found Yet'
        : issue.verificationStatus === 'failed'
          ? 'Payment Not Completed'
          : issue.verificationStatus === 'refunded'
            ? 'Payment Refunded'
            : 'Payment Status Unavailable');

  // Only statuses that establish a payment attempt on THIS session may carry
  // the refund promise — 'unavailable' can mean a missing session or an auth
  // failure, where "your payment is refunded automatically" would be invented.
  const showRefundReassurance =
    issue.verificationStatus === 'processing' || issue.verificationStatus === 'not_found';

  return (
    <div className="bg-background pt-6">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-warning" />
            </div>
            <h2 className="text-xl font-semibold mb-2">{title}</h2>
            <p className="text-muted-foreground max-w-md mx-auto">{issue.error}</p>
            {warnAgainstNewPayment && (
              <p className="mt-3 text-foreground max-w-md mx-auto">
                <strong>Do not submit another payment.</strong> Check this payment again or look for
                the entry in My Entries.
              </p>
            )}
            {(showRefundReassurance || autoRecheckActive) && (
              <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
                {showRefundReassurance &&
                  'If your entries could not be placed, your payment is refunded automatically in full. '}
                {autoRecheckActive && 'This page keeps checking and will update on its own.'}
              </p>
            )}
            {issue.verificationStatus === 'not_found' && (
              <p className="mt-3 text-sm text-muted-foreground max-w-md mx-auto">
                If you paid while signed in to a different account, sign in as that account to see
                this payment.
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-3 justify-center sm:flex-row">
              <Button variant="outline" asChild>
                <Link to="/exhibitor/entries">View My Entries</Link>
              </Button>
              {canCheckStatus && (
                <Button onClick={onCheckStatus} disabled={isCheckingStatus}>
                  {isCheckingStatus ? 'Checking Payment Status…' : 'Check Payment Status'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
