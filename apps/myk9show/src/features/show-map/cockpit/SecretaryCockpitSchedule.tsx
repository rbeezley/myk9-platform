import { Fragment, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

import { CockpitActionLink } from './CockpitActionLink';
import { ClassStatusControl, ExpectedStartControl } from './ClassOperationalControls';
import { getCockpitAnchorElementId } from './cockpitRoutes';
import type {
  CockpitFilter,
  SecretaryCockpitClass,
  SecretaryCockpitModel,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';

const FILTERS: readonly { value: CockpitFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'needs-attention', label: 'Needs attention' },
  { value: 'needs-closeout', label: 'Needs closeout' },
];

export function SecretaryCockpitSchedule({
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
}: {
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
}) {
  const classById = new Map(sourceClasses.map(classItem => [classItem.id, classItem]));
  const trialById = new Map(sourceTrials.map(trial => [trial.id, trial]));

  return (
    <>
      <section
        className="space-y-3 xl:col-start-1 xl:row-start-1"
        aria-labelledby="cockpit-schedule-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="cockpit-schedule-title" className="text-2xl font-semibold tracking-tight">
              Today&apos;s schedule
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
        <div className="flex flex-wrap gap-2" aria-label="Schedule filters">
          {FILTERS.map(option => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={filter === option.value ? 'default' : 'secondary'}
              aria-pressed={filter === option.value}
              onClick={() => onFilterChange(option.value)}
              className="min-h-11 rounded-full"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="space-y-3 xl:col-start-1 xl:row-start-2" aria-label="Trial schedule">
        {model.trialGroups.length === 0 && (
          <div className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            No Classes are scheduled for this day yet.
          </div>
        )}
        {model.trialGroups.map(group => (
          <Collapsible key={group.trialId} defaultOpen>
            <div className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
              <CollapsibleTrigger
                id={getCockpitAnchorElementId(group.trialId)}
                className="gap-3 border-b px-4 py-3 text-left hover:no-underline"
              >
                <div className="min-w-0">
                  <div className="font-semibold">{group.label}</div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {group.summary.classCount} Classes · {group.summary.inProgressCount} in progress
                    {group.summary.attentionCount > 0
                      ? ` · ${group.summary.attentionCount} attention ${group.summary.attentionCount === 1 ? 'item' : 'items'}`
                      : ''}
                    {group.summary.containsFocusedClass ? ' · Focused' : ''}
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CollapsibleTrigger>
              <CollapsibleContent className="[&>div]:p-0">
                <div className="divide-y">
                  {group.classes.map((classItem, classIndex) => {
                    const source = classById.get(classItem.id);
                    const trial = trialById.get(classItem.trialId);
                    const focused = model.focusedClass?.id === classItem.id;
                    return (
                      <Fragment key={classItem.id}>
                        {group.nowMarkerIndex === classIndex && (
                          <div
                            data-cockpit-now-marker
                            className="flex items-center gap-2 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary"
                          >
                            <span className="h-px flex-1 bg-primary/30" />
                            Now
                            <span className="h-px flex-1 bg-primary/30" />
                          </div>
                        )}
                        <div
                          id={getCockpitAnchorElementId(classItem.id)}
                          onClick={() => onFocusClass(classItem.id)}
                          className={cn(
                            'grid cursor-pointer gap-3 px-4 py-4 transition-colors hover:bg-muted/40 sm:grid-cols-[92px_minmax(0,1fr)_auto] sm:items-center',
                            focused && 'bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]'
                          )}
                        >
                          <div onClick={event => event.stopPropagation()}>
                            {source && trial ? (
                              <ExpectedStartControl
                                classId={classItem.id}
                                scheduledStart={source.scheduledStart ?? null}
                                revisedExpectedStart={source.revisedExpectedStart ?? null}
                                trialDate={trial.date}
                                timeZone={timeZone}
                                canManageShow={canManageShow}
                              />
                            ) : (
                              <span className="text-sm font-semibold">{classItem.timeLabel}</span>
                            )}
                          </div>
                          <div className="min-w-0 space-y-1.5">
                            <button
                              type="button"
                              aria-pressed={focused}
                              onClick={() => onFocusClass(classItem.id)}
                              className="min-h-11 text-left font-semibold hover:underline hover:underline-offset-4"
                            >
                              {classItem.name}
                            </button>
                            <div className="truncate text-sm text-muted-foreground">
                              {[
                                classItem.operationalArea.value?.label,
                                classItem.judgeName ? `Judge ${classItem.judgeName}` : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'Class operations'}
                            </div>
                            <div
                              className="flex flex-wrap items-center gap-2"
                              onClick={event => event.stopPropagation()}
                            >
                              <ClassStatusControl
                                classId={classItem.id}
                                lifecycle={classItem.lifecycle.value}
                                unenteredScoreCount={
                                  classItem.progress.value === null
                                    ? 0
                                    : Math.max(
                                        0,
                                        classItem.progress.value.total -
                                          classItem.progress.value.completed
                                      )
                                }
                                canManageShow={canManageShow}
                              />
                              {classItem.progress.value && (
                                <span className="text-xs text-muted-foreground">
                                  {classItem.progress.value.completed} of{' '}
                                  {classItem.progress.value.total} scored
                                </span>
                              )}
                              {classItem.attentionCount > 0 && (
                                <span className="text-xs font-medium text-destructive">
                                  {classItem.attentionCount} needs attention
                                </span>
                              )}
                            </div>
                          </div>
                          {classItem.primaryAction && (
                            <div onClick={event => event.stopPropagation()}>
                              <CockpitActionLink
                                destination={classItem.primaryAction.destination}
                                onCommand={onCommand}
                                className="w-full sm:w-auto"
                              >
                                {classItem.primaryAction.label}
                              </CockpitActionLink>
                            </div>
                          )}
                        </div>
                        {focused && inlineFocusedContent && (
                          <div
                            className="border-t bg-muted/20 p-3 xl:hidden"
                            data-testid="cockpit-inline-focus"
                          >
                            {inlineFocusedContent}
                          </div>
                        )}
                      </Fragment>
                    );
                  })}
                  {group.nowMarkerIndex === group.classes.length && group.classes.length > 0 && (
                    <div
                      data-cockpit-now-marker
                      className="flex items-center gap-2 bg-primary/5 px-4 py-1.5 text-xs font-semibold text-primary"
                    >
                      <span className="h-px flex-1 bg-primary/30" />
                      Now
                      <span className="h-px flex-1 bg-primary/30" />
                    </div>
                  )}
                  {group.classes.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No Classes match this filter.
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ))}
      </section>
    </>
  );
}
