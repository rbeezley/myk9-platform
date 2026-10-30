/**
 * The My Shows list: one column at every width. Today's show first, then upcoming shows soonest
 * first, each with its dog cards inline, then one collapsed "Past shows" section. `?show=` scrolls
 * to that show's section (`useShowAnchor`).
 *
 * Lives here rather than in `index.tsx` because that file is at the 500-line
 * cap and CI's quality ratchet fails any regression (D10). The page hands this
 * component the same `filteredEntries` the filters already produced — the
 * grouping is a render-time view, so the tab counts, the status filter and the
 * `?entryIds=` scope reader keep their existing contract (D2, D3).
 *
 * @module MyEntriesPage/modules/MyShowsList
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { ResultCardModel } from '@/features/result-card';
import { useMyPayments } from '@/features/payments/useMyPayments';
import { ALL_PAYMENT_YEARS } from '@/features/payments/paymentYearFilter';
import { useViewerId } from '@/hooks/useViewerId';
import type { UserEntriesSource } from '@/services/database/entries';
import type { ShowMoneyKind } from './showMoneyState';
import { buildShowGroupIndex, groupEntriesByShow } from './groupEntriesByShow';
import type { MyShowClass, MyShowDog, MyShowGroup } from './groupEntriesByShow';
import { MyShowGroupCard } from './MyShowGroup';
import type { EntryStatusFilter, LeaveClassTarget, MyEntry } from './my-entries-types';
import { narrowDogsToStatus } from './statusFilterPredicate';
import { SELECTED_SHOW_PARAM, splitShowsIntoSections } from './myShowSections';
import { showSectionId, useShowAnchor } from './useShowAnchor';

/**
 * Group the filtered orders into the show groups the list renders.
 *
 * Exported beside the component it feeds (design D2) so the memo and its only
 * consumer stay in one place; that costs the fast-refresh rule below, which is
 * a dev-server nicety rather than a correctness constraint.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useMyShowGroups(
  filteredEntries: MyEntry[],
  selectedStatus: EntryStatusFilter = 'any'
): MyShowGroup[] {
  return React.useMemo(
    () => narrowDogsToStatus(groupEntriesByShow(filteredEntries), selectedStatus),
    [filteredEntries, selectedStatus]
  );
}

export interface MyShowsListProps {
  filteredEntries: MyEntry[];
  /**
   * The account's FULL, unfiltered order set — used only so the paid
   * confirmation strip can sum a show's paid entries without shifting under
   * the When/Status filters (MYK9-804). Defaults to `filteredEntries`, which
   * reproduces the pre-fix (filter-dependent) behavior for every caller that
   * has not loaded a separate unfiltered set.
   */
  allOrders?: MyEntry[] | undefined;
  /**
   * Where the rows came from. Passed straight through to each show group, which
   * hands it to the one money derivation. This list reads it for nothing.
   */
  source: UserEntriesSource;
  /** The strip's status axis, re-applied per dog (see `narrowDogsToStatus`). */
  selectedStatus?: EntryStatusFilter | undefined;
  selfCheckinByClassId?: Record<string, boolean> | undefined;
  seenResultReleaseKeys: Set<string>;
  onCheckInDay: (dog: MyShowDog, classes: MyShowClass[]) => void;
  onOpenCheckIn: (order: MyEntry, cls: MyShowClass) => void;
  onOpenEdit: (orders: MyEntry[]) => void;
  onOpenReceipts: (group: MyShowGroup, moneyKind: ShowMoneyKind) => void;
  /** MYK9-631 AC3: leaving one class, threaded to the class row that owns it. */
  onLeaveClass: (target: LeaveClassTarget) => void;
  onResultRevealClick?: ((model: ResultCardModel) => void) | undefined;
  /**
   * The instant the whole list reckons against. Injectable so tests can place
   * themselves on a trial day without faking the global clock; the page never
   * passes it.
   */
  now?: Date | undefined;
  /** Shown in place of the list when the filters leave no shows (the page's empty-state card). */
  emptyState?: React.ReactNode;
}

