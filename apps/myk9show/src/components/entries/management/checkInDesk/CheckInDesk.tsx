import { useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/common/SearchBar';
import { ListResultLine, ListViewTabs, type ListView } from '@/components/list-toolkit';
import { useShowDeskScheduleRead } from '@/pages/secretary/useShowDeskScheduleRead';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  buildCheckInDeskClasses,
  buildCheckInDeskPeople,
  filterCheckInDesk,
  groupCheckInDeskDogs,
  readCheckInFilter,
  writeCheckInFilter,
  type CheckInDeskFilter,
} from './checkInDeskModel';
import { CheckInDeskDogCard } from './CheckInDeskDogCard';
import { AMOUNT_NOT_AVAILABLE, deskOwedByPayer, deskOwedHref, owesLabel } from './deskAmountOwed';
import { classIdsOnDay, firstClassLine } from './firstClassForExhibitor';
import { useCheckInDeskActions } from './useCheckInDeskActions';
import { useMinuteClock } from './useMinuteClock';
import { useDeskPull } from './useDeskPull';
import { DeskPullDialogs } from './DeskPullDialogs';
import { changeDeskRowStatus } from './deskRowStatus';
import type { EntriesRefresh } from '@/components/entries/management/checkInDesk/entriesRefresh';

interface CheckInDeskProps {
  showId: string;
  entries: readonly EntryManagementEntry[];
  /** Entries are still loading, or the read failed (unknown, not empty). */
  loading: boolean;
  unknown: boolean;
  onRetry: () => void;
  /** Re-reads the page's entries after a write, handed the ids whose writes were stored. */
  onRefreshEntries?: EntriesRefresh;
  /** Fixed clock for tests; the desk otherwise ticks once a minute. */
  currentDate?: Date | null;
}

const EXHIBITOR_NOUN = ['exhibitor', 'exhibitors'] as const;

/**
 * Entry Forms' "Check-in desk" (MYK9-1689): everyone entered on the show, one card per dog
 * (MYK9-1736) with its armband, its classes and a status per class. One tap checks a dog in to
 * everything waiting today; a class's status opens the picker for the exceptions (Conflict, undo).
 * INTENT: search is the first thing the secretary does at the desk, so it takes focus on open.
 */
export function CheckInDesk({
  showId,
  entries,
  loading,
  unknown,
  onRetry,
  onRefreshEntries,
  currentDate,
}: CheckInDeskProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = readCheckInFilter(searchParams);
  const [search, setSearch] = useState('');
  const now = useMinuteClock(currentDate);
  const { trials, trialClasses, readPending, readFailed, retry } = useShowDeskScheduleRead();
  const { busyIds, error, errorIds, notice, setStatus } = useCheckInDeskActions(onRefreshEntries);
  const classes = useMemo(
    () =>
      buildCheckInDeskClasses(
        trials.filter(trial => trial.showId === showId),
        trialClasses
      ),
    [showId, trialClasses, trials]
  );
  const people = useMemo(
    () => buildCheckInDeskPeople(entries, classes, now),
    [classes, now, entries]
  );
  const owedByPayer = useMemo(() => deskOwedByPayer(entries), [entries]);
  const dayClassIds = useMemo(() => classIdsOnDay(classes, now), [classes, now]);
  const rowsByEntryId = useMemo(
    () => new Map(people.flatMap(person => person.classRows.map(row => [row.entryId, row]))),
    [people]
  );
  const pull = useDeskPull(entryId => rowsByEntryId.get(entryId), onRefreshEntries);
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
          Try again
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
        <div className="max-w-2xl space-y-4">
          {visible.map(person => {
            const dogs = groupCheckInDeskDogs(person);
            const waitingDogs = dogs.filter(dog => dog.pendingEntryIds.length > 0);
            const anyBusy = person.classRows.some(row => busyIds.has(row.entryId));
            const firstClass = firstClassLine(person.classRows, dayClassIds);
            const owed = owedByPayer.get(person.id);
            return (
              <section key={person.id} aria-label={person.name} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-x-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{person.name}</h3>
                    {person.alternateNames.length > 0 && (
                      <p className="truncate text-xs text-muted-foreground">
                        Also entered as {person.alternateNames.join(', ')}
                      </p>
                    )}
                    {owed && (
                      <Link
                        to={deskOwedHref(showId, person.name, owed.formKeys)}
                        className="inline-flex min-h-11 items-center text-xs font-medium text-warning underline-offset-2 hover:underline"
                      >
                        {owed.unknown ? AMOUNT_NOT_AVAILABLE : owesLabel(owed.amount)}
                      </Link>
                    )}
                  </div>
                  {waitingDogs.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 gap-2"
                      disabled={anyBusy}
                      onClick={() =>
                        void setStatus(
                          person.name,
                          waitingDogs.flatMap(dog => dog.pendingEntryIds),
                          'checked-in'
                        )
                      }
                    >
                      <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                      Check in all {waitingDogs.length} dogs
                    </Button>
                  )}
                </div>
                {/* Below the header row, so "Check in all" keeps its place beside the name. */}
                {firstClass && <p className="text-sm text-muted-foreground">{firstClass}</p>}
                {dogs.map(dog => (
                  <CheckInDeskDogCard
                    key={dog.key}
                    dog={dog}
                    personName={person.name}
                    busyIds={busyIds}
                    error={dog.rows.some(row => errorIds.has(row.entryId)) ? error : null}
                    onCheckIn={target =>
                      void setStatus(target.dogName, target.pendingEntryIds, 'checked-in')
                    }
                    onSetStatus={(row, status) =>
                      changeDeskRowStatus(row, status, { setStatus }, pull)
                    }
                    onUnpull={pull.requestUnpull}
                    clearingId={pull.clearingId}
                    onClearFlag={row => void pull.clearFlag(row)}
                  />
                ))}
              </section>
            );
          })}
        </div>
      )}
      <DeskPullDialogs pull={pull} />
    </div>
  );
}
