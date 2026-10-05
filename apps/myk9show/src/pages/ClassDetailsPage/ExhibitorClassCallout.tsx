import { Star, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Chip } from '@/components/base/Chip';
import { formatRunQueueState } from '@myk9/ringside/run-queue';
import { PlacementPill } from '@/components/base/PlacementPill';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import { useMyEntryQueuePlaces, type QueuePlaces } from '@/hooks/queries/useMyEntryQueuePlaces';
import { withServerPlace } from '@/utils/showEntryRunQueue';
import { useMyEntriesInClass, type MyClassEntry } from './useMyEntriesInClass';

interface ExhibitorClassCalloutProps {
  classId: string | undefined;
  /** Released results read directly (bypasses stale replication store). */
  releasedRows?: RawEntryRow[];
}

export function ExhibitorClassCallout({ classId, releasedRows }: ExhibitorClassCalloutProps) {
  const { myEntries, isAfterClass } = useMyEntriesInClass(classId, releasedRows);

  if (myEntries.length === 0) return null;

  return isAfterClass ? (
    <YourResults entries={myEntries} />
  ) : (
    <YourDogsInClass entries={myEntries} />
  );
}

function YourDogsInClass({ entries }: { entries: MyClassEntry[] }) {
  const places = useMyEntryQueuePlaces(entries.map(entry => entry.entryId));
  const label = entries.length === 1 ? 'dog' : `${entries.length} dogs`;

  return (
    <div
      className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3"
      role="region"
      aria-label="Your dogs in this class"
    >
      <div className="flex items-center gap-2.5">
        <Star className="h-5 w-5 text-primary shrink-0" />
        <h3 className="text-base font-semibold">Your {label} in this class</h3>
      </div>

      <div className="space-y-2">
        {entries.map(entry => (
          <BeforeEntryRow key={entry.entryId} entry={entry} places={places} />
        ))}
      </div>
    </div>
  );
}

function BeforeEntryRow({ entry, places }: { entry: MyClassEntry; places: QueuePlaces }) {
  // MYK9-992: the stored run number is internal, and this page holds only the
  // exhibitor's own dogs, so it cannot count a place in line itself. MYK9-995:
  // the server counts it; until that answer is in (or when offline) the dog's
  // state shows, and nothing at all until the secretary has set an order.
  const queue = withServerPlace(entry.queue, places.get(entry.entryId));
  const dogsAhead = queue?.kind === 'waiting' && queue.place > 1 ? queue.place - 1 : 0;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      {queue && (
        <span className="shrink-0 min-w-[3.25rem] rounded-lg bg-primary px-2 py-1.5 text-center text-xs font-bold text-primary-foreground">
          {formatRunQueueState(queue)}
        </span>
      )}

      <span
        className="h-10 w-10 shrink-0 rounded-full bg-primary/15 flex items-center justify-center text-base font-bold text-primary"
        aria-hidden
      >
        {entry.dogName.charAt(0).toUpperCase()}
      </span>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{entry.dogName}</p>
        {entry.armband && (
          <p className="text-xs text-muted-foreground">
            Armband <span className="font-mono font-semibold">#{entry.armband}</span>
          </p>
        )}
        {dogsAhead > 0 && (
          <p className="text-xs text-muted-foreground">
            {dogsAhead} {dogsAhead === 1 ? 'dog' : 'dogs'} ahead
          </p>
        )}
      </div>
    </div>
  );
}

function YourResults({ entries }: { entries: MyClassEntry[] }) {
  return (
    <div className="space-y-3" role="region" aria-label="Your results">
      {entries.map(entry => (
        <ResultCallout key={entry.entryId} entry={entry} />
      ))}
    </div>
  );
}

function ResultCallout({ entry }: { entry: MyClassEntry }) {
  const result = entry.result;
  const qualified = result?.qualified ?? false;

  return (
    <div
      className={cn(
        'rounded-xl border-l-4 p-5',
        qualified
          ? 'border-l-success border border-success/30 bg-success/10 '
          : 'border-l-destructive border border-destructive/30 bg-destructive/10 '
      )}
    >
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span
          className="h-10 w-10 shrink-0 rounded-full bg-foreground/10 flex items-center justify-center text-base font-bold"
          aria-hidden
        >
          {entry.dogName.charAt(0).toUpperCase()}
        </span>

        <p className="text-xl font-semibold">{entry.dogName}</p>

        {qualified ? (
          <Chip color="green" size="md" leadingIcon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            QUALIFIED
          </Chip>
        ) : (
          <Chip color="red" size="md" leadingIcon={<XCircle className="h-3.5 w-3.5" />}>
            Not qualified
          </Chip>
        )}
      </div>

      {result && (
        <div className="flex flex-wrap gap-6">
          {result.time && (
            <Stat label="Search time">
              <span className="font-mono">{result.time}</span>
            </Stat>
          )}
          {qualified && result.faults !== undefined && <Stat label="Faults">{result.faults}</Stat>}
          {qualified && result.placement && (
            <Stat label="Placement">
              <PlacementPill placement={result.placement} size="md" />
            </Stat>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold text-foreground">{children}</p>
    </div>
  );
}
