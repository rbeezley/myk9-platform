import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { ListViewTabs } from '@/components/list-toolkit';
import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';

import { CockpitTrialGroup } from './CockpitTrialGroup';
import { buildCockpitScheduleViews } from './secretaryCockpitViews';
import type {
  CockpitFilter,
  SecretaryCockpitClass,
  SecretaryCockpitModel,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';

export function SecretaryCockpitSchedule({
  showId,
  model,
  sourceClasses,
  sourceTrials,
  timeZone,
  filter,
  canManageShow,
  onFilterChange,
  onFocusClass,
  onCommand,
  inlineFocusedContent,
  entryBreakdownByClassId,
  renderTrialActions,
}: {
  showId: string;
  model: SecretaryCockpitModel;
  sourceClasses: readonly SecretaryCockpitClass[];
  sourceTrials: readonly SecretaryCockpitTrial[];
  timeZone: string;
  filter: CockpitFilter;
  canManageShow: boolean;
  onFilterChange: (filter: CockpitFilter) => void;
  onFocusClass: (classId: string) => void;
  onCommand: (commandId: string) => void;
  inlineFocusedContent?: ReactNode;
  /** Entered/pending per class (MYK9-943); absent until entries are read. */
  entryBreakdownByClassId?: ReadonlyMap<string, ClassEntryBreakdown> | undefined;
  renderTrialActions?: ((trialId: string, label: string) => ReactNode) | undefined;
}) {
  const classById = new Map(sourceClasses.map(classItem => [classItem.id, classItem]));
  const trialById = new Map(sourceTrials.map(trial => [trial.id, trial]));
  const trialIdsForSelectedDay = new Set(
    sourceTrials.filter(trial => trial.date === model.day.selected).map(trial => trial.id)
  );
  const hasAnyClassForSelectedDay = sourceClasses.some(classItem =>
    trialIdsForSelectedDay.has(classItem.trialId)
  );

  return (
    <>
      <section
        className="space-y-3 xl:col-start-1 xl:row-start-1"
        aria-labelledby="cockpit-schedule-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="cockpit-schedule-title" className="text-2xl font-semibold tracking-tight">
              {model.day.isToday && !model.day.allDays ? "Today's schedule" : 'Show schedule'}
            </h2>
            <p className="text-sm text-muted-foreground">
              Select a Class to focus it. Filters apply to this schedule only.
            </p>
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
        <ListViewTabs
          views={buildCockpitScheduleViews(model)}
          activeId={filter}
          onSelect={id => onFilterChange(id as CockpitFilter)}
          label="Schedule filters"
        />
      </section>

      <section className="space-y-3 xl:col-start-1 xl:row-start-2" aria-label="Trial schedule">
        {model.trialGroups.length === 0 && (
          <div className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            {hasAnyClassForSelectedDay && filter !== 'all'
              ? 'No Classes match this filter.'
              : 'No Classes are scheduled for this day yet.'}
          </div>
        )}
        {model.trialGroups.map(group => (
          <CockpitTrialGroup
            // Re-key on the day choice so each choice starts from its own default.
            key={`${group.trialId}:${model.day.allDays ? 'all' : model.day.selected}`}
            group={group}
            showId={showId}
            model={model}
            classById={classById}
            trialById={trialById}
            timeZone={timeZone}
            canManageShow={canManageShow}
            onFocusClass={onFocusClass}
            onCommand={onCommand}
            inlineFocusedContent={inlineFocusedContent}
            entryBreakdownByClassId={entryBreakdownByClassId}
            trialActions={renderTrialActions?.(group.trialId, group.label)}
          />
        ))}
      </section>
    </>
  );
}
