/**
 * One dog-in-one-class row of "Your dogs today" (MYK9-1046).
 */
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, Info } from 'lucide-react';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { Button } from '@/components/ui/button';
import { ResultsPublicPrompt } from '@/components/preferences/ResultsPublicPrompt';
import { ResultBadge } from '@/components/common/ResultBadge';
import { getStatusDescriptor, StatusBadge } from '@/components/status';
import { checkInStateLabel } from '@myk9/ui';
import { formatRunQueueState, runQueueStateNote } from '@myk9/ringside/run-queue';
import {
  deriveAtShowNextAction,
  deriveAtShowQueueLine,
  type AtShowEntryDetail,
} from './myAtShowEntryDetails.helpers';
import type { QueuePlace } from '@/hooks/queries/useMyEntryQueuePlaces';
import { formatPlaceUpdatedAt, formatRingConflictNotice } from './myEntriesTodayCopy';

// The shared check-in state word (MYK9-2093), the one My Shows and Ringside show; a state
// without one (completed) falls back to the staff-grade label. The dialog's first-person
// choices ("I am here") are buttons, not state names, and are not used here.
function getExhibitorStatusLabel(detail: AtShowEntryDetail): string {
  return (
    checkInStateLabel(detail.checkInStatus) ??
    getStatusDescriptor('entry', detail.checkInStatus).label
  );
}

export function MyEntryRow({
  showId,
  showResultsPrompt = false,
  detail,
  place,
  placeUpdatedAt,
  conflictLabel,
  onOpenClass,
  onCheckIn,
  checkInPending,
}: {
  showId: string;
  /** This row is the list's one place to ask the results-public question (MYK9-1944). */
  showResultsPrompt?: boolean | undefined;
  detail: AtShowEntryDetail;
  /** The server-counted place in line, when known (`useMyEntryQueuePlaces`). */
  place: QueuePlace | undefined;
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
  const paperNote = queueLine?.kind === 'pending' ? null : runQueueStateNote(queueLine);

  return (
    <li
      className="flex min-h-12 items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
      data-testid={`at-show-my-entry-${detail.entryId}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{detail.dogName}</span>
          {detail.armband && (
            <ArmbandBadge
              armband={detail.armband}
              srLabel
              className="h-6 min-w-6 shrink-0 rounded-md text-xs"
            />
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
        {detail.isCancelled && !detail.isScored ? (
          // MYK9-1847: the class badge the class list uses, in place of a check-in state that can
          // no longer change.
          <StatusBadge family="class" status="cancelled" className="mt-1 text-xs" />
        ) : (
          <StatusBadge
            family="entry"
            status={detail.checkInStatus}
            label={getExhibitorStatusLabel(detail)}
            className="mt-1 text-xs"
          />
        )}
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
            {paperNote && (
              <div className="text-xs font-normal text-muted-foreground">{paperNote}</div>
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
          <div
            className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm"
            role="group"
            aria-label="Result"
          >
            {detail.resultLine ? (
              <span className="font-medium tabular-nums" data-testid="own-result-line">
                {detail.resultLine}
              </span>
            ) : (
              <ResultBadge resultStatus={detail.resultStatus} />
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
        {showResultsPrompt && detail.releasedPlacement != null && detail.className && (
          <ResultsPublicPrompt
            showId={showId}
            dogName={detail.dogName}
            className={detail.className}
            placement={detail.releasedPlacement}
            handlerId={detail.handlerId}
            ownerId={detail.dogOwnerId}
            coOwnerId={detail.dogCoOwnerId}
            isReleased
          />
        )}
        {detail.isResultWithheld && (
          <div
            className="mt-1 text-sm text-muted-foreground"
            data-testid="at-show-my-entry-withheld"
          >
            Result not released yet
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
