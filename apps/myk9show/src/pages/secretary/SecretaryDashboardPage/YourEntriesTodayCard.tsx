import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PawPrint } from 'lucide-react';
import { useRefreshOnReturn } from '@/hooks/useRefreshOnReturn';
import { useSelfCheckinMap } from '@/hooks/queries/useSelfCheckinEnabled';
import { useMyEntriesData } from '@/pages/MyEntriesPage/modules/useMyEntriesData';
import { selectTodayEntryRows, todayClassIds } from '@/pages/MyEntriesPage/modules/todayEntryRows';

// The card links to My Shows and never hosts check-in, so nothing ever persists.
const noCheckInWrites = async () => {};

/**
 * Staff who also enter dogs: today's classes for their own dogs, read off the
 * same view model My Shows renders (MYK9-1524). A link only; absent when there
 * is nothing today. Liveness is My Shows' (MYK9-1523): re-read on return.
 */
export function YourEntriesTodayCard() {
  const { entries, readState, isError, refreshEntries } = useMyEntriesData({
    persistCheckInStatus: noCheckInWrites,
  });
  useRefreshOnReturn(refreshEntries);

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
  const selfCheckinByClassId = useSelfCheckinMap(
    useMemo(() => todayClassIds(entries, now), [entries, now])
  );
  const rows = useMemo(
    () => selectTodayEntryRows(entries, now, selfCheckinByClassId),
    [entries, now, selfCheckinByClassId]
  );

  const unconfirmed = isError || readState === 'unconfirmed' || readState === 'error';

  if (rows.length === 0) {
    // A confirmed empty read is silence; an unconfirmed one must not read as "nothing today".
    if (!unconfirmed) return null;
    return (
      <section aria-label="Your entries today" className="mx-5 mb-4 text-xs text-muted-foreground">
        <Link
          to="/exhibitor/entries"
          className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Couldn't check today's entries. Open My Shows
        </Link>
      </section>
    );
  }

  return (
    <section
      aria-label="Your entries today"
      className="mx-5 mb-4 rounded-xl border border-border bg-card/60"
    >
      <Link
        to="/exhibitor/entries"
        className="block rounded-xl px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              <span className="min-w-0 truncate">
                <span className="font-medium text-foreground">{row.dogName}</span>
                <span className="text-muted-foreground"> · {row.className}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{row.statusText}</span>
            </li>
          ))}
        </ul>
        {unconfirmed && (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing saved entries; we couldn't confirm them just now.
          </p>
        )}
      </Link>
    </section>
  );
}
