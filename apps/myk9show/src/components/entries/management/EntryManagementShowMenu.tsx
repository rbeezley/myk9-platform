/**
 * The Entries tab's "Show:" control (docs/plan-entries-filter-button.md, settled rules 1 and 8).
 * The four registration queues are checkboxes, so Needs review and Payment due can be listed
 * together; the trigger counts the distinct forms in them, never the sum. Waitlist, Pulls and
 * Move-ups are different lists with different rows, so each is a single choice that replaces the
 * queues. The exclusivity rules (All against the rest, never an empty list) are
 * `toggleQueueSelection`'s.
 */
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ListView } from '@/components/list-toolkit';
import { cn } from '@/lib/utils';
import {
  ENTRY_MANAGEMENT_EXCEPTIONS,
  toggleQueueSelection,
  type EntryManagementCockpitState,
  type EntryManagementException,
} from './entryManagementCockpitParams';
import { buildEntryManagementViews, type EntryManagementViewCounts } from './entryManagementViews';
import type { ShowRegistrationQueue } from './showRegistrationProjection';

interface EntryManagementShowMenuProps {
  state: EntryManagementCockpitState;
  counts: EntryManagementViewCounts;
  /** Distinct forms in the checked queues. */
  selectionCount: number;
  onQueuesChange: (queues: ShowRegistrationQueue[]) => void;
  onSelectException: (exception: EntryManagementException) => void;
  /** Narrow layout: the visible "Show:" word is dropped (the button still says it). */
  compact?: boolean;
}

function withCount(label: string, count: number | null | undefined): string {
  return typeof count === 'number' ? `${label} (${count.toLocaleString()})` : label;
}

const isException = (view: ListView) =>
  (ENTRY_MANAGEMENT_EXCEPTIONS as readonly string[]).includes(view.id);

export function EntryManagementShowMenu({
  state,
  counts,
  selectionCount,
  onQueuesChange,
  onSelectException,
  compact = false,
}: EntryManagementShowMenuProps) {
  const views = buildEntryManagementViews(counts);
  const queueViews = views.filter(view => !isException(view));
  const exceptionViews = views.filter(isException);
  const onRegistrations = state.tab === 'registrations';

  const checkedLabels = queueViews
    .filter(view => state.queues.includes(view.id as ShowRegistrationQueue))
    .map(view => view.label);
  const exceptionView = exceptionViews.find(candidate => candidate.id === state.exception);
  const count = onRegistrations ? selectionCount : exceptionView?.count;
  // The button shows the first queue and how many more ("Needs review +1"), so the count still
  // fits beside the search on a laptop; its accessible name lists every queue.
  const fullLabel = onRegistrations ? checkedLabels.join(' + ') : (exceptionView?.label ?? '');
  const shortLabel =
    onRegistrations && checkedLabels.length > 1
      ? `${checkedLabels[0]} +${checkedLabels.length - 1}`
      : fullLabel;
  const countText = typeof count === 'number' ? ` (${count.toLocaleString()})` : '';

  // From an exception list, a queue pick starts a fresh selection of just that queue.
  const toggleQueue = (queue: ShowRegistrationQueue) =>
    onQueuesChange(onRegistrations ? toggleQueueSelection(state.queues, queue) : [queue]);

  return (
    <div className="flex min-w-0 max-w-full items-center gap-2">
      <span
        className={cn('shrink-0 text-sm font-medium text-foreground', compact && 'hidden')}
        aria-hidden="true"
      >
        Show:
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            // The name contains the visible text (WCAG 2.5.3, so voice control matches it) after
            // the "Show:" the label outside the button carries; the full list is the description.
            aria-label={`Show: ${shortLabel}${countText}`}
            title={`${fullLabel}${countText}`}
            className="h-11 min-w-0 max-w-[calc(100vw-5rem)] justify-between gap-2 px-3 font-normal"
          >
            <span className="flex min-w-0">
              <span className="truncate">{shortLabel}</span>
              <span className="shrink-0 whitespace-pre">{countText}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Entry forms</DropdownMenuLabel>
            {queueViews.map(view => (
              <DropdownMenuCheckboxItem
                key={view.id}
                checked={onRegistrations && state.queues.includes(view.id as ShowRegistrationQueue)}
                onCheckedChange={() => toggleQueue(view.id as ShowRegistrationQueue)}
                className="min-h-11"
              >
                {withCount(view.label, view.count)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Other lists</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={onRegistrations ? '' : state.exception}
              onValueChange={value => onSelectException(value as EntryManagementException)}
            >
              {exceptionViews.map(view => (
                <DropdownMenuRadioItem
                  key={view.id}
                  value={view.id}
                  closeOnClick
                  className="min-h-11"
                >
                  {withCount(view.label, view.count)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
