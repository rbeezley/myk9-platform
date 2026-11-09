import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ListResultLine } from '@/components/list-toolkit';
import { getAddClassesHref } from '@/pages/secretary/ShowCreationWizard/addClassesHref';
import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';

import { CockpitTrialGroup } from './CockpitTrialGroup';
import { ScheduleSelectHeader } from './ScheduleSelectHeader';
import type { ScheduleClassSelection } from './useScheduleClassSelection';
import { cockpitDaysKey } from './cockpitDayFilter';
import type {
  SecretaryCockpitClass,
  SecretaryCockpitModel,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';

export function SecretaryCockpitSchedule({
  showId,
  model,
  sourceClasses,
  sourceTrials,
  filtered,
  filterBar,
  onShowAll,
  onFocusClass,
  inlineFocusedContent,
  split = false,
  entryBreakdownByClassId,
  renderTrialActions,
  select,
}: {
  showId: string;
  model: SecretaryCockpitModel;
  sourceClasses: readonly SecretaryCockpitClass[];
  sourceTrials: readonly SecretaryCockpitTrial[];
  /** A status is ticked, so an empty schedule means "nothing matches" (MYK9-1727). */
  filtered: boolean;
  /** The Filter button and its chips (MYK9-1727): under the heading of the list it narrows. */
  filterBar?: ReactNode;
  /** Clears every filter; offered beside "Showing N of M classes." */
  onShowAll?: (() => void) | undefined;
  onFocusClass: (classId: string) => void;
  inlineFocusedContent?: ReactNode;
  /** The cockpit is split: the schedule holds the first column, the focused class the second. */
  split?: boolean;
  /** Entered/pending per class (MYK9-943); absent until entries are read. */
  entryBreakdownByClassId?: ReadonlyMap<string, ClassEntryBreakdown> | undefined;
  renderTrialActions?: ((trialId: string, label: string) => ReactNode) | undefined;
  /** Select classes (MYK9-1324), for managers; rows tick instead of focusing while it is on. */
  select?: ScheduleClassSelection | undefined;
}) {
  const selecting = select?.active ? select : undefined;
  const dayKey = cockpitDaysKey(model.day.allDays ? [] : model.day.days);
  const classById = new Map(sourceClasses.map(classItem => [classItem.id, classItem]));
  const scopeDays = new Set(model.day.allDays ? model.day.available : model.day.days);
  const trialIdsForSelectedDay = new Set(
    sourceTrials.filter(trial => scopeDays.has(trial.date)).map(trial => trial.id)
  );
  const narrowed = filtered || !model.day.allDays;
  const shownCount = model.trialGroups.reduce((total, group) => total + group.classes.length, 0);
  const hasAnyClassForSelectedDay = sourceClasses.some(classItem =>
    trialIdsForSelectedDay.has(classItem.trialId)
  );

  return (
    <>
      <section
        // Split, the heading and its Filter row span both columns, so the chips fit beside the button.
        className={cn('space-y-3', split && 'col-span-2 col-start-1 row-start-1')}
        aria-labelledby="cockpit-schedule-title"
      >
        {selecting ? (
          <ScheduleSelectHeader
            selection={selecting}
            switchedFromLabel={
              model.trialGroups.find(group => group.trialId === selecting.selection.switchedFrom)
                ?.label ?? null
            }
          />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="cockpit-schedule-title" className="text-2xl font-semibold tracking-tight">
                {model.day.isToday ? "Today's schedule" : 'Show schedule'}
              </h2>
              {narrowed && onShowAll ? (
                <ListResultLine
                  shown={shownCount}
                  total={sourceClasses.length}
                  noun={['class', 'classes']}
                  filtered
                  onShowAll={onShowAll}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pick a class to see its checklist. Filters apply to this schedule only.
                </p>
              )}
            </div>
            {model.trialGroups.some(group => group.nowMarkerIndex !== null) && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-11"
                onClick={() =>
                  document
                    .querySelector('[data-cockpit-now-marker]')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
              >
                Jump to now
              </Button>
            )}
          </div>
        )}
        {filterBar}
      </section>

      <section
        className={cn('space-y-3', split && 'col-start-1 row-start-2')}
        aria-label="Trial schedule"
      >
        {model.trialGroups.length === 0 && (
          <div className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            {hasAnyClassForSelectedDay && filtered
              ? 'No classes match this filter.'
              : `No classes are scheduled for ${scopeDays.size > 1 ? 'these days' : 'this day'} yet.`}
            {/* Managers only: the same gate as the trial menu, and the same Add classes flow. */}
            {renderTrialActions && !(hasAnyClassForSelectedDay && filtered) && (
              <div className="mt-3">
                <Button asChild variant="outline" className="min-h-11">
                  <Link to={getAddClassesHref(showId)}>Add classes</Link>
                </Button>
              </div>
            )}
          </div>
        )}
        {model.trialGroups.map(group => (
          <CockpitTrialGroup
            // Re-key on the day choice so each choice starts from its own default.
            key={`${group.trialId}:${dayKey}`}
            showId={showId}
            group={group}
            model={model}
            classById={classById}
            onFocusClass={onFocusClass}
            inlineFocusedContent={inlineFocusedContent}
            entryBreakdownByClassId={entryBreakdownByClassId}
            trialActions={renderTrialActions?.(group.trialId, group.label)}
            select={
              selecting && {
                isSelected: selecting.isSelected,
                headingState: selecting.trialState(group.trialId),
                onToggleClass: classId => selecting.toggleClass(classId, group.trialId),
                onToggleTrial: () => selecting.toggleTrial(group.trialId),
                onOpenChange: open => selecting.onTrialOpenChange(group.trialId, open),
              }
            }
          />
        ))}
      </section>
    </>
  );
}
