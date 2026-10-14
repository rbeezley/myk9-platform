import { Link } from 'react-router-dom';
import { ChevronRight, CheckCircle2, Clock, Hash, MapPin, XCircle } from 'lucide-react';
import { Chip } from '@/components/base/Chip';
import { PersonAvatar } from '@/components/common/PersonAvatar';
import { formatRunQueueState } from '@myk9/ringside/run-queue';
import type { EnrichedShowEntry } from '@/hooks/useShowEntriesForUser';
import { useMyEntryQueuePlaces, type QueuePlaces } from '@/hooks/queries/useMyEntryQueuePlaces';
import { useShowTrials } from '@/hooks/queries/useShowTrials';
import { isTrialDayAhead, isTrialDayPast } from '@/pages/MyEntriesPage/modules/dayCheckIn';
import { parseLocalDateString } from '@/utils/dateLocal';
import { withServerPlace } from '@/utils/showEntryRunQueue';
import { formatFaultCount } from '@/features/_shared/faultLabel';
import {
  getPendingResultLabel,
  hasUnpublishedScheduleDetails,
  UNPUBLISHED_SCHEDULE_DETAILS_MESSAGE,
} from './entryResultDisplay';
import { isRunnableScheduleStatus } from '@/services/entryDisplay/entryDisplaySelectors';
import { getStatusDescriptor } from '@/components/status';
import { getExhibitorLifecycleReviewLabel } from '@/components/entries/management/reviewStateLabels';
import { getTrialTimezone } from '@/features/registries';

interface WhereToBeProps {
  entries: EnrichedShowEntry[];
  showId: string;
}

