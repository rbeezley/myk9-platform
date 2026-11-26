import { judgeNameOrUnsetLabel } from '@/utils/classJudgeDisplay';
import { Clock3, User } from 'lucide-react';
import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';

import { ClassProgressBar } from '@/components/status';
import { getClassReviewHref } from '@/features/entry-operations/entryAttentionRoutes';
import { formatFeeDollars } from '@/features/_shared/juniorFeeLimit';
import { cn } from '@/lib/utils';

import { ClassStatusBadge } from './ClassOperationalControls';
import { getCockpitAnchorElementId } from './cockpitRoutes';
import { ScheduleRowCheckbox, type TrialGroupSelect } from './ScheduleSelectControls';
import type { ScheduledClassModel } from './secretaryCockpitTypes';

const CONTROL_SELECTOR =
  'a, button, input, select, textarea, label, [role="button"], [role="menuitem"], [role="combobox"], [role="option"], [role="checkbox"], [role="switch"]';

/**
 * The whole class card selects the class, except a control on it. A click from a dialog or menu
 * opened from the card arrives through React's tree but lands outside the card, so it is ignored.
 */
function selectsRow(event: MouseEvent<HTMLElement>): boolean {
  const target = event.target;
  if (!(target instanceof Element) || !event.currentTarget.contains(target)) return false;
  const control = target.closest(CONTROL_SELECTOR);
  return (
    !control || !event.currentTarget.contains(control) || control.hasAttribute('data-selects-row')
  );
}

/**
 * Who is in the ring and who is next, as the Ringside class card says it. The dot is the at-show
 * amber token, never Ring Green, which is reserved for live judging surfaces. The desk adds the
 * dog's call name: the secretary knows dogs by name, the gate by armband.
 */
function CardNextUp({ status }: { status: ScheduledClassModel['cardStatus'] }) {
  const { inRing, nextUp } = status;
  if (!inRing && nextUp.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
      {inRing && (
        <span className="flex min-w-0 items-center gap-1 font-semibold text-foreground">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--at-show-in-ring)]"
          />
          <span className="min-w-0 break-words">
            {inRing.armband && (
              <>
                <span className="sr-only">Armband </span>#{inRing.armband}{' '}
              </>
            )}
            {inRing.dogName}
            <span className="sr-only"> in the ring</span>
          </span>
        </span>
      )}
      {nextUp.length > 0 && (
        <span className="min-w-0 break-words text-muted-foreground">Next {nextUp.join(' · ')}</span>
      )}
    </div>
  );
}

/**
 * One class on the schedule, in the Ringside class card's layout (MYK9-2143): the class name, then
 * the judge and the time, then who is in the ring and who is next, and a footer with the status
 * badge, the scored count and a progress bar. The desk's own lines sit between: the "N pending"
 * link and the next step. Lines wrap rather than truncate, so nothing collapses in the 300px
 * rail; a wider rail (MYK9-2142) puts the judge and the time on one line. A red dot marks a class
 * on Needs attention. This is the one place every class in a trial is compared, so the selected
 * class's header does not repeat it.
 */
