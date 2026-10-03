// Refunds awaiting approval, on the /admin/health board beside the unresolved
// alerts that announce them (MYK9-876). Extends the existing money-path
// surface rather than adding an admin page.
//
// INTENT: refunds are never automatic. A person reads what is owed and why,
// then makes one explicit, confirmed approval per refund; there is no bulk
// approve, because each row is a separate movement of the platform's money.
// A charge honored another way is retired with "Resolve without refund"
// (note required), never left pending for someone to approve later.

import { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { BoardCard, Eyebrow } from './SystemHealth/HealthBoardPrimitives';
import { ResolveWithoutRefundButton } from './ResolveWithoutRefundButton';
import {
  useApproveRefundRequest,
  useRefundRequests,
} from '@/features/admin-system-health/useRefundRequests';
import {
  approvalSuccessMessage,
  approveActionLabel,
  canResolveWithoutRefund,
  formatRefundAmount,
  refundKindLabel,
  type RefundRequest,
} from '@/features/admin-system-health/refundRequestsPresentation';

function RefundRequestRow({ request }: { request: RefundRequest }) {
  const { mutateAsync, isPending } = useApproveRefundRequest();
  const [isOpen, setIsOpen] = useState(false);
  const amount = formatRefundAmount(request.amountCents);

  async function approve() {
    try {
      const outcome = await mutateAsync(request.id);
      toast.success(approvalSuccessMessage(outcome, amount));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Refund approval failed.');
    }
  }

  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-medium">{refundKindLabel(request.kind)}</p>
        <span className="shrink-0 font-mono text-sm tabular-nums">{amount}</span>
      </div>
      <p className="mt-0.5 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
        Payment {request.paymentIntentId} · reason {request.reason}
        {request.status === 'awaiting_stripe' && ' · submitted to Stripe, not finished yet'}
      </p>
      {request.status === 'failed' && (
        <p className="mt-0.5 break-words text-sm text-destructive [overflow-wrap:anywhere]">
          The last refund did not go through ({request.lastFailure ?? 'no reason given'}). The
          customer was not paid.
        </p>
      )}
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {canResolveWithoutRefund(request.status) && (
          <ResolveWithoutRefundButton requestId={request.id} amount={amount} />
        )}
        <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={isPending}>
              {approveActionLabel(request.status)}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Refund {amount}?</AlertDialogTitle>
              <AlertDialogDescription>
                Stripe returns {amount} to the card that paid {request.paymentIntentId}. The money
                comes from the platform balance and cannot be taken back.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void approve()} disabled={isPending}>
                Refund {amount}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export function RefundRequestsSection() {
  const { data, isLoading, error } = useRefundRequests();

  return (
    <BoardCard>
      <Eyebrow>Refunds awaiting approval</Eyebrow>
      <div className="mt-2">
        {isLoading ? (
          <div role="status" aria-label="Loading refunds awaiting approval">
            <Skeleton className="h-12 rounded-md" />
          </div>
        ) : error ? (
          <Alert variant="destructive" className="bg-destructive/10">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            <AlertTitle>Couldn&rsquo;t load refunds</AlertTitle>
            <AlertDescription>
              The refund queue read failed. Confirm you have site-admin access and try again.
            </AlertDescription>
          </Alert>
        ) : data && data.length > 0 ? (
          data.map(request => <RefundRequestRow key={request.id} request={request} />)
        ) : (
          <p className="flex items-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            No refunds waiting.
          </p>
        )}
      </div>
    </BoardCard>
  );
}
