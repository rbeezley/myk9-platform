import { cn, formatCurrency } from '@/lib/utils';
import {
  LATE_ENTRY_PAYMENT_METHODS,
  summarizeShowDayReconciliation,
  type ShowDayReconciliationEntry,
} from './showDayReconciliationSummary';

interface ShowDayReconciliationProps {
  entries: ShowDayReconciliationEntry[];
}

export function ShowDayReconciliation({ entries }: ShowDayReconciliationProps) {
  const summary = summarizeShowDayReconciliation(entries);
  const hasLateEntries = summary.lateEntryCount > 0;
  const hasEntries = summary.totalEntryCount > 0;
  const needsReview = summary.pulledCount > 0 || summary.refundReviewCount > 0;
  const refundReviewText =
    summary.refundReviewCount > 0
      ? `${formatCurrency(summary.refundReviewAmount)} paid entries`
      : summary.refundedCount > 0
        ? `${summary.refundedCount} already refunded`
        : 'No paid pulls flagged';

  return (
    <section
      className="rounded-md border bg-card p-4"
      aria-labelledby="show-day-reconciliation-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="show-day-reconciliation-title" className="text-base font-semibold">
            Show-day reconciliation
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Desk-entered fees, pulled dogs, and manual refund checks before closing the show.
          </p>
        </div>
        <span
          className={cn(
            'inline-flex w-fit items-center rounded-md px-2 py-1 text-xs font-medium',
            needsReview
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground'
          )}
        >
          {needsReview
            ? `${summary.pulledCount} pulled · ${summary.refundReviewCount} review`
            : hasEntries
              ? 'Ready to review'
              : 'No entries'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div role="group" aria-label="Show entries">
          <p className="text-xs font-medium uppercase text-muted-foreground">Entries</p>
          <p className="text-xl font-semibold">{summary.totalEntryCount}</p>
          <p className="text-xs text-muted-foreground">{summary.lateEntryCount} day-of</p>
        </div>
        <div role="group" aria-label="Collected late-entry fees">
          <p className="text-xs font-medium uppercase text-muted-foreground">Collected</p>
          <p className="text-xl font-semibold">{formatCurrency(summary.collectedAmount)}</p>
        </div>
        <div role="group" aria-label="Waived late-entry fees">
          <p className="text-xs font-medium uppercase text-muted-foreground">Waived</p>
          <p className="text-xl font-semibold">{summary.waivedCount}</p>
        </div>
        <div role="group" aria-label="Pulled or no-show entries">
          <p className="text-xs font-medium uppercase text-muted-foreground">Pulled / no-show</p>
          <p className="text-xl font-semibold">{summary.pulledCount}</p>
        </div>
        <div role="group" aria-label="Manual refund review">
          <p className="text-xs font-medium uppercase text-muted-foreground">Refund review</p>
          <p className="text-xl font-semibold">{summary.refundReviewCount}</p>
          <p className="text-xs text-muted-foreground">{refundReviewText}</p>
        </div>
      </div>

      {hasLateEntries && (
        <div className="mt-4 flex flex-wrap gap-2">
          {LATE_ENTRY_PAYMENT_METHODS.map(method => ({
            ...method,
            value: summary.byMethod[method.id],
          }))
            .filter(method => method.value.count > 0)
            .map(method => (
              <span
                key={method.id}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium"
              >
                <span>{method.label}</span>
                <span>{method.value.count}</span>
                <span>{formatCurrency(method.value.amount)}</span>
              </span>
            ))}
        </div>
      )}

      {summary.refundedCount > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          {summary.refundedCount} pulled {summary.refundedCount === 1 ? 'entry has' : 'entries have'}{' '}
          {formatCurrency(summary.refundedAmount)} marked refunded.
        </p>
      )}
    </section>
  );
}
