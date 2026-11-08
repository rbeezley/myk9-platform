import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { CheckInStatus } from '@myk9/core';
import { Button } from '@/components/ui/button';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { StatusPickerDialog } from '@/components/common/StatusPickerDialog';
import { StatusBadge } from '@/components/status';
import { formatStartTime } from '@/components/schedule/schedule-timeline.utils';
import type { CheckInDeskDog } from './checkInDeskModel';
import { flaggedPullLabel, isFlaggedPull } from './deskStatus';
import {
  DESK_CHECK_IN_STATUSES,
  DESK_STATUS_LABELS,
  type PeopleRosterClassRow,
} from './peopleRoster';

interface CheckInDeskDogCardProps {
  dog: CheckInDeskDog;
  personName: string;
  busyIds: ReadonlySet<string>;
  /** A failed write for one of this dog's classes, shown on the card where the secretary is. */
  error: string | null;
  onCheckIn: (dog: CheckInDeskDog) => void;
  onSetStatus: (row: PeopleRosterClassRow, status: CheckInStatus) => void;
  /** Put back a pulled class (MYK9-1749); asks first. */
  onUnpull: (row: PeopleRosterClassRow) => void;
  /** The flagged pull being cleared, if any. */
  clearingId: string | null;
  /** Clear a flagged pull back to the check-in it overwrote (MYK9-1753). */
  onClearFlag: (row: PeopleRosterClassRow) => void;
}

/** A dog checked in, at the gate or called to it has arrived; Conflict and Pulled have not. */
const ARRIVED_STATUSES: ReadonlySet<CheckInStatus> = new Set([
  'checked-in',
  'at-gate',
  'come-to-gate',
]);

function classLine(row: PeopleRosterClassRow): string {
  const time = formatStartTime(row.time);
  return [row.className, row.ring, time].filter(Boolean).join(' · ');
}

/**
 * One dog on the Check-in desk (MYK9-1736): the armband badge the entry cards use, one tap to
 * check the dog in to everything waiting today, and a tappable status per class for the
 * exceptions (a ring conflict, an undo).
 * INTENT: checking a dog in is one tap. Per-class changes are there, never in the way.
 */
export function CheckInDeskDogCard({
  dog,
  personName,
  busyIds,
  error,
  onCheckIn,
  onSetStatus,
  onUnpull,
  clearingId,
  onClearFlag,
}: CheckInDeskDogCardProps) {
  const [pickerId, setPickerId] = useState<string | null>(null);
  // The class as it is now, not as it was when the picker opened: if ringside has moved it on,
  // the picker closes rather than offer to write over the run.
  const pickerRow = dog.rows.find(row => row.entryId === pickerId && row.deskStatusEditable);
  // Forget the closed picker too, so it never reopens on its own if the class comes back.
  if (pickerId && !pickerRow) setPickerId(null);
  const busy = dog.rows.some(row => busyIds.has(row.entryId));
  // Judged over the classes the desk handles today: another day's class or a real Pull never
  // keeps the confirmation away. A flagged pull or a Conflict does, since it needs the secretary.
  const deskRows = dog.rows.filter(row => row.deskStatusEditable);
  const allCheckedIn =
    deskRows.length > 0 && deskRows.every(row => ARRIVED_STATUSES.has(row.checkInStatus));

  return (
    <article aria-label={dog.dogName} className="rounded-lg border bg-card p-2.5">
      <div className="flex items-center gap-3">
        <ArmbandBadge armband={dog.armband} className="h-10 min-w-10" />
        <p className="min-w-0 flex-1 truncate font-semibold">{dog.dogName}</p>
        {dog.pendingEntryIds.length > 0 ? (
          <Button
            type="button"
            size="sm"
            className="min-h-11 shrink-0 px-4"
            disabled={busy}
            aria-label={`Check in ${dog.dogName}`}
            onClick={() => onCheckIn(dog)}
          >
            {busy ? 'Checking in...' : 'Check in'}
          </Button>
        ) : allCheckedIn ? (
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-success">
            <Check className="h-4 w-4" aria-hidden="true" />
            Checked in
          </span>
        ) : null}
      </div>
      <ul className="mt-2 space-y-1 sm:pl-[3.25rem]">
        {dog.rows.map(row => {
          const badge = (
            <StatusBadge
              family="entry"
              status={row.statusValue}
              label={row.statusLabel}
              className="shrink-0 text-xs"
            />
          );
          return (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-x-2 border-t pt-1 text-sm first:border-t-0 first:pt-0"
            >
              <span className="min-w-0 flex-1 basis-48 text-muted-foreground">
                {classLine(row)}
              </span>
              {row.deskStatusEditable || row.deskCanUnpull ? (
                <button
                  type="button"
                  disabled={busyIds.has(row.entryId)}
                  aria-label={
                    row.deskCanUnpull
                      ? `Put ${dog.dogName} back in ${row.className}`
                      : `Change status for ${dog.dogName}, ${row.className}: ${row.statusLabel}`
                  }
                  onClick={() => (row.deskCanUnpull ? onUnpull(row) : setPickerId(row.entryId))}
                  className="flex min-h-11 shrink-0 items-center gap-0.5 rounded-md px-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {badge}
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </button>
              ) : (
                badge
              )}
              {isFlaggedPull(row) && (
                <div className="flex basis-full flex-wrap items-center gap-2 pb-1">
                  <span className="min-w-0 flex-1 basis-48 text-xs text-muted-foreground">
                    {flaggedPullLabel(row.sourceClass.checkInPulledBy)} Confirm it to pull the
                    entry, or clear it.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    disabled={busyIds.has(row.entryId) || clearingId !== null}
                    aria-label={`Clear the pull flag for ${dog.dogName}, ${row.className}`}
                    onClick={() => onClearFlag(row)}
                  >
                    {clearingId === row.entryId ? 'Clearing...' : 'Clear'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11"
                    disabled={busyIds.has(row.entryId) || clearingId !== null}
                    aria-label={`Confirm the pull for ${dog.dogName}, ${row.className}`}
                    onClick={() => onSetStatus(row, 'pulled')}
                  >
                    Confirm Pull
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {pickerRow && (
        <StatusPickerDialog
          open
          onOpenChange={open => {
            if (!open) setPickerId(null);
          }}
          entry={{
            entryId: pickerRow.entryId,
            armband: dog.armband ?? '',
            dogName: dog.dogName,
            handlerName: `${personName} · ${pickerRow.className}`,
          }}
          currentStatus={pickerRow.checkInStatus}
          onStatusChange={(_, status) => onSetStatus(pickerRow, status)}
          isStaff
          allowedStatuses={DESK_CHECK_IN_STATUSES}
          labels={DESK_STATUS_LABELS}
        />
      )}
    </article>
  );
}
