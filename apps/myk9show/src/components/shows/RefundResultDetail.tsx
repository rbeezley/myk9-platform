import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import type { ShowRefundAllResult } from '@/features/payments/useShowRefundAll';

// Server-side skip reasons (apps/myk9show/supabase/functions/_shared/showRefundPlan.ts
// ShowRefundSkipReason, plus 'intent_spans_shows' from stripe-refund-show/index.ts).
// Unknown/future reasons fall back to the raw code so nothing is silently dropped.
const SKIP_REASON_LABELS: Record<string, string> = {
  offline_paid: 'Paid by cash or check — refund manually',
  already_refunded: 'Already refunded',
  not_paid: 'Not paid',
  no_payment_intent: 'No payment on file',
  zero_fee: 'Zero-fee entry',
  intent_partially_refunded: 'Shares a payment with an already-refunded entry — refund manually',
  intent_spans_shows: 'Payment also covers another show — refund manually',
};

function skipReasonLabel(reason: string): string {
  return SKIP_REASON_LABELS[reason] ?? reason;
}

interface RefundResultDetailProps {
  result: ShowRefundAllResult;
}

// A "failed" row can be a refund that went through at Stripe but whose entry
// stamp did not save (stripe-refund-show), so the plain line never says the
// payment was not refunded. A re-run refunds no one twice.
const FAILED_PAYMENT_LINE =
  'This payment may not have been refunded. Run Refund all again: it will not refund anyone twice.';

/** Per-entry detail behind a disclosure, so a clean run stays compact and a
 * messy one is actionable (spec: refund-result-transparency). INTENT: secretary
 * surface — calm control, detail only when the secretary asks for it. */
export function RefundResultDetail({ result }: RefundResultDetailProps) {
  const [open, setOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const { skipped, failed } = result;

  if (skipped.length === 0 && failed.length === 0) {
    return null;
  }

  const skippedByReason = new Map<string, string[]>();
  for (const entry of skipped) {
    const entryIds = skippedByReason.get(entry.reason) ?? [];
    entryIds.push(entry.entryId);
    skippedByReason.set(entry.reason, entryIds);
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-auto justify-start gap-2 py-1 text-sm font-normal text-muted-foreground hover:text-foreground hover:no-underline">
        <ChevronDown className="h-4 w-4 transition-transform" aria-hidden="true" />
        {open ? 'Hide details' : 'View details'}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3">
          {[...skippedByReason.entries()].map(([reason, entryIds]) => (
            <div key={reason}>
              <p className="text-sm font-medium">{skipReasonLabel(reason)}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {entryIds.map(entryId => (
                  <Badge key={entryId} variant="secondary" className="font-mono text-xs">
                    Entry {entryId}
                  </Badge>
                ))}
              </div>
            </div>
          ))}

          {failed.map(failure => (
            <div key={failure.paymentIntentId}>
              <p className="text-sm font-medium text-destructive">{FAILED_PAYMENT_LINE}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {failure.entryIds.map(entryId => (
                  <Badge key={entryId} variant="destructive" className="font-mono text-xs">
                    Entry {entryId}
                  </Badge>
                ))}
              </div>
            </div>
          ))}

          {/* The exact codes and Stripe errors stay available so the secretary
              can hand support the precise failure, without leading with them. */}
          <Collapsible open={supportOpen} onOpenChange={setSupportOpen}>
            <CollapsibleTrigger className="w-auto justify-start gap-2 py-1 text-xs font-normal text-muted-foreground hover:text-foreground hover:no-underline">
              <ChevronDown className="h-3 w-3 transition-transform" aria-hidden="true" />
              Details for support
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="space-y-1 font-mono text-xs text-muted-foreground">
                {[...skippedByReason.entries()].map(([reason, entryIds]) => (
                  <li key={`skip-${reason}`}>
                    Skipped {reason}: {entryIds.join(', ')}
                  </li>
                ))}
                {failed.map(failure => (
                  <li key={`failed-${failure.paymentIntentId}`}>
                    {failure.paymentIntentId}: {failure.error}
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