export function WhereToBe({ entries, showId }: WhereToBeProps) {
  const scheduleEntries = entries.filter(entry => isRunnableScheduleStatus(entry.entryStatus));
  // Only dogs the row already calls waiting can take a server-counted place.
  const places = useMyEntryQueuePlaces(
    scheduleEntries.filter(entry => entry.queue?.kind === 'waiting-unknown').map(e => e.entryId)
  );
  const { data: trials } = useShowTrials(showId);
  if (scheduleEntries.length === 0) return null;
  // Validated through the registries helper; a trial not loaded yet has no
  // entry, and an unresolved zone makes no "past day" claim (see neverRan).
  const timezoneByTrialId = new Map(
    (trials ?? []).map(trial => [trial.id, getTrialTimezone(trial)])
  );
  const hasPendingScheduleDetails = hasUnpublishedScheduleDetails(scheduleEntries);

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

      {hasPendingScheduleDetails && (
        <p className="text-sm text-muted-foreground">{UNPUBLISHED_SCHEDULE_DETAILS_MESSAGE}</p>
      )}

      {Array.from(dayMap.entries()).map(([date, dayEntries]) => (
        <div key={date}>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {dayEntries[0]?.dayLabel ?? date}
          </p>
          <div className="space-y-1.5">
            {dayEntries.map(entry => (
              <TimelineRow
                key={entry.entryId}
                entry={entry}
                showId={showId}
                places={places}
                trialTimezone={timezoneByTrialId.get(entry.trialId)}
              />
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
  places: QueuePlaces;
  trialTimezone: string | undefined;
}

/**
 * MYK9-1109: a dog on a trial day that has passed, with no result and no
 * check-in state of its own, never ran. This is My Entries' "not run" rule
 * (`deriveClassRowState`), reckoned with the same trial-timezone day math.
 * Rows with a recorded state (in ring, done, pulled, withdrawn) keep it.
 */
function neverRan(entry: EnrichedShowEntry, trialTimezone: string | undefined): boolean {
  if (entry.hasResult || entry.result) return false;
  if (entry.checkInStatus && entry.checkInStatus !== 'no-status') return false;
  const kind = entry.queue?.kind;
  if (kind && kind !== 'waiting' && kind !== 'waiting-unknown') return false;
  // Never declare a day over before the trial's own zone is known: a guessed
  // zone would call a West Coast trial "Not run" while it is still that day.
  if (!trialTimezone) return false;
  return isTrialDayPast(parseLocalDateString(entry.trialDate), trialTimezone, new Date());
}

/**
 * MYK9-1173: a trial day still ahead in the trial's own zone makes no
 * place-in-line claim ("Next up" is about right now). Same zone rule as
 * `neverRan`: no resolved zone, no claim.
 */
function isFutureDay(entry: EnrichedShowEntry, trialTimezone: string | undefined): boolean {
  if (!trialTimezone) return false;
  return isTrialDayAhead(parseLocalDateString(entry.trialDate), trialTimezone, new Date());
}

function TimelineRow({ entry, showId, places, trialTimezone }: TimelineRowProps) {
  const href = `/shows/${showId}/trials/${entry.trialId}/classes/${entry.classId}`;
  const accessibleTimeLabel = entry.startTime || 'schedule details pending';
  // MYK9-992: place in line or the dog's state, never the stored run number.
  // MYK9-995: the place is the server's count; offline it stays the state.
  const didNotRun = neverRan(entry, trialTimezone);
  const futureDay = !didNotRun && isFutureDay(entry, trialTimezone);
  const queue = futureDay ? undefined : withServerPlace(entry.queue, places.get(entry.entryId));
  const positionLabel = didNotRun
    ? 'Not run'
    : futureDay
      ? null
      : queue
        ? formatRunQueueState(queue)
        : isRunnableScheduleStatus(entry.entryStatus)
          ? 'Order not set yet'
          : null;
  const checkInLabel = didNotRun
    ? null
    : entry.checkInStatus
      ? entry.checkInStatus === 'no-status'
        ? // MYK9-1173: a future day makes no claim at all. Whether check-in will
          // be offered (status, self check-in) is My Shows' call, so saying
          // "Check in on the day" here could contradict it.
          futureDay
          ? null
          : 'Not checked in'
        : getStatusDescriptor('entry', entry.checkInStatus).label
      : 'Check-in pending';

  return (
    <Link
      to={href}
      className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-3 transition-colors hover:bg-muted/70"
      aria-label={`${entry.classTitle} — ${entry.dayLabel} ${accessibleTimeLabel} — ${[positionLabel, checkInLabel].filter(Boolean).join(' — ')}`}
    >
      {(entry.startTime || entry.armband) && (
        <span className="flex w-28 shrink-0 flex-col gap-1">
          {entry.startTime && (
            <span className="inline-flex min-w-0 items-center gap-1 text-sm font-semibold tabular-nums text-foreground">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span className="font-mono">{entry.startTime}</span>
            </span>
          )}
          {entry.armband && (
            <span
              className="inline-flex min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground"
              aria-label={`Armband ${entry.armband}`}
            >
              <Hash className="h-3 w-3" />
              <span className="truncate">{entry.armband}</span>
            </span>
          )}
        </span>
      )}

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
        <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          {positionLabel && <span>{positionLabel}</span>}
          {checkInLabel && <span>{checkInLabel}</span>}
        </p>
      </div>

      <ResultChip entry={entry} didNotRun={didNotRun} />

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function ResultChip({ entry, didNotRun }: { entry: EnrichedShowEntry; didNotRun: boolean }) {
  const reviewLabel = getExhibitorLifecycleReviewLabel(entry.entryStatus);
  if (reviewLabel) {
    return (
      <Chip color="stone" size="sm">
        {reviewLabel}
      </Chip>
    );
  }

  // A dog that never ran is not waiting on a result (MYK9-1109).
  const pendingLabel = didNotRun ? null : getPendingResultLabel(entry);

  if (pendingLabel) {
    return (
      <Chip color="stone" size="sm">
        {pendingLabel}
      </Chip>
    );
  }

  const result = entry.result;
  if (!result) return null;

  const { qualified, time, isPreliminary, faults } = result;
  // Same rule as the at-show Completed tab: faults only on a qualifying run.
  const faultLabel = qualified ? formatFaultCount(faults) : null;
  const faultSuffix = faultLabel ? ` · ${faultLabel}` : '';
  // MYK9-263/MYK9-805: an unreleased result reads "preliminary" here exactly
  // as it does on My Shows — the one result the schedule can still change.
  const preliminarySuffix = isPreliminary ? ' · preliminary' : '';
  if (qualified) {
    return (
      <Chip color="green" size="sm" leadingIcon={<CheckCircle2 className="h-3 w-3" />}>
        Q{time ? ` · ${time}` : ''}
        {faultSuffix}
        {preliminarySuffix}
      </Chip>
    );
  }
  return (
    <Chip color="red" size="sm" leadingIcon={<XCircle className="h-3 w-3" />}>
      NQ{preliminarySuffix}
    </Chip>
  );
}
