import { Fragment, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';

import { getClassReviewHref } from '@/features/entry-operations/entryAttentionRoutes';
import { cn } from '@/lib/utils';

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
 * One class on the schedule, the same two lines in the narrow rail and the full-width list
 * (MYK9-1782). Line 1: time and class. Line 2: the judge (per class, so never on the trial band), then one
 * status-and-next-step phrase; the judge sits on line 2 so neither is squeezed in the 300px rail. A red dot marks a class on Needs attention; the
 * full seven-step bar lives on the class page.
 */
export function CockpitScheduleRow({
  classItem,
  showId,
  pendingCount = 0,
  focused,
  select,
  onFocusClass,
}: {
  classItem: ScheduledClassModel;
  showId: string;
  /** Entries still to approve; shown as a link to the class's review list on Entries. */
  pendingCount?: number;
  focused: boolean;
  select: TrialGroupSelect | undefined;
  onFocusClass: (classId: string) => void;
}) {
  const ticked = select?.isSelected(classItem.id) ?? false;
  const time = classItem.startedLabel ?? (classItem.expectedStart ? classItem.timeLabel : null);
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
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold">
            {time ?? <span className="font-normal text-muted-foreground">No time</span>}
          </span>
          {/* No onClick: the click (keyboard too) bubbles to the card's. */}
          <button
            type="button"
            data-selects-row
            aria-pressed={select ? ticked : focused}
            className="min-w-0 truncate text-left font-semibold hover:underline hover:underline-offset-4"
          >
            {classItem.name}
          </button>
        </div>
        <div className="mt-0.5 flex items-baseline gap-1.5 text-sm text-muted-foreground">
          {classItem.attentionCount > 0 && (
            <span
              role="img"
              aria-label="Needs attention"
              data-testid="class-attention-dot"
              className="h-2 w-2 shrink-0 rounded-full bg-destructive"
            />
          )}
          <span className="min-w-0">
            <span data-testid="class-judge">{classItem.judgeName || 'Judge not set'}</span>
            {' · '}
            <span data-testid="class-status-line">
              {classItem.statusLine.parts.map((part, index) => (
                <Fragment key={`${index}:${part}`}>
                  {index > 0 && ' · '}
                  {part}
                  {index === 0 && pendingCount > 0 && (
                    <>
                      {' · '}
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
                    </>
                  )}
                </Fragment>
              ))}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
