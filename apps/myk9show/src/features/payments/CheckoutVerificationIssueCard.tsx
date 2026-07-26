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
  onCheckStatus: () => void;
}

export function CheckoutVerificationIssueCard({
  issue,
  titleOverride,
  canCheckStatus,
  isCheckingStatus,
  warnAgainstNewPayment,
  onCheckStatus,
}: CheckoutVerificationIssueCardProps) {
  const title =
    titleOverride ??
    (issue.verificationStatus === 'processing'
      ? 'Payment Still Processing'
      : issue.verificationStatus === 'failed'
        ? 'Payment Not Completed'
        : issue.verificationStatus === 'refunded'
          ? 'Payment Refunded'
          : 'Payment Status Unavailable');

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
