import { cn, formatCurrency } from '@/lib/utils';
import {
  LATE_ENTRY_PAYMENT_METHODS,
  summarizeLateEntryReconciliation,
  type LateEntryReconciliationEntry,
} from './lateEntryReconciliationSummary';

interface LateEntryReconciliationProps {
  entries: LateEntryReconciliationEntry[];
}

export function LateEntryReconciliation({ entries }: LateEntryReconciliationProps) {
  const summary = summarizeLateEntryReconciliation(entries);
  const hasEntries = summary.entryCount > 0;

  return (
    <section
      className="rounded-md border bg-card p-4"
      aria-labelledby="late-entry-reconciliation-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="late-entry-reconciliation-title" className="text-base font-semibold">
            Late entry reconciliation
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Desk-entered fees to verify before closing the show.
          </p>
        </div>
        <span
          className={cn(
            'inline-flex w-fit items-center rounded-md px-2 py-1 text-xs font-medium',
            hasEntries
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground'
          )}
        >
          {summary.entryCount} late {summary.entryCount === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div role="group" aria-label="Collected late-entry fees">
          <p className="text-xs font-medium uppercase text-muted-foreground">Collected</p>
          <p className="text-xl font-semibold">{formatCurrency(summary.collectedAmount)}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Waived</p>
          <p className="text-xl font-semibold">{summary.waivedCount}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Review</p>
          <p className="text-sm text-muted-foreground">
            {hasEntries ? 'Match cash and checks to the desk sheet.' : 'No late-entry fees yet.'}
          </p>
        </div>
      </div>

      {hasEntries && (
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
    </section>
  );
}
