import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SearchBar } from '@/components/common/SearchBar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CompactRecordList } from '@/components/layout/CompactRecordList';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useBrowseShowsList } from '@/hooks/useBrowseShowsList';
import { ShowPermissionValidator } from '@/utils/permissionValidation';
import { managedClubIds } from '@/utils/roleScopes';
import { formatShowDateRange } from '@/lib/format/dates';
import type { Show } from '@/types/show-types';
import { groupShowsForPane } from './showsPaneGroups';

// Show days turn over at each show's own midnight, not the viewer's, so re-group on a timer.
const REGROUP_INTERVAL_MS = 5 * 60 * 1000;

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
 * The Shows list in the left pane: Today, Upcoming and Past, the viewer's own shows first in each
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

  // The same rule that decided the old "Today's show" rail link: a show is the viewer's when they
  // are staff of its club. A site admin manages every show, so nothing is singled out for them.
  const managed = useMemo(
    () => managedClubIds({ isAdmin, userWithRoles }),
    [isAdmin, userWithRoles]
  );
  const isManaged = useCallback(
    (show: Show) => managed !== null && !!show.clubId && managed.has(show.clubId),
    [managed]
  );

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
        <p className="mt-1 text-muted-foreground">The open show still works.</p>
        <Button className="mt-3" variant="outline" size="sm" onClick={() => void retryShows()}>
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
        <Button className="mt-2 px-0" variant="link" size="sm" onClick={() => setSearch('')}>
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
              className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
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
                  isManaged(show) ? 'Managing' : '',
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
      <div className="flex shrink-0 items-center gap-2 pb-3">
        <SearchBar
          size="sm"
          value={search}
          onChange={setSearch}
          placeholder="Search this list"
          aria-label="Search the shows list"
          className="flex-1"
        />
        {headerAction}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">{body}</div>
    </div>
  );
};
