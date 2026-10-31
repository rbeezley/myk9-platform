import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PawPrint } from 'lucide-react';
import { useRefreshOnReturn } from '@/hooks/useRefreshOnReturn';
import { useSelfCheckinMap, useSelfCheckinStateMap } from '@/hooks/queries/useSelfCheckinEnabled';
import { useMyEntriesData } from '@/pages/MyEntriesPage/modules/useMyEntriesData';
import { useMyEntriesPresentation } from '@/pages/MyEntriesPage/modules/useMyEntriesPresentation';
import {
  hasUndatedClass,
  selectTodayEntryRows,
  todayClassIds,
} from '@/pages/MyEntriesPage/modules/todayEntryRows';

// The card links to My Shows and never hosts check-in, so nothing ever persists.
const noCheckInWrites = async () => {};

const LINK_FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Staff who also enter dogs: today's classes for their own dogs (MYK9-1524).
 * The card owns no derivation. Which branch to show comes from My Shows'
 * `useMyEntriesPresentation`, each row's status from the `classRowDisplay`
 * function My Shows' rows render from, and the day from the trial-day gate in
 * `dayCheckIn`. A link only; absent when there is nothing today. Liveness is
 * My Shows' (MYK9-1523): re-read on return.
 */
export function YourEntriesTodayCard() {
  const data = useMyEntriesData({ persistCheckInStatus: noCheckInWrites });
  const { entries, readState, isError, isLoading, identityState, refreshEntries } = data;
  useRefreshOnReturn(refreshEntries);
  const presentation = useMyEntriesPresentation(data);

  // Today is a property of the clock, not of the data: re-read it whenever the
  // entries change and once a minute, so a dashboard left open across midnight
  // moves to the new day.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick(n => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [entries, tick]);

  // Keyed on the ids' CONTENT so the tick can never change the settings
  // queries' keys.
  const classIdsKey = todayClassIds(entries, now).sort().join(',');
  const classIds = useMemo(() => (classIdsKey ? classIdsKey.split(',') : []), [classIdsKey]);
  // My Shows' own (optimistic while loading) map decides what a row says; the
  // tri-state map only ever makes the card more conservative than My Shows.
  const selfCheckinByClassId = useSelfCheckinMap(classIds);
  const selfCheckinStateByClassId = useSelfCheckinStateMap(classIds);
  const rows = useMemo(
    () =>
      presentation === 'known-rows'
        ? selectTodayEntryRows(entries, now, selfCheckinByClassId, selfCheckinStateByClassId)
        : [],
    [presentation, entries, now, selfCheckinByClassId, selfCheckinStateByClassId]
  );

  const unconfirmed = isError || readState === 'unconfirmed' || readState === 'error';
  // One completeness verdict for the list: the read is confirmed AND every
  // class has a known day. Without it, "nothing today" is not a fact, and a
  // list of rows may be missing a class.
  const undated = hasUndatedClass(entries, now);
  const incomplete = unconfirmed || undated;

  // Still reading is not a failed read: say nothing until the read settles, so
  // an ordinary load never flashes "couldn't check".
  const stillReading =
    isLoading || identityState === 'pending-auth' || readState === 'read-pending';

  const cannotSayNothingToday =
    presentation === 'identity-pending' ||
    presentation === 'unconfirmed-empty' ||
    (presentation === 'known-rows' && rows.length === 0 && incomplete);

  if (stillReading && rows.length === 0) return null;
  if (cannotSayNothingToday) {
    return (
      <section aria-label="Your entries today" className="mx-5 mb-4 text-xs text-muted-foreground">
        <Link
          to="/exhibitor/entries"
          className={`inline-flex min-h-11 items-center underline underline-offset-2 ${LINK_FOCUS}`}
        >
          Couldn't check today's entries. Open My Shows
        </Link>
      </section>
    );
  }
  if (rows.length === 0) return null;

  return (
    <section
      aria-label="Your entries today"
      className="mx-5 mb-4 rounded-xl border border-border bg-card/60"
    >
      <Link
        to="/exhibitor/entries"
        className={`block rounded-xl px-4 py-3 transition-colors hover:bg-muted/40 ${LINK_FOCUS}`}
      >
        <div className="flex items-center gap-2">
          <PawPrint className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Your entries today
          </span>
        </div>
        <ul className="mt-2 flex flex-col gap-1.5">
          {rows.map(row => (
            <li key={row.key} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate">
                  <span className="font-medium text-foreground">{row.dogName}</span>
                  <span className="text-muted-foreground"> · {row.className}</span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">{row.where}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{row.statusText}</span>
            </li>
          ))}
        </ul>
        {incomplete && (
          <p className="mt-2 text-xs text-muted-foreground">
            {unconfirmed
              ? "Showing saved entries; we couldn't confirm them just now."
              : 'Some entries may be missing from this list. Open My Shows to check.'}
          </p>
        )}
      </Link>
    </section>
  );
}
