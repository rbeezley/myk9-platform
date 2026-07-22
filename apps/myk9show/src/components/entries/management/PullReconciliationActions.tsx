import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { denyPullRefundDecision } from '@/features/payments/denyPullRefundDecision';
import { getSuggestedPullRefundDecision } from '@/features/payments/pullReconciliation';
import { isStripeRefundable } from './refundEligibility';

interface PullReconciliationActionsProps {
  entry: EntryManagementEntry;
  onOpenRefund: (entry: EntryManagementEntry) => void;
  onResolved: () => void;
}

export function PullReconciliationActions({
  entry,
  onOpenRefund,
  onResolved,
}: PullReconciliationActionsProps) {
  const [isDenying, setIsDenying] = useState(false);

  if ((entry.refundAmount ?? 0) > 0 || entry.refundedAt) {
    return <Badge variant="secondary">Refund issued</Badge>;
  }

  if (!isStripeRefundable(entry)) {
    return <span className="text-sm text-muted-foreground">No online payment</span>;
  }

  const selected = entry.refundDecision ?? getSuggestedPullRefundDecision(entry.pullTiming ?? null);

  const denyRefund = async () => {
    setIsDenying(true);
    try {
      await denyPullRefundDecision(entry.id);
      toast.success('Refund denied');
      onResolved();
    } catch {
      toast.error("We couldn't save that refund decision. Try again.");
    } finally {
      setIsDenying(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2" onClick={event => event.stopPropagation()}>
      <Button
        type="button"
        size="sm"
        variant={selected === 'refund' ? 'default' : 'outline'}
        className="min-h-11"
        aria-pressed={selected === 'refund'}
        onClick={() => onOpenRefund(entry)}
      >
        Issue refund
      </Button>
      <Button
        type="button"
        size="sm"
        variant={selected === 'denied' ? 'secondary' : 'outline'}
        className="min-h-11"
        aria-pressed={selected === 'denied'}
        disabled={isDenying}
        onClick={() => void denyRefund()}
      >
        {isDenying ? 'Saving…' : 'Deny refund'}
      </Button>
    </div>
  );
}
