/**
 * My Shows as a list of the exhibitor's shows with the selected show's entries beside it, from
 * `lg` (docs/plan-sidebar-browse-pane.md, phase 4). Below `lg` it is today's single column.
 *
 * It replaces how the page lays out `MyShowsList`; it is not a second copy of it. The detail pane
 * IS `MyShowsList` narrowed to one show, so every card, strip, receipt and class action is the
 * same code in the same state. The left list is built from the groups the filter strip already
 * produced, so the strip's counts, the receipt-link scope and the status filter keep describing
 * exactly the shows listed.
 *
 * INTENT: the selected show is the URL's `?show=` (back, bookmarks and refresh land on it) and
 * defaults to the next upcoming show, so an exhibitor opens the page to their entries without
 * choosing first.
 *
 * @module MyEntriesPage/modules/MyShowsSplit
 */

import React from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { CompactRecordList } from '@/components/layout/CompactRecordList';
import { MASTER_DETAIL_QUERY, MasterDetailLayout } from '@/components/layout/MasterDetailLayout';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { MyShowGroup } from './groupEntriesByShow';
import { MyShowsList, useMyShowGroups, type MyShowsListProps } from './MyShowsList';
import { isPastShowEntry } from './myEntriesStats.helpers';
import { formatShowHeaderDateRange } from './myShowHeaderFormat';

/** The URL parameter holding the selected show's group key. */
export const SELECTED_SHOW_PARAM = 'show';

export interface ShowsByWhen {
  upcoming: MyShowGroup[];
  past: MyShowGroup[];
}

/**
 * Split show groups into Upcoming and Past on the same calendar-day rule the show card uses, so a
 * show running today is Upcoming. Order within each is the order given.
 */
export function splitShowsByWhen(groups: readonly MyShowGroup[], now: Date): ShowsByWhen {
  const upcoming: MyShowGroup[] = [];
  const past: MyShowGroup[] = [];
  for (const group of groups) {
    (isPastShowEntry(group.orders[0], now) ? past : upcoming).push(group);
  }
  return { upcoming, past };
}

/** The key of the show to open: the one in the URL if it is listed, else the first Upcoming. */
export function pickSelectedShowKey(
  { upcoming, past }: ShowsByWhen,
  requested: string | null
): string | undefined {
  const listed = [...upcoming, ...past];
  return listed.find(group => group.key === requested)?.key ?? listed[0]?.key;
}

function describeShow(group: MyShowGroup): string {
  const dogs = `${group.dogs.length} ${group.dogs.length === 1 ? 'dog' : 'dogs'}`;
  return [
    group.isShowCancelled ? 'Cancelled' : '',
    formatShowHeaderDateRange(group.showDate, group.showEndDate),
    dogs,
  ]
    .filter(Boolean)
    .join(' · ');
}

interface ShowsPaneProps {
  shows: ShowsByWhen;
  selectedKey: string | undefined;
  hrefFor: (group: MyShowGroup) => string;
}

function ShowsPane({ shows, selectedKey, hrefFor }: ShowsPaneProps) {
  const sections = [
    { id: 'upcoming', label: 'Upcoming', groups: shows.upcoming },
    { id: 'past', label: 'Past', groups: shows.past },
  ].filter(section => section.groups.length > 0);

  return (
    <div className="space-y-4">
      {sections.map(section => (
        <section key={section.id} aria-labelledby={`my-shows-pane-${section.id}`}>
          <h2
            id={`my-shows-pane-${section.id}`}
            className="mb-1.5 px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {section.label}
          </h2>
          <CompactRecordList
            items={section.groups}
            selectedId={selectedKey}
            label={`${section.label} shows`}
            getId={group => group.key}
            getHref={hrefFor}
            getName={group => group.showName}
            renderRow={group => ({ title: group.showName, subtitle: describeShow(group) })}
          />
        </section>
      ))}
    </div>
  );
}

export interface MyShowsSplitProps extends MyShowsListProps {
  /** The When / Status filters, shown above the list from lg (the page draws them below lg). */
  filters?: React.ReactNode;
  /** Shown in place of the list when the filters leave no shows (the page's empty-state card). */
  emptyState?: React.ReactNode;
}

export const MyShowsSplit: React.FC<MyShowsSplitProps> = ({ filters, emptyState, ...props }) => {
  const isWide = useMediaQuery(MASTER_DETAIL_QUERY);
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const groups = useMyShowGroups(props.filteredEntries, props.selectedStatus);
  // Day-level grouping, so one instant per mount is enough (as in `MyShowsList`).
  const [capturedNow] = React.useState(() => new Date());
  const shows = React.useMemo(
    () => splitShowsByWhen(groups, props.now ?? capturedNow),
    [groups, props.now, capturedNow]
  );

  const detailTopRef = React.useRef<HTMLDivElement>(null);
  const selectedKey = pickSelectedShowKey(shows, searchParams.get(SELECTED_SHOW_PARAM));
  // The detail pane is one scroll container for every show, so a show opened from partway down
  // another would hide its heading and notices: start each at the top. The list is left alone.
  React.useLayoutEffect(() => {
    const pane = detailTopRef.current?.closest<HTMLElement>('[role="region"]');
    if (pane) pane.scrollTop = 0;
  }, [selectedKey]);

  const noShows = props.filteredEntries.length === 0;
  if (!isWide) return noShows ? <>{emptyState}</> : <MyShowsList {...props} />;

  // Every other parameter (filters, scope) rides along, so choosing a show never drops them.
  const hrefFor = (group: MyShowGroup) => {
    const next = new URLSearchParams(searchParams);
    next.set(SELECTED_SHOW_PARAM, group.key);
    return `${pathname}?${next.toString()}`;
  };

  return (
    <MasterDetailLayout
      id="my-shows"
      listLabel="Your shows"
      detailLabel="Entries for the selected show"
      listHeader={filters}
      list={
        noShows ? (
          <>{emptyState}</>
        ) : (
          <ShowsPane shows={shows} selectedKey={selectedKey} hrefFor={hrefFor} />
        )
      }
      detail={
        noShows ? (
          <p className="p-6 text-sm text-muted-foreground">
            {emptyState ? 'No shows match these filters.' : 'Your wait list positions are below.'}
          </p>
        ) : (
          <div ref={detailTopRef}>
            <MyShowsList {...props} {...(selectedKey ? { onlyShowKey: selectedKey } : {})} />
          </div>
        )
      }
    />
  );
};