export function CockpitScheduleRow({
  classItem,
  showId,
  pendingCount = 0,
  ownFee,
  focused,
  select,
  onFocusClass,
}: {
  classItem: ScheduledClassModel;
  showId: string;
  /** Entries still to approve; shown as a link to the class's review list on Entries. */
  pendingCount?: number;
  /** The class's own entry fee, only when it has one above zero (MYK9-1931); the show's fee otherwise. */
  ownFee?: number | undefined;
  focused: boolean;
  select: TrialGroupSelect | undefined;
  onFocusClass: (classId: string) => void;
}) {
  const ticked = select?.isSelected(classItem.id) ?? false;
  const time = classItem.expectedStart ? classItem.timeLabel : null;
  const attention = classItem.attentionCount;
  const attentionWords = `${attention} ${attention === 1 ? 'needs' : 'need'} attention`;
  const lifecycle = classItem.lifecycle.value;
  const { progress, nextStep } = classItem.cardStatus;
  const started = lifecycle === 'in-progress' || lifecycle === 'complete';
  // A recorded start or finish counts whatever the status now says (a class cancelled after it
  // began), so a time on record is never hidden.
  const ran = started || classItem.startedLabel !== null || classItem.finishedLabel !== null;
  return (
    <div
      id={getCockpitAnchorElementId(classItem.id)}
      onClick={event => {
        if (!selectsRow(event)) return;
        if (select) select.onToggleClass(classItem.id);
        else onFocusClass(classItem.id);
      }}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border bg-card px-3.5 py-2.5 transition-colors hover:border-primary/40',
        (select ? ticked : focused) && 'border-primary bg-primary/5 hover:border-primary'
      )}
    >
      {select && (
        <ScheduleRowCheckbox
          label={classItem.name}
          checked={ticked}
          onToggle={() => select.onToggleClass(classItem.id)}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          {/* No onClick: the click (keyboard too) bubbles to the card's. */}
          <button
            type="button"
            data-selects-row
            aria-pressed={select ? ticked : focused}
            className="min-w-0 break-words rounded-sm text-left font-semibold hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {classItem.name}
          </button>
          {attention > 0 && (
            <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-destructive">
              <span
                role="img"
                aria-label={attentionWords}
                data-testid="class-attention-dot"
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-destructive"
              />
              {attention} {attention === 1 ? 'issue' : 'issues'}
            </span>
          )}
        </div>
        {/* The judge and the time wrap onto lines of their own in the rail, and share one when
            the secretary has dragged it wider. */}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
          <span data-testid="class-judge" className="flex min-w-0 items-start gap-1 break-words">
            <User size={13} className="mt-1 shrink-0" aria-hidden="true" />
            {judgeNameOrUnsetLabel(classItem.judgeName)}
          </span>
          <span
            data-testid="class-time"
            className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium"
          >
            <Clock3 size={13} className="shrink-0" aria-hidden="true" />
            {/* Once a class is under way the planned time is labelled, so it is never read as
                the start. */}
            {ran ? (time ? `Expected ${time}` : 'No expected time') : (time ?? 'No time')}
          </span>
          {ownFee !== undefined && ownFee > 0 && (
            <span
              data-testid="class-own-fee"
              className="shrink-0 whitespace-nowrap text-xs font-medium"
            >
              Fee {formatFeeDollars(ownFee)}
            </span>
          )}
          {/* The card is the one place the times are compared, so it carries all of them: the
              recorded start and finish, and a start nobody recorded. Each part stays whole, so
              a narrow card breaks the line between them, never inside a time. */}
          {ran && (
            <span data-testid="class-ran" className="text-xs">
              <span className="whitespace-nowrap">
                {classItem.startedLabel
                  ? `Started ${classItem.startedLabel}`
                  : 'Start not recorded'}
              </span>
              {classItem.finishedLabel && (
                <>
                  {' '}
                  <span className="whitespace-nowrap">· Finished {classItem.finishedLabel}</span>
                </>
              )}
            </span>
          )}
        </div>
        <div data-testid="class-status-line">
          <CardNextUp status={classItem.cardStatus} />
          {(pendingCount > 0 || nextStep) && (
            <div className="mt-1 text-sm text-muted-foreground">
              {pendingCount > 0 && (
                <Link
                  to={getClassReviewHref({
                    showId,
                    trialId: classItem.trialId,
                    classId: classItem.id,
                  })}
                  aria-label={`${pendingCount} pending in ${classItem.name}`}
                  className="font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {pendingCount} pending
                </Link>
              )}
              {pendingCount > 0 && nextStep && ' · '}
              {nextStep}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 border-t border-border/60 pt-2">
            {/* The badge never wraps or shrinks; the bar is what gives way in a narrow rail. */}
            <span className="shrink-0 whitespace-nowrap">
              <ClassStatusBadge lifecycle={lifecycle} />
            </span>
            {/* An unknown count is left out, never spelled as a zero (MYK9-637). */}
            {progress && (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                <span aria-hidden="true">
                  {progress.scored} / {progress.total}
                </span>
                <span className="sr-only">
                  {progress.scored} of {progress.total} scored
                </span>
              </span>
            )}
            {/* Before the class starts the bar would be an empty track under "0 / 5". Hidden from
                screen readers here: the count beside it already says "3 of 5 scored". */}
            {progress && started && (
              <span aria-hidden="true" className="flex min-w-0 flex-1 overflow-hidden rounded-full">
                <ClassProgressBar
                  label={`${classItem.name} scoring progress`}
                  done={progress.scored}
                  total={progress.total}
                />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
