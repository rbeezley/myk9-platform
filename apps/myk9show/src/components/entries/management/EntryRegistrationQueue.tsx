import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useElementWidth } from '@/hooks/useElementWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { PaymentStatus } from '@/types/show-registration-types';
import {
  entryManagementPaymentLabel,
  resolvePaymentChannel,
} from '@/features/payments/paymentChannel';
import type { OperationalViewDensity } from '@/features/operational-views/operationalViews';
import {
  getEntryRegistrationRowId,
  type ShowRegistrationGroup,
} from './showRegistrationProjection';
import { getRegistrationReviewLabel } from './reviewStateLabels';

/**
 * Below this measured width (px) the queue stacks each registration into a
 * card instead of the multi-column grid.
 *
 * 480px is the `minmax(30rem, …)` floor the cockpit's two-column desktop
 * arrangement guarantees this column, so any layout wide enough to be
 * "desktop" keeps the grid, and only genuinely narrow columns — such as the
 * ~408px left by the manager sidebar at a 768px tablet viewport — stack.
 */
export const ENTRY_QUEUE_STACKED_MAX_WIDTH = 480;

/**
 * Shared by the header and every row so the two can never drift apart. Every
 * flexible track floors at 0 and its cell truncates, so the grid compresses to
 * fit its column instead of overflowing a `overflow-hidden` ancestor and
 * putting the row's action out of reach (MYK9-57).
 */
const QUEUE_GRID_COLUMNS =
  'grid-cols-[2.75rem_minmax(0,1.15fr)_minmax(0,.7fr)_minmax(0,.7fr)_auto]';

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
  /**
   * The show has no registrations at all, as opposed to none matching the
   * current queue/scope/search. Without the distinction the empty state sent
   * the secretary hunting through filters that were never the cause.
   */
  showHasNoRegistrations?: boolean;
  pageIndex: number;
  pageCount: number;
  onPageChange: (pageIndex: number) => void;
  density?: OperationalViewDensity;
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
  // Refund state outranks the channel: what matters first is that money went back.
  if (group.paymentStatus === PaymentStatus.REFUNDED) return 'Refunded';
  if (group.paymentStatus === PaymentStatus.PARTIAL_REFUND) return 'Partially refunded';
  if (group.paymentStatus === PaymentStatus.PENDING) {
    return group.attentionReasons.includes('payment_due') ? 'Payment due' : 'Not paid yet';
  }

  // F18: this used to read the channel off `paymentStatus` alone, so the generic
  // database status 'paid' -- which is what a mail-in cheque carries -- rendered as
  // "Paid online". The channel now comes from `payment_method` where one was
  // recorded, and says plain "Paid" where none was.
  return entryManagementPaymentLabel(
    resolvePaymentChannel({
      paymentMethod: group.paymentMethod,
      paymentStatus: group.paymentStatus,
    })
  );
}

const reviewLabel = getRegistrationReviewLabel;

/**
 * The row's next action as a real control. The row itself stays a `listitem`
 * whose click is a mouse convenience — making the row a `button` would strip
 * the announced semantics from the selection checkbox nested inside it — so
 * this is the affordance keyboard and assistive-technology users reach, and it
 * carries the row id the cockpit focuses when returning from the detail panel.
 */
function RegistrationActionButton({
  group,
  onFocus,
}: {
  group: ShowRegistrationGroup;
  onFocus: (group: ShowRegistrationGroup) => void;
}) {
  return (
    <button
      type="button"
      id={getEntryRegistrationRowId(group.groupKey)}
      aria-label={`${group.recommendedAction.label} for ${group.exhibitorName}`}
      className="inline-flex min-h-11 items-center gap-1 rounded text-xs font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={event => {
        event.stopPropagation();
        onFocus(group);
      }}
    >
      {group.recommendedAction.label}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

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
  showHasNoRegistrations = false,
  pageIndex,
  pageCount,
  onPageChange,
  density = 'comfortable',
}: EntryRegistrationQueueProps) {
  // The persistent manager sidebar leaves this column far narrower than the
  // viewport, so the layout follows the width the queue actually has. The
  // viewport query is only the pre-measurement fallback (first paint, SSR, and
  // environments without layout).
  const { ref, width } = useElementWidth<HTMLElement>();
  const viewportCompact = !useMediaQuery('(min-width: 768px)', true);
  const compact = width === null ? viewportCompact : width < ENTRY_QUEUE_STACKED_MAX_WIDTH;
  return (
    <section
      ref={ref}
      className="overflow-hidden rounded-xl border bg-card shadow-sm"
      aria-label="Registrations"
    >
      {compact ? (
        <div className="flex items-center gap-3 border-b bg-muted/35 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
          <Checkbox
            className="relative before:absolute before:-inset-3.5 before:content-['']"
            aria-label="Select all on page"
            checked={allSelected}
            indeterminate={partiallySelected}
            onCheckedChange={onToggleAll}
          />
          <span>Select all on page</span>
        </div>
      ) : (
        <div
          className={cn(
            'grid items-center gap-3 border-b bg-muted/35 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground/70',
            QUEUE_GRID_COLUMNS
          )}
        >
          <span className="flex min-h-11 items-center justify-center">
            <Checkbox
              className="relative before:absolute before:-inset-3.5 before:content-['']"
              aria-label="Select all registrations on this page"
              checked={allSelected}
              indeterminate={partiallySelected}
              onCheckedChange={onToggleAll}
            />
          </span>
          <span className="truncate">Registration</span>
          <span className="truncate">Entries</span>
          <span className="truncate">Review / payment</span>
          <span className="text-right">Next action</span>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="font-semibold">
            {showHasNoRegistrations ? 'No entries yet' : 'No matching registrations'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {showHasNoRegistrations
              ? 'Entries will appear here as exhibitors register, or you can add one.'
              : 'Try another queue, scope, or search.'}
          </p>
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
                role="listitem"
                aria-current={focused ? 'true' : undefined}
                aria-label={`${group.exhibitorName}, ${group.entryCount} ${group.entryCount === 1 ? 'Entry' : 'Entries'}, ${reviewLabel(group)}, ${group.recommendedAction.label}`}
                className={cn(
                  'group cursor-pointer items-center border-b px-3 outline-none transition-colors last:border-b-0 hover:bg-muted/40 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring',
                  compact
                    ? 'flex flex-col items-stretch gap-1.5'
                    : cn('grid gap-3', QUEUE_GRID_COLUMNS),
                  density === 'compact' && 'py-2',
                  density === 'comfortable' && 'py-3',
                  focused &&
                    'relative z-[1] bg-primary/10 shadow-[inset_4px_0_0_var(--primary)] ring-1 ring-inset ring-primary/55 hover:bg-primary/10'
                )}
                onClick={() => onFocus(group)}
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

                    <RegistrationActionButton group={group} onFocus={onFocus} />
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
                      <RegistrationActionButton group={group} onFocus={onFocus} />
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
        {/* Typing in search silently rewrote this line, the queue badges and
            the empty state, with nothing announced. This is the one place that
            states the result count, so it is the one that should speak. */}
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          Showing {rangeStart}&ndash;{rangeEnd} of {total} registrations
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
