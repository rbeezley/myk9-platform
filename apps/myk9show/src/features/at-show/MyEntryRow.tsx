/**
 * One dog-in-one-class row of "Your dogs today" (MYK9-1046).
 */
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResultBadge } from '@/components/common/ResultBadge';
import { getStatusDescriptor, StatusBadge } from '@/components/status';
import { EXHIBITOR_STATUS_LABELS } from '@/types/check-in-types';
import { formatRunQueueState } from '@myk9/ringside/run-queue';
import {
  deriveAtShowNextAction,
  deriveAtShowQueueLine,
  type AtShowEntryDetail,
} from './myAtShowEntryDetails.helpers';
import { formatPlaceUpdatedAt, formatRingConflictNotice } from './myEntriesTodayCopy';

// Plain-language override where one exists (no-status/checked-in/conflict/
// pulled); falls back to the staff-grade label — same fallback order
// CheckInStatusDialog uses — so a status without a plain override (at-gate,
// come-to-gate, in-ring, completed) still reads correctly instead of always
// showing "not checked in".
function getExhibitorStatusLabel(detail: AtShowEntryDetail): string {
  return (
    EXHIBITOR_STATUS_LABELS[detail.checkInStatus] ??
    getStatusDescriptor('entry', detail.checkInStatus).label
  );
}

export function MyEntryRow({
  detail,
  place,
  placeUpdatedAt,
  conflictLabel,
  onOpenClass,
  onCheckIn,
  checkInPending,
}: {
  detail: AtShowEntryDetail;
  /** The server-counted place in line, when known (`useMyEntryQueuePlaces`). */
  place: number | undefined;
  /** When that place was counted (null = unconfirmed, so no number is shown). */
  placeUpdatedAt: number | null;
  /** Ring-conflict label for this entry (`useMyRingConflicts`), when it has one. */
  conflictLabel: string | undefined;
  onOpenClass: (classId: string) => void;
  onCheckIn: (detail: AtShowEntryDetail) => void;
  checkInPending: boolean;
}) {
  const action = deriveAtShowNextAction(detail);
  // A place with no confirmed timestamp is a number with no freshness: show none.
  const queueLine = deriveAtShowQueueLine(detail, placeUpdatedAt === null ? undefined : place);

  return (
    <li
      className="flex min-h-12 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
      data-testid={`at-show-my-entry-${detail.entryId}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{detail.dogName}</span>
          {detail.armband && (
            <span className="shrink-0 rounded-full bg-[color:var(--chip-stone-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--chip-stone-fg)]">
              #{detail.armband}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-sm text-muted-foreground">
          {detail.trialLabel ? `${detail.trialLabel} · ` : ''}
          {detail.className ?? 'Running order not posted yet'}
        </div>
        {detail.expectedStartLabel && (
          <div className="mt-0.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
            {detail.isRevisedStart ? 'Expected' : 'Scheduled'} {detail.expectedStartLabel}
          </div>
        )}
        <StatusBadge
          family="entry"
          status={detail.checkInStatus}
          label={getExhibitorStatusLabel(detail)}
          className="mt-1 text-xs"
        />
        {queueLine && (
          <div className="mt-1 text-sm font-medium" data-testid="at-show-my-entry-place">
            {queueLine.kind === 'pending'
              ? 'Position pending: running order not posted yet'
              : formatRunQueueState(queueLine)}
            {queueLine.kind === 'waiting' && placeUpdatedAt !== null && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {formatPlaceUpdatedAt(placeUpdatedAt, detail.trialTimezone)}
              </span>
            )}
          </div>
        )}
        {conflictLabel && (
          <div
            className="mt-1 flex items-start gap-1 text-sm text-warning"
            data-testid="at-show-my-entry-conflict"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{formatRingConflictNotice(conflictLabel)}</span>
          </div>
        )}
        {detail.resultStatus && (
          <div className="mt-1 flex items-center gap-2 text-sm" role="group" aria-label="Result">
            <ResultBadge resultStatus={detail.resultStatus} />
            {detail.resultTimeSeconds != null && (
              <span className="tabular-nums text-muted-foreground">
                {detail.resultTimeSeconds.toFixed(1)}s
              </span>
            )}
            {detail.resultStatus === 'qualified' &&
              detail.resultFaults != null &&
              detail.resultFaults > 0 && (
                <span className="font-semibold text-warning">
                  {detail.resultFaults === 1 ? '1 fault' : `${detail.resultFaults} faults`}
                </span>
              )}
            {detail.isPreliminary && <span className="text-muted-foreground">preliminary</span>}
          </div>
        )}
        {action.kind === 'self-checkin-disabled' && (
          <div className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Self check-in is off for this class. Please check in at the secretary table.
          </div>
        )}
        {action.kind === 'self-checkin-unknown' && (
          <div className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Check-in isn't available right now. Ask at the show desk.
          </div>
        )}
      </div>

      {action.kind === 'check-in' && (
        <Button
          type="button"
          size="sm"
          className="min-h-11 shrink-0 gap-1.5"
          disabled={checkInPending}
          aria-label={`Check in ${detail.dogName}${detail.className ? `, ${detail.className}` : ''}`}
          onClick={() => onCheckIn(detail)}
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Check in
        </Button>
      )}
      {action.kind === 'wait-running-order' && (
        <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
          <Clock3 className="h-4 w-4" aria-hidden />
          Not posted yet
        </span>
      )}
      {(action.kind === 'view-class' || action.kind === 'scored') && detail.classId && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 shrink-0 gap-1"
          aria-label={`View class${detail.className ? ` ${detail.className}` : ''} for ${detail.dogName}`}
          onClick={() => detail.classId && onOpenClass(detail.classId)}
        >
          View class
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      )}
    </li>
  );
}
