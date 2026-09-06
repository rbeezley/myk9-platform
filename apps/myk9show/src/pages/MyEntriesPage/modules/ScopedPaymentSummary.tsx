/**
 * The payment detail a deep-linked "Receipt" arrives with.
 *
 * My Payments' per-row Receipt link is an `<a>` to My Shows carrying
 * `?orderId=&showId=&entryIds=`. The list narrows and `EntryScopeBanner`
 * explains the narrowing — but nothing on the destination stated the amount,
 * the date or any reference, so the control labelled Receipt produced a
 * filtered list and no proof of payment (MYK9-420).
 *
 * This panel is the receipt half of that arrival. It reads its own param for
 * the same reason `ReceiptEntryDialog` does: a prop threaded down through the
 * page puts the one line connecting URL to content outside the reach of any
 * test.
 *
 * @module MyEntriesPage/modules/ScopedPaymentSummary
 */

import { Loader2, ReceiptText } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useDeepLinkedReceiptOrder } from '@/features/payments/entryReceiptOrder';
import { ENTRY_SCOPE_ORDER_PARAM } from '@/features/payments/entryScopeParams';

import { buildScopedPaymentFacts } from './scopedPaymentFacts';

// bg-muted, not bg-muted/50 — opacity modifiers on var()-backed tokens do not
// compile here; see tokenOpacityContract.test.ts.
const SHELL = 'rounded-xl border border-border bg-muted px-4 py-3';

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <section className={SHELL} aria-labelledby="scoped-payment-heading">
      <h3
        id="scoped-payment-heading"
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
      >
        <ReceiptText className="h-4 w-4 shrink-0" aria-hidden="true" />
        Receipt
      </h3>
      {children}
    </section>
  );
}

export function ScopedPaymentSummary() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get(ENTRY_SCOPE_ORDER_PARAM)?.trim() || null;
  const order = useDeepLinkedReceiptOrder(orderId);

  // No deep link, no panel. The unscoped visit is the common one and must cost
  // nothing.
  if (!orderId) return null;

  // `isPending` is true forever for a DISABLED query, so require an in-flight
  // fetch before showing a spinner — otherwise a panel that will never load
  // parks on one.
  if (order.isPending && order.fetchStatus !== 'idle') {
    return (
      <PanelShell>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading your payment details.
        </p>
      </PanelShell>
    );
  }

  if (order.isError) {
    return (
      <PanelShell>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground">
            We could not load the payment details for this receipt. Your entries are listed below.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 self-start sm:self-auto"
            onClick={() => void order.refetch()}
          >
            Try again
          </Button>
        </div>
      </PanelShell>
    );
  }

  // A resolved null is a different claim from a failed read: the row is not
  // readable by this exhibitor, or no longer exists. Say that plainly rather
  // than offering a retry that cannot change the answer.
  if (!order.data) {
    return (
      <PanelShell>
        <p className="mt-2 text-sm text-foreground">
          We could not find that payment. Your entries are listed below.
        </p>
      </PanelShell>
    );
  }

  const facts = buildScopedPaymentFacts(order.data);

  return (
    <PanelShell>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm text-muted-foreground">{facts.headlineLabel}</span>
        <span className="text-2xl font-semibold tabular-nums text-foreground">
          {facts.headlineValue}
        </span>
        <span className="text-sm text-muted-foreground">{facts.statusLabel}</span>
      </div>
      {/* A definition list, so the label/value pairing survives a screen
        reader rather than arriving as a run of loose text. */}
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {facts.rows.map(row => (
          <div key={row.label} className="flex flex-wrap justify-between gap-2 sm:justify-start">
            <dt className="text-muted-foreground sm:min-w-32">{row.label}</dt>
            <dd className="font-medium tabular-nums text-foreground break-all">{row.value}</dd>
          </div>
        ))}
      </dl>
      {/* A fact about the ORDER, never about the list. The banner beneath
        already says how well the two line up, and it hedges deliberately —
        `entryScopeMessage` refuses to call the visible rows the payment's
        contents unless the match was exact. Saying "covers the entries below"
        here would smuggle that overclaim back in one element earlier. */}
      <p className="mt-3 text-sm text-muted-foreground">
        {facts.entriesCovered === 1
          ? 'Paid for 1 entry.'
          : `Paid for ${facts.entriesCovered} entries.`}
      </p>
    </PanelShell>
  );
}
