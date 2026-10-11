/**
 * "Your dogs today": on a show's day, every class the exhibitor's dogs are due
 * to run, in run order across all dogs (MYK9-1046). It sits at the top of the
 * show group and links to nothing new: check-in is the existing flow, "View
 * class" the existing class page, and receipts, edits and payments stay on the
 * dog cards below.
 *
 * Place in line is the server's count (`useMyEntryQueuePlacesWithFreshness`,
 * MYK9-995) and always carries the time it was counted. Offline it is simply
 * absent, and the list says it is showing saved information.
 *
 * @module MyEntriesPage/modules/YourDogsToday
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Clock3, TriangleAlert } from 'lucide-react';
import { formatRunQueueState } from '@myk9/ringside/run-queue';
import { Button } from '@/components/ui/button';
import { getStatusDescriptor, StatusBadge } from '@/components/status';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { useMyEntryQueuePlacesWithFreshness } from '@/hooks/queries/useMyEntryQueuePlaces';
import { useMyRingConflicts } from '@/features/at-show/useMyRingConflicts';
import {
  deriveAtShowQueueLine,
  isAwaitingPlaceInLine,
  type AtShowEntryDetail,
} from '@/features/at-show/myAtShowEntryDetails.helpers';
import { formatTime } from '@/lib/format/dates';
import { EXHIBITOR_STATUS_LABELS, type CheckInStatus } from '@/types/check-in-types';
import type { UserEntriesSource } from '@/services/database/entries';
import {
  buildYourDogsToday,
  filterYourDogsToday,
  type YourDogsTodayRow,
} from './buildYourDogsToday';
import type { DayCheckInContext } from './dayCheckIn';
import type { MyShowClass, MyShowDog } from './groupEntriesByShow';
import { useClassTimings } from './useClassTimings';

export interface YourDogsTodayProps {
  showId: string;
  dogs: MyShowDog[];
  checkInContext: DayCheckInContext;
  source: UserEntriesSource;
  onCheckInClass: (dog: MyShowDog, cls: MyShowClass) => void;
}

/** The slice of an entry the shared queue rules read, from a My Shows class row. */
function toQueueDetail(row: YourDogsTodayRow): AtShowEntryDetail {
  return {
    entryId: row.cls.id,
    classId: row.cls.classId ?? null,
    dogName: row.dog.dogName,
    armband: row.dog.armband ?? null,
    checkInStatus: (row.cls.checkInStatus ?? 'no-status') as CheckInStatus,
    className: row.cls.name,
    expectedStartLabel: row.timing?.label ?? null,
    isRevisedStart: row.timing?.isRevised ?? false,
    hasRunOrder: row.cls.runOrder != null,
    isScored: row.cls.isScored === true,
    resultStatus: null,
    resultTimeSeconds: null,
    selfCheckinState: 'unknown',
    trialLabel: null,
  };
}

function statusLabel(checkInStatus: CheckInStatus | undefined): string {
  const status = checkInStatus ?? 'no-status';
  return EXHIBITOR_STATUS_LABELS[status] ?? getStatusDescriptor('entry', status).label;
}

