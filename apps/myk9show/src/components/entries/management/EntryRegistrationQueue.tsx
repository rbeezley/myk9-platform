import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { PaymentStatus } from '@/types/show-registration-types';
import type { OperationalViewDensity } from '@/features/operational-views/operationalViews';
import {
  getEntryRegistrationRowId,
  type ShowRegistrationGroup,
} from './showRegistrationProjection';
import { getRegistrationReviewLabel } from './reviewStateLabels';

interface EntryRegistrationQueueProps {
  groups: ShowRegistrationGroup[];
  focusedKey: string | null;
  selectedKeys: ReadonlySet<string>;
  allSelected: boolean;
  partiallySelected: boolean;
  onFocus: (group: ShowRegistrationGroup) => void;
  onToggle: (group: ShowRegistrationGroup) => void;
  onToggleAll: () => void;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  pageIndex: number;
  pageCount: number;
  onPageChange: (pageIndex: number) => void;
  density?: OperationalViewDensity;
  compact?: boolean;
}

function formatSubmittedAt(value: Date): string {
  return value.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function paymentLabel(group: ShowRegistrationGroup): string {
  switch (group.paymentStatus) {
    case PaymentStatus.PAID_BY_CASH:
      return 'Paid by cash';
    case PaymentStatus.PAID_BY_CHECK:
      return 'Paid by check';
    case PaymentStatus.PAID_ONLINE:
      return 'Paid online';
    case PaymentStatus.WAIVED:
      return 'Waived';
    case PaymentStatus.REFUNDED:
      return 'Refunded';
    case PaymentStatus.PARTIAL_REFUND:
      return 'Partially refunded';
    case PaymentStatus.PENDING:
    default:
      return group.attentionReasons.includes('payment_due') ? 'Payment due' : 'Not paid yet';
  }
}

const reviewLabel = getRegistrationReviewLabel;

export function EntryRegistrationQueue({
  groups,
  focusedKey,
  selectedKeys,
  allSelected,
  partiallySelected,
  onFocus,
  onToggle,
  onToggleAll,
  rangeStart,
  rangeEnd,
  total,
  pageIndex,
  pageCount,
  onPageChange,
  density = 'comfortable',
  compact = false,
}: EntryRegistrationQueueProps) {
  return (
    <section
      className="overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-label="Registrations"
    >
      {compact ? (
        <div className="flex items-center gap-3 border-b bg-muted/35 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
          <Checkbox
            className="relative before:absolute before:-inset-3.5 before:content-['']"
            aria-label="Select all registrations"
            checked={allSelected}
            indeterminate={partiallySelected}
            onCheckedChange={onToggleAll}
          />
          <span>Select all</span>
        </div>
      ) : (
        <div className="grid grid-cols-[2.75rem_minmax(9rem,1.15fr)_minmax(7rem,.7fr)_minmax(8rem,.7fr)_minmax(8rem,auto)] items-center gap-3 border-b bg-muted/35 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
          <span className="flex min-h-11 items-center justify-center">
            <Checkbox
              className="relative before:absolute before:-inset-3.5 before:content-['']"
              aria-label="Select all registrations"
              checked={allSelected}
              indeterminate={partiallySelected}
              onCheckedChange={onToggleAll}
            />
          </span>
          <span>Registration</span>
          <span>Entries</span>
          <span>Review / payment</span>
          <span className="text-right">Next action</span>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="font-semibold">No matching registrations</p>
          <p className="mt-1 text-sm text-muted-foreground">Try another queue, scope, or search.</p>
        </div>
      ) : (
        <div role="list" aria-label="Registration work queue">
          {groups.map(group => {
            const focused = focusedKey === group.groupKey;
            const selected = selectedKeys.has(group.groupKey);
            const dogNames = [...new Set(group.entries.map(entry => entry.dogName))];

            return (
              <div
                key={group.groupKey}
                id={getEntryRegistrationRowId(group.groupKey)}
                role="listitem"
                tabIndex={0}
                aria-current={focused ? 'true' : undefined}
                aria-label={`${group.exhibitorName}, ${group.entryCount} ${group.entryCount === 1 ? 'Entry' : 'Entries'}, ${reviewLabel(group)}, ${group.recommendedAction.label}`}
                className={cn(
                  'group cursor-pointer items-center border-b px-3 outline-none transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  compact
                    ? 'flex flex-col items-stretch gap-1.5'
                    : 'grid grid-cols-[2.75rem_minmax(9rem,1.15fr)_minmax(7rem,.7fr)_minmax(8rem,.7fr)_minmax(8rem,auto)] gap-3',
                  density === 'compact' && 'py-2',
                  density === 'comfortable' && 'py-3',
                  focused &&
                    'relative z-[1] bg-primary/10 shadow-[inset_4px_0_0_hsl(var(--primary)),inset_0_0_0_1px_hsl(var(--primary)/0.55)] hover:bg-primary/10'
                )}
                onClick={() => onFocus(group)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onFocus(group);
                  }
                }}
              >
                {compact ? (
                  <>
                    <div className="flex items-start gap-3">
                      <span
                        className="flex min-h-11 items-center justify-center"
                        onClick={event => event.stopPropagation()}
                        onKeyDown={event => event.stopPropagation()}
                      >
                        <Checkbox
                          className="relative before:absolute before:-inset-3.5 before:content-['']"
                          aria-label={`Select ${group.exhibitorName}`}
                          checked={selected}
                          onCheckedChange={() => onToggle(group)}
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{group.exhibitorName}</p>
                        <p className="text-xs text-muted-foreground">
                          {group.confirmationNumber ?? 'No confirmation'} ·{' '}
                          {formatSubmittedAt(group.submittedAt)}
                        </p>
                      </div>
                    </div>

                    <p className="text-sm font-medium">
                      {dogNames.join(', ')} · {group.entryCount}{' '}
                      {group.entryCount === 1 ? 'Entry' : 'Entries'}
                    </p>

                    <div className="text-sm">
                      <p className="font-medium">{reviewLabel(group)}</p>
                      <p
                        className={cn(
                          'text-xs text-muted-foreground',
                          group.attentionReasons.includes('payment_due') && 'text-destructive'
                        )}
                      >
                        {paymentLabel(group)}
                      </p>
                    </div>

                    <p className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      {group.recommendedAction.label}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </p>
                  </>
                ) : (
                  <>
                    <span
                      className="flex min-h-11 items-center justify-center"
                      onClick={event => event.stopPropagation()}
                      onKeyDown={event => event.stopPropagation()}
                    >
                      <Checkbox
                        className="relative before:absolute before:-inset-3.5 before:content-['']"
                        aria-label={`Select ${group.exhibitorName}`}
                        checked={selected}
                        onCheckedChange={() => onToggle(group)}
                      />
                    </span>

                    <div className="min-w-0">
                      <p className="truncate font-semibold">{group.exhibitorName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {group.confirmationNumber ?? 'No confirmation'} ·{' '}
                        {formatSubmittedAt(group.submittedAt)}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{dogNames.join(', ')}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.entryCount} {group.entryCount === 1 ? 'Entry' : 'Entries'} ·{' '}
                        {group.classCount} {group.classCount === 1 ? 'Class' : 'Classes'}
                      </p>
                    </div>

                    <div className="min-w-0 text-sm">
                      <p className="truncate font-medium">{reviewLabel(group)}</p>
                      <p
                        className={cn(
                          'truncate text-xs text-muted-foreground',
                          group.attentionReasons.includes('payment_due') && 'text-destructive'
                        )}
                      >
                        {paymentLabel(group)}
                      </p>
                    </div>

                    <div className="text-right text-sm">
                      <p className="inline-flex items-center justify-end gap-1 text-xs font-semibold text-primary">
                        {group.recommendedAction.label}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </p>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <nav
        className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        aria-label="Registration pagination"
      >
        <p className="text-sm text-muted-foreground">
          Showing {rangeStart}–{rangeEnd} of {total} registrations
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(pageIndex - 1)}
            disabled={pageIndex === 0}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onPageChange(pageIndex + 1)}
            disabled={pageIndex >= pageCount - 1}
          >
            Next
          </Button>
        </div>
      </nav>
    </section>
  );
}
