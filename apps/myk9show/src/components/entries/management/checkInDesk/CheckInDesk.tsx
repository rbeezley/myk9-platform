import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status';
import { SearchBar } from '@/components/common/SearchBar';
import { ListResultLine, ListViewTabs, type ListView } from '@/components/list-toolkit';
import { formatStartTime } from '@/components/schedule/schedule-timeline.utils';
import { useShowDeskScheduleRead } from '@/pages/secretary/useShowDeskScheduleRead';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  buildCheckInDeskClasses,
  buildCheckInDeskPeople,
  filterCheckInDesk,
  readCheckInFilter,
  writeCheckInFilter,
  type CheckInDeskFilter,
} from './checkInDeskModel';
import { useCheckInDeskActions } from './useCheckInDeskActions';

interface CheckInDeskProps {
  showId: string;
  entries: readonly EntryManagementEntry[];
  /** Entries are still loading, or the read failed (unknown, not empty). */
  loading: boolean;
  unknown: boolean;
  onRetry: () => void;
  /** Fixed clock for tests; the desk otherwise ticks once a minute. */
  currentDate?: Date | null;
}

const SETTLED = new Set<string | undefined>(['checked-in', 'pulled', 'completed']);
const EXHIBITOR_NOUN = ['exhibitor', 'exhibitors'] as const;

/**
 * Entry Forms' "Check-in desk" (MYK9-1689): everyone entered on the show with armband, ring,
 * time and check-in state per entry, and the one-tap check-ins the secretary needs at the desk.
 * INTENT: search is the first thing the secretary does at the desk, so it takes focus on open.
 */
export function CheckInDesk({
  showId,
  entries,
  loading,
  unknown,
  onRetry,
  currentDate,
}: CheckInDeskProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = readCheckInFilter(searchParams);
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(() => new Date());
  const { trials, trialClasses, readPending, readFailed, retry } = useShowDeskScheduleRead();
  const { checkedInIds, busyIds, error, notice, checkIn } = useCheckInDeskActions();

  useEffect(() => {
    if (currentDate) return undefined;
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, [currentDate]);

  const classes = useMemo(
    () =>
      buildCheckInDeskClasses(
        trials.filter(trial => trial.showId === showId),
        trialClasses
      ),
    [showId, trialClasses, trials]
  );
  const shownEntries = useMemo(
    () =>
      entries.map(entry =>
        // Local override only until refreshed data speaks: a pull or completion
        // that arrives later is not masked by it.
        checkedInIds.has(entry.id) && entry.classes.every(cls => !SETTLED.has(cls.checkInStatus))
          ? {
              ...entry,
              classes: entry.classes.map(cls => ({
                ...cls,
                checkInStatus: 'checked-in' as const,
                checkInTime: new Date(),
              })),
            }
          : entry
      ),
    [checkedInIds, entries]
  );
  const people = useMemo(
    () => buildCheckInDeskPeople(shownEntries, classes, currentDate ?? now),
    [classes, currentDate, now, shownEntries]
  );
  const visible = useMemo(
    () => filterCheckInDesk(people, search, filter),
    [filter, people, search]
  );
  const views = useMemo<ListView[]>(
    () => [
      { id: 'all', label: 'All exhibitors', count: people.length },
      {
        id: 'not-checked-in',
        label: 'Not checked in',
        count: filterCheckInDesk(people, '', 'not-checked-in').length,
      },
    ],
    [people]
  );

  const setFilter = (next: CheckInDeskFilter) =>
    setSearchParams(previous => writeCheckInFilter(previous, next), { replace: true });

  if (loading || (readPending && trials.length === 0)) {
    return <div className="py-6 text-sm text-muted-foreground">Loading exhibitors...</div>;
  }
  if (unknown || readFailed) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <p className="font-medium text-destructive">Couldn't load exhibitors.</p>
        <p className="mt-1 text-muted-foreground">
          We could not load the exhibitor list. Retry, or carry on from the class schedule.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            if (unknown) onRetry();
            if (readFailed) void retry();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search name, dog, armband"
          size="sm"
          className="w-full sm:w-72 lg:w-80"
          autoFocus
        />
        <ListViewTabs
          label="Check-in desk views"
          views={views}
          activeId={filter}
          onSelect={id => setFilter(id as CheckInDeskFilter)}
        />
      </div>
      <ListResultLine
        shown={visible.length}
        total={people.length}
        noun={EXHIBITOR_NOUN}
        filtered={filter !== 'all' || search.trim() !== ''}
        onShowAll={() => {
          setFilter('all');
          setSearch('');
        }}
      />

      {error && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {notice ?? ''}
      </span>

      {people.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No exhibitors are entered for this show yet.
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No exhibitors match this view.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          {visible.map(person => {
            const eligibleIds = person.classRows
              .filter(row => row.eligibleForCheckIn)
              .map(row => row.entryId);
            const anyBusy = person.classRows.some(row => busyIds.has(row.entryId));
            return (
              <section
                key={person.id}
                aria-label={person.name}
                className="space-y-2 border-b p-3 last:border-b-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{person.name}</h3>
                    {person.alternateNames.length > 0 && (
                      <p className="truncate text-xs text-muted-foreground">
                        Also entered as {person.alternateNames.join(', ')}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11 gap-2"
                    onClick={() => void checkIn(person.name, eligibleIds)}
                    disabled={eligibleIds.length === 0 || anyBusy}
                  >
                    <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                    Check in all eligible
                  </Button>
                </div>
                {person.classRows.map(row => {
                  const busy = busyIds.has(row.entryId);
                  const timeLabel = formatStartTime(row.time);
                  return (
                    <div
                      key={row.id}
                      className="grid gap-3 rounded-md border p-3 sm:grid-cols-[5rem_1fr_auto] sm:items-center"
                    >
                      <div className="rounded-md border bg-muted/30 px-3 py-2 text-center">
                        <span className="block text-base font-semibold">
                          {row.armband ?? 'Missing'}
                        </span>
                        <span className="block text-[11px] uppercase text-muted-foreground">
                          armband
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{row.dogName}</p>
                        <p className="text-sm text-muted-foreground">
                          {row.className}
                          {row.ring ? ` · ${row.ring}` : ''}
                          {timeLabel ? ` - ${timeLabel}` : ''}
                        </p>
                        <StatusBadge
                          family="entry"
                          status={row.statusValue}
                          label={row.statusLabel}
                          className="mt-1 text-xs"
                        />
                      </div>
                      {row.eligibleForCheckIn ? (
                        <Button
                          type="button"
                          size="sm"
                          className="min-h-11"
                          disabled={busy}
                          aria-label={`Check in ${row.dogName}, ${row.className}`}
                          onClick={() => void checkIn(person.name, [row.entryId])}
                        >
                          {busy ? 'Checking in...' : 'Check in'}
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