export const YourDogsToday: React.FC<YourDogsTodayProps> = ({
  showId,
  dogs,
  checkInContext,
  source,
  onCheckInClass,
}) => {
  const isOnline = useIsOnline();
  const [selectedDogId, setSelectedDogId] = React.useState<string | null>(null);

  const timeZone = dogs[0]?.classes[0]?.trialTimezone ?? 'America/New_York';
  const targets = React.useMemo(
    () =>
      dogs.flatMap(dog =>
        dog.classes.flatMap(cls =>
          cls.classId ? [{ classId: cls.classId, timeZone: cls.trialTimezone ?? timeZone }] : []
        )
      ),
    [dogs, timeZone]
  );
  const timings = useClassTimings(targets);

  const dayRows = React.useMemo(
    () => buildYourDogsToday(dogs, checkInContext, timings),
    [dogs, checkInContext, timings]
  );
  const { rows, options, total } = filterYourDogsToday(dayRows, selectedDogId);

  const awaitingIds = React.useMemo(
    () =>
      dayRows
        .map(toQueueDetail)
        .filter(isAwaitingPlaceInLine)
        .map(detail => detail.entryId),
    [dayRows]
  );
  const { places, updatedAt } = useMyEntryQueuePlacesWithFreshness(awaitingIds);

  const ownEntryIds = React.useMemo(() => new Set(dayRows.map(row => row.cls.id)), [dayRows]);
  const conflicts = useMyRingConflicts(showId, ownEntryIds);

  const isStale =
    !isOnline || (source !== 'confirmed' && source !== 'confirmed-move-up-link-unavailable');
  const updatedLabel = updatedAt ? formatTime(new Date(updatedAt), timeZone) : '';

  return (
    <section
      aria-labelledby={`your-dogs-today-${showId}`}
      data-testid="your-dogs-today"
      className="mb-4 rounded-xl border bg-card p-4 shadow-sm"
    >
      <h4 id={`your-dogs-today-${showId}`} className="text-base font-semibold">
        Your dogs today
      </h4>
      <p className="text-sm text-muted-foreground">
        In the order they run. Times are estimates and can change.
      </p>

      {isStale && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          Showing saved information. Check-in and running order may be out of date.
        </p>
      )}

      <div role="group" aria-label="Show which dog" className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="touch"
          variant={selectedDogId === null ? 'default' : 'outline'}
          aria-pressed={selectedDogId === null}
          onClick={() => setSelectedDogId(null)}
        >
          All ({total})
        </Button>
        {options.map(option => (
          <Button
            key={option.dogId}
            type="button"
            size="touch"
            variant={selectedDogId === option.dogId ? 'default' : 'outline'}
            aria-pressed={selectedDogId === option.dogId}
            onClick={() => setSelectedDogId(option.dogId)}
          >
            {option.dogName} ({option.count})
          </Button>
        ))}
      </div>

      <ul className="mt-3 space-y-2">
        {rows.map(row => {
          const { cls, dog } = row;
          const conflict = conflicts.get(cls.id);
          const queueLine = deriveAtShowQueueLine(toQueueDetail(row), places.get(cls.id));
          const classHref = cls.classId ? `/at-show/${showId}/class/${cls.classId}` : null;
          return (
            <li
              key={cls.id}
              data-testid={`your-dogs-today-${cls.id}`}
              className="flex min-h-12 items-center gap-3 rounded-lg border bg-background px-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {dog.dogName}
                  {dog.armband && (
                    <span className="ml-2 text-xs font-medium text-muted-foreground">
                      #{dog.armband}
                    </span>
                  )}
                </p>
                <p className="truncate text-sm text-muted-foreground">{cls.name}</p>
                {row.timing && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden />
                    {row.timing.isRevised ? 'Expected' : 'Scheduled'} about {row.timing.label}
                  </p>
                )}
                <StatusBadge
                  family="entry"
                  status={cls.checkInStatus ?? 'no-status'}
                  label={cls.isScored ? 'Done' : statusLabel(cls.checkInStatus)}
                  className="mt-1 text-xs"
                />
                {queueLine && queueLine.kind !== 'pending' && (
                  <p className="mt-1 text-sm font-medium" data-testid="your-dogs-today-place">
                    {formatRunQueueState(queueLine)}
                    {queueLine.kind === 'waiting' && updatedLabel && (
                      <span className="font-normal text-muted-foreground">
                        {' '}
                        · updated {updatedLabel}
                      </span>
                    )}
                  </p>
                )}
                {queueLine?.kind === 'pending' && (
                  <p className="mt-1 text-sm text-muted-foreground">Running order not posted yet</p>
                )}
                {conflict && (
                  <p className="mt-1 flex items-start gap-1 text-sm font-medium text-warning">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    Two of your dogs are due at the same time: {conflict}. Tell the ring steward
                    which one goes first.
                  </p>
                )}
              </div>
              {row.kind === 'check-in-available' ? (
                <Button
                  type="button"
                  size="touch"
                  className="shrink-0 gap-1.5"
                  aria-label={`Check in ${dog.dogName} for ${cls.name}`}
                  onClick={() => onCheckInClass(dog, cls)}
                >
                  <ClipboardCheck className="h-4 w-4" aria-hidden />
                  Check in
                </Button>
              ) : classHref ? (
                <Button asChild variant="ghost" size="touch" className="shrink-0">
                  <Link to={classHref} aria-label={`View class ${cls.name} for ${dog.dogName}`}>
                    View class
                  </Link>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
