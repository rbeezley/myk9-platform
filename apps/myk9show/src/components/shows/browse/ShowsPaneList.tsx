import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SearchBar } from '@/components/common/SearchBar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BrowseTabs } from '@/components/layout/BrowseTabs';
import { CompactRecordList } from '@/components/layout/CompactRecordList';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useBrowseShowsList } from '@/hooks/useBrowseShowsList';
import { ShowPermissionValidator } from '@/utils/permissionValidation';
import { getUserManagedShows } from '@/utils/show-relationships';
import { formatShowDateRange } from '@/lib/format/dates';
import type { Show } from '@/types/show-types';
import { groupShowsForPane, REGROUP_INTERVAL_MS } from './showsPaneGroups';

interface ShowsPaneListProps {
  /** The show open in the detail pane, if any. */
  selectedId: string | undefined;
  /** Rendered beside the search box, e.g. the control that folds the list away. */
  headerAction?: React.ReactNode;
}

function matchesSearch(show: Show, needle: string): boolean {
  return [show.name, show.clubName, show.location]
    .filter(Boolean)
    .some(value => value.toLowerCase().includes(needle));
}

/**
 * The Shows list in the left pane: Managing (the viewer's current shows), then Today, Upcoming and
 * Past for the rest, her over shows pinned first in Past
 * (docs/plan-sidebar-browse-pane.md, phase 2). It reads the same list as Find Shows
 * (`useBrowseShowsList`: the shows replica for a signed-in account), so it lists from the device
 * when offline and adds no network read.
 */
export const ShowsPaneList: React.FC<ShowsPaneListProps> = ({ selectedId, headerAction }) => {
  const { userWithRoles, isAdmin, isSecretary } = useAuthContext();
  const { shows, isLoading, showsError, retryShows } = useBrowseShowsList();
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), REGROUP_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // "Managing" means what Find Shows' Managing tab means, so the two panes never disagree.
  // A site admin manages every show, so nothing is singled out for them.
  const managedIds = useMemo(() => {
    if (isAdmin || !userWithRoles) return new Set<string>();
    const userId = userWithRoles.databaseUserId ?? userWithRoles.id;
    return new Set(
      getUserManagedShows(userId, shows, userWithRoles.roles ?? [], userWithRoles.scopes ?? []).map(
        show => show.id
      )
    );
  }, [isAdmin, userWithRoles, shows]);
  const isManaged = useCallback((show: Show) => managedIds.has(show.id), [managedIds]);

  const visibleShows = useMemo(
    () => ShowPermissionValidator.filterShows(shows, userWithRoles),
    [shows, userWithRoles]
  );
  const needle = search.trim().toLowerCase();
  const groups = useMemo(() => {
    const matching = needle
      ? visibleShows.filter(show => matchesSearch(show, needle))
      : visibleShows;
    return groupShowsForPane(matching, isManaged, now);
  }, [visibleShows, needle, isManaged, now]);

  let body: React.ReactNode;
  if (isLoading && visibleShows.length === 0) {
    body = (
      <div className="space-y-2" aria-busy="true" aria-label="Loading shows">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    );
  } else if (showsError && visibleShows.length === 0) {
    body = (
      <div role="alert" className="rounded-lg border bg-card p-4 text-sm">
        <p className="font-medium">Couldn&apos;t load your shows.</p>
        {selectedId && <p className="mt-1 text-muted-foreground">The open show still works.</p>}
        <Button className="mt-3" variant="outline" onClick={() => void retryShows()}>
          Retry
        </Button>
      </div>
    );
  } else if (visibleShows.length === 0) {
    body = (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <p>No shows yet.</p>
        {isSecretary && (
          <Link
            className="mt-2 inline-block font-medium text-primary underline"
            to="/secretary/dashboard"
          >
            Go to Show Management
          </Link>
        )}
      </div>
    );
  } else if (groups.length === 0) {
    body = (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <p>No shows match &ldquo;{search.trim()}&rdquo;.</p>
        <Button className="mt-2 px-0" variant="link" onClick={() => setSearch('')}>
          Show all shows
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        {groups.map(group => (
          <section key={group.id} aria-labelledby={`shows-pane-${group.id}`}>
            <h2
              id={`shows-pane-${group.id}`}
              className="mb-1.5 px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {group.label}
            </h2>
            <CompactRecordList
              items={group.shows}
              selectedId={selectedId}
              label={`${group.label} shows`}
              getId={show => show.id}
              getHref={show => `/shows/${show.id}`}
              getName={show => show.name}
              renderRow={show => ({
                title: show.name,
                subtitle: [
                  // Inside the Managing section the tag would repeat on every row.
                  group.id !== 'managing' && isManaged(show) ? 'Managing' : '',
                  show.status === 'draft' ? 'Draft' : '',
                  formatShowDateRange(show.startDate, show.endDate),
                  show.clubName,
                ]
                  .filter(Boolean)
                  .join(' · '),
              })}
            />
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* The switch to Dogs, People and Clubs sits above the list; only the rows scroll. */}
      <BrowseTabs
        tablistClassName="mb-3 shrink-0 sm:w-full"
        panelClassName="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex shrink-0 items-center gap-2 pb-3">
          <SearchBar
            size="sm"
            value={search}
            onChange={setSearch}
            placeholder="Search shows"
            aria-label="Search the shows list"
            className="flex-1"
          />
          {headerAction}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">{body}</div>
      </BrowseTabs>
    </div>
  );
};
