import { Star, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Chip } from '@/components/base/Chip';
import { PlacementPill } from '@/components/base/PlacementPill';
import { useMyEntriesInClass, type MyClassEntry } from './useMyEntriesInClass';

interface ExhibitorClassCalloutProps {
  classId: string | undefined;
}

export function ExhibitorClassCallout({ classId }: ExhibitorClassCalloutProps) {
  const { myEntries, isAfterClass } = useMyEntriesInClass(classId);

  if (myEntries.length === 0) return null;

  return isAfterClass ? (
    <YourResults entries={myEntries} />
  ) : (
    <YourDogsInClass entries={myEntries} />
  );
}

function YourDogsInClass({ entries }: { entries: MyClassEntry[] }) {
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
          <BeforeEntryRow key={entry.entryId} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function BeforeEntryRow({ entry }: { entry: MyClassEntry }) {
  const isNextUp = entry.dogsAhead === 0 && entry.runOrder > 0;
  const estimatedMinutes = entry.dogsAhead * 3;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      {entry.runOrder > 0 && (
        <span className="shrink-0 h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-mono text-sm font-bold">
          #{entry.position}
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
      </div>

      {isNextUp ? (
        <Chip color="red" size="md">
          You&rsquo;re up next!
        </Chip>
      ) : entry.dogsAhead > 0 ? (
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-primary">~{estimatedMinutes} min</p>
          <p className="text-xs text-muted-foreground">
            {entry.dogsAhead} {entry.dogsAhead === 1 ? 'dog' : 'dogs'} ahead
          </p>
        </div>
      ) : null}
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
          ? 'border-l-green-500 border border-green-200 bg-green-50/60 dark:border-green-800 dark:bg-green-950/20'
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
