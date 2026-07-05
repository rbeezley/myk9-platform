import { Link } from 'react-router-dom';
import { ChevronRight, CheckCircle2, Clock, Hash, MapPin, XCircle } from 'lucide-react';
import { Chip } from '@/components/base/Chip';
import { PersonAvatar } from '@/components/common/PersonAvatar';
import type { EnrichedShowEntry } from '@/hooks/useShowEntriesForUser';
import { getPendingResultLabel } from './entryResultDisplay';
import { isRunnableScheduleStatus } from '@/services/entryDisplay/entryDisplaySelectors';

interface WhereToBeProps {
  entries: EnrichedShowEntry[];
  showId: string;
}

export function WhereToBe({ entries, showId }: WhereToBeProps) {
  const scheduleEntries = entries.filter(entry => isRunnableScheduleStatus(entry.entryStatus));
  if (scheduleEntries.length === 0) return null;

  // Group by day, preserving the sorted order from the hook (already by date+time).
  const dayMap = new Map<string, EnrichedShowEntry[]>();
  for (const e of scheduleEntries) {
    const bucket = dayMap.get(e.trialDate);
    if (bucket) bucket.push(e);
    else dayMap.set(e.trialDate, [e]);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2.5">
        <MapPin className="h-5 w-5 text-primary shrink-0" />
        <h2 className="text-lg font-semibold">Where to be &amp; when</h2>
      </div>

      {Array.from(dayMap.entries()).map(([date, dayEntries]) => (
        <div key={date}>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {dayEntries[0]?.dayLabel ?? date}
          </p>
          <div className="space-y-1.5">
            {dayEntries.map(entry => (
              <TimelineRow key={entry.entryId} entry={entry} showId={showId} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface TimelineRowProps {
  entry: EnrichedShowEntry;
  showId: string;
}

function TimelineRow({ entry, showId }: TimelineRowProps) {
  const href = `/shows/${showId}/trials/${entry.trialId}/classes/${entry.classId}`;
  const startTimeLabel = entry.startTime || 'Time pending';
  const armbandLabel = entry.armband || 'Armband pending';

  return (
    <Link
      to={href}
      className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-3 transition-colors hover:bg-muted/70"
      aria-label={`${entry.classTitle} — ${entry.dayLabel} ${startTimeLabel}`}
    >
      <span className="flex w-28 shrink-0 flex-col gap-1">
        <span className="inline-flex min-w-0 items-center gap-1 text-sm font-semibold tabular-nums text-foreground">
          <Clock className="h-3.5 w-3.5 text-primary" />
          <span className={entry.startTime ? 'font-mono' : 'truncate text-xs font-medium'}>
            {startTimeLabel}
          </span>
        </span>
        <span
          className="inline-flex min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground"
          aria-label={entry.armband ? `Armband ${entry.armband}` : armbandLabel}
        >
          <Hash className="h-3 w-3" />
          <span className="truncate">{armbandLabel}</span>
        </span>
      </span>

      <PersonAvatar name={entry.dogName} size="sm" className="h-7 w-7" />

      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-semibold">
          {entry.dogName}
          {entry.classTitle && (
            <span className="font-normal text-muted-foreground"> · {entry.classTitle}</span>
          )}
        </p>
        {(entry.startTime || entry.trialName || entry.judgeName) && (
          <p className="text-xs text-muted-foreground truncate">
            {[entry.startTime, entry.trialName, entry.judgeName ? `Judge ${entry.judgeName}` : '']
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>

      <ResultChip entry={entry} />

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function ResultChip({ entry }: { entry: EnrichedShowEntry }) {
  const pendingLabel = getPendingResultLabel(entry);

  if (pendingLabel) {
    return (
      <Chip color="stone" size="sm">
        {pendingLabel}
      </Chip>
    );
  }

  const result = entry.result;
  if (!result) return null;

  const { qualified, time } = result;
  if (qualified) {
    return (
      <Chip color="green" size="sm" leadingIcon={<CheckCircle2 className="h-3 w-3" />}>
        Q{time ? ` · ${time}` : ''}
      </Chip>
    );
  }
  return (
    <Chip color="red" size="sm" leadingIcon={<XCircle className="h-3 w-3" />}>
      NQ
    </Chip>
  );
}
