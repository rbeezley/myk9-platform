import type { MouseEvent } from 'react';

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
 * (MYK9-1782). Line 1: time, class, judge (the judge is per class, so it is never on the trial
 * band). Line 2: one status-and-next-step phrase. A red dot marks a class on Needs attention; the
 * full seven-step bar lives on the class page.
 */
export function CockpitScheduleRow({
  classItem,
  focused,
  select,
  onFocusClass,
}: {
  classItem: ScheduledClassModel;
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
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {classItem.judgeName || 'Judge not set'}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
          {classItem.attentionCount > 0 && (
            <span
              role="img"
              aria-label="Needs attention"
              data-testid="class-attention-dot"
              className="h-2 w-2 shrink-0 rounded-full bg-destructive"
            />
          )}
          <span data-testid="class-status-line" className="min-w-0">
            {classItem.statusLine.text}
          </span>
        </div>
      </div>
    </div>
  );
}