export const MyShowsList: React.FC<MyShowsListProps> = ({
  filteredEntries,
  allOrders: allOrdersProp,
  source,
  selectedStatus = 'any',
  selfCheckinByClassId,
  seenResultReleaseKeys,
  onCheckInDay,
  onOpenCheckIn,
  onOpenEdit,
  onOpenReceipts,
  onLeaveClass,
  onResultRevealClick,
  now: nowProp,
  emptyState,
}) => {
  const groups = useMyShowGroups(filteredEntries, selectedStatus);
  const allOrders = allOrdersProp ?? filteredEntries;
  // Indexed once per unfiltered-set change, not per show group, so a page
  // with many shows still builds it a single time per render pass.
  const fullShowIndex = React.useMemo(() => buildShowGroupIndex(allOrders), [allOrders]);
  // One instant for the whole render pass, so the day gate, the money state
  // and the paid-strip window cannot disagree mid-list. Captured in state
  // rather than a `useMemo` — a `new Date()` inside a memo is a dependency
  // that never settles.
  const [capturedNow] = React.useState(() => new Date());
  const now = nowProp ?? capturedNow;
  // The same all-time ledger, under the same cache key, that My Payments lists:
  // the paid strip may only confirm a payment that page shows (MYK9-1275).
  const { data: onlinePayments } = useMyPayments(ALL_PAYMENT_YEARS, useViewerId());

  const sections = React.useMemo(() => splitShowsIntoSections(groups, now), [groups, now]);
  const [searchParams] = useSearchParams();
  const requested = searchParams.get(SELECTED_SHOW_PARAM);
  // Past shows stay folded away unless the exhibitor is being sent to one (`?show=`, or a receipt
  // scope from My Payments) or has nothing else to look at.
  const wantsPast =
    sections.past.some(group => group.key === requested) ||
    searchParams.has('entryIds') ||
    searchParams.has('showId') ||
    (sections.today.length === 0 && sections.upcoming.length === 0);
  const [pastOpen, setPastOpen] = React.useState(wantsPast);
  React.useEffect(() => {
    if (wantsPast) setPastOpen(true);
  }, [wantsPast]);
  const highlightedKey = useShowAnchor(
    groups.map(group => group.key),
    pastOpen
  );

  if (groups.length === 0) return <>{emptyState}</>;

  const renderGroup = (group: MyShowGroup) => (
    <li
      key={group.key}
      id={showSectionId(group.key)}
      data-highlighted={highlightedKey === group.key ? 'true' : undefined}
      className={cn(
        'scroll-mt-24 rounded-xl motion-safe:transition-shadow',
        highlightedKey === group.key && 'ring-2 ring-primary ring-offset-8 ring-offset-background'
      )}
    >
      <MyShowGroupCard
        group={group}
        allOrders={fullShowIndex.get(group.key)?.orders ?? group.orders}
        onlinePayments={onlinePayments}
        source={source}
        now={now}
        selfCheckinByClassId={selfCheckinByClassId}
        seenResultReleaseKeys={seenResultReleaseKeys}
        onCheckInDay={onCheckInDay}
        onOpenCheckIn={onOpenCheckIn}
        onOpenEdit={onOpenEdit}
        onOpenReceipts={onOpenReceipts}
        onLeaveClass={onLeaveClass}
        onResultRevealClick={onResultRevealClick}
      />
    </li>
  );

  const labelled = [
    { id: 'today', label: 'Today', groups: sections.today },
    { id: 'upcoming', label: 'Upcoming shows', groups: sections.upcoming },
  ].filter(section => section.groups.length > 0);

  return (
    <div className="space-y-8">
      {labelled.map(section => (
        <section key={section.id} aria-labelledby={`my-shows-${section.id}`} className="space-y-4">
          <h3
            id={`my-shows-${section.id}`}
            className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {section.label}
          </h3>
          <ul className="space-y-8">{section.groups.map(renderGroup)}</ul>
        </section>
      ))}
      {sections.past.length > 0 && (
        <Collapsible open={pastOpen} onOpenChange={setPastOpen}>
          <CollapsibleTrigger className="min-h-[44px] py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:no-underline">
            <span>Past shows ({sections.past.length})</span>
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="space-y-8 pt-2">{sections.past.map(renderGroup)}</ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
