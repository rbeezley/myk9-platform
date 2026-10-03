import { Fragment, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ClassEntryBreakdownLine } from '@/components/schedule/ClassEntryBreakdownLine';
import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';
import { cn } from '@/lib/utils';

import { CockpitActionLink } from './CockpitActionLink';
import { ClassStatusControl, ExpectedStartControl } from './ClassOperationalControls';
import { getCockpitAnchorElementId } from './cockpitRoutes';
import type {
  SecretaryCockpitClass,
  SecretaryCockpitModel,
  SecretaryCockpitTrial,
  TrialScheduleGroupModel,
} from './secretaryCockpitTypes';

const NO_ENTRIES: ClassEntryBreakdown = { entered: 0, pending: 0 };

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * One trial on the show home's schedule (MYK9-955). Collapsible like the old
 * Overview schedule (owner, 2026-10-02): the chevron turns, and the pill reads
 * `N classes · N entries` once entries are read, the total being the rows'
 * entered + pending so the header and rows agree.
 */
export function CockpitTrialGroup({
  group,
  showId,
  model,
  classById,
  trialById,
  timeZone,
  canManageShow,
  onFocusClass,
  onCommand,
  inlineFocusedContent,
  entryBreakdownByClassId,
  trialActions,
}: {
  group: TrialScheduleGroupModel;
  showId: string;
  model: SecretaryCockpitModel;
  classById: ReadonlyMap<string, SecretaryCockpitClass>;
  trialById: ReadonlyMap<string, SecretaryCockpitTrial>;
  timeZone: string;
  canManageShow: boolean;
  onFocusClass: (classId: string) => void;
  onCommand: (commandId: string) => void;
  inlineFocusedContent?: ReactNode;
  entryBreakdownByClassId?: ReadonlyMap<string, ClassEntryBreakdown> | undefined;
  /** Add Classes and the trial's Edit / Delete menu (MYK9-956), for managers. */
  trialActions?: ReactNode;
}) {
  const [open, setOpen] = useState(group.defaultOpen);
  const breakdownFor = (classId: string) =>
    entryBreakdownByClassId ? (entryBreakdownByClassId.get(classId) ?? NO_ENTRIES) : undefined;
  const entryTotal = entryBreakdownByClassId
    ? [...classById.values()]
        .filter(cls => cls.trialId === group.trialId)
        .reduce((sum, cls) => {
          const breakdown = breakdownFor(cls.id)!;
          return sum + breakdown.entered + breakdown.pending;
        }, 0)
    : null;
  const pill = [
    plural(group.summary.classCount, 'class', 'classes'),
    entryTotal === null ? null : plural(entryTotal, 'entry', 'entries'),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
        <div className="flex flex-wrap items-center border-b sm:flex-nowrap">
          <CollapsibleTrigger
            id={getCockpitAnchorElementId(group.trialId)}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${group.label}`}
            className="min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1.5 px-4 py-3 text-left hover:no-underline sm:flex-nowrap"
          >
            {/* Wrapped: the shared trigger rotates a direct-child svg 180deg when open. */}
            <span aria-hidden="true" className="shrink-0">
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  !open && '-rotate-90'
                )}
              />
            </span>
            <div className="min-w-0 flex-1 basis-[calc(100%-1.75rem)] sm:basis-0">
              <div className="font-semibold">{group.label}</div>
              <div className="text-xs font-normal text-muted-foreground">
                {group.summary.inProgressCount} in progress
                {group.summary.attentionCount > 0
                  ? ` · ${plural(group.summary.attentionCount, 'attention item', 'attention items')}`
                  : ''}
                {group.summary.containsFocusedClass ? ' · Focused' : ''}
              </div>
            </div>
            <span className="ml-7 shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground sm:ml-0">
              {pill}
            </span>
          </CollapsibleTrigger>
          {trialActions && (
            <div className="flex items-center gap-1 px-2 pb-2 sm:pb-0">{trialActions}</div>
          )}
        </div>
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
                      focused &&
                        // `--primary` is a HEX (#a8472d / #d97757), not HSL channels, so
                        // wrapping the token in hsl() was invalid and the browser
                        // discarded the WHOLE box-shadow: the focused row has
                        // never had its 4px bar or its ring, in either theme.
                        // Only `bg-primary/10` was ever visible.
                        'bg-primary/10 shadow-[inset_4px_0_0_var(--primary)] ring-1 ring-inset ring-primary/55 hover:bg-primary/10'
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
                      {breakdownFor(classItem.id) && (
                        <div onClick={event => event.stopPropagation()}>
                          <ClassEntryBreakdownLine
                            breakdown={breakdownFor(classItem.id)!}
                            showId={showId}
                            trialId={classItem.trialId}
                            classId={classItem.id}
                            className={classItem.name}
                          />
                        </div>
                      )}
                      <div
                        className="flex flex-wrap items-center gap-2"
                        onClick={event => event.stopPropagation()}
                      >
                        <ClassStatusControl
                          classId={classItem.id}
                          lifecycle={classItem.lifecycle.value}
                          // `null`, not 0, when progress is unknown --
                          // ClassStatusControl confirms on unknown, and
                          // passing 0 here would silently disable the
                          // guard exactly when it is needed most.
                          unenteredScoreCount={
                            classItem.progress.value === null
                              ? null
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
                            {classItem.progress.value.completed} of {classItem.progress.value.total}{' '}
                            scored
                          </span>
                        )}
                        {classItem.checklist && (
                          <span className="text-xs text-muted-foreground">
                            {classItem.checklist.done} of {classItem.checklist.total} done
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
                    <div className="border-t bg-muted/20 p-3" data-testid="cockpit-inline-focus">
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
  );
}
