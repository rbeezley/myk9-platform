import { Fragment, useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ClassEntryBreakdownLine } from '@/components/schedule/ClassEntryBreakdownLine';
import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';
import { cn } from '@/lib/utils';

import { ClassChecklistStrip } from './ClassChecklistStrip';
import { ClassStatusControl } from './ClassOperationalControls';
import { getCockpitAnchorElementId } from './cockpitRoutes';
import type {
  SecretaryCockpitClass,
  SecretaryCockpitModel,
  TrialScheduleGroupModel,
} from './secretaryCockpitTypes';

const NO_ENTRIES: ClassEntryBreakdown = { entered: 0, pending: 0 };

const CONTROL_SELECTOR =
  'a, button, input, select, textarea, label, [role="button"], [role="menuitem"], [role="combobox"], [role="option"], [role="checkbox"], [role="switch"]';

/**
 * The whole class card selects the class, except a control on it (the
 * "N pending" link). A click from a dialog or menu opened from the card
 * arrives through React's tree but lands outside the card, so it is ignored.
 */
function selectsRow(event: MouseEvent<HTMLElement>): boolean {
  const target = event.target;
  if (!(target instanceof Element) || !event.currentTarget.contains(target)) return false;
  const control = target.closest(CONTROL_SELECTOR);
  return (
    !control || !event.currentTarget.contains(control) || control.hasAttribute('data-selects-row')
  );
}

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
  onFocusClass,
  inlineFocusedContent,
  entryBreakdownByClassId,
  trialActions,
}: {
  group: TrialScheduleGroupModel;
  showId: string;
  model: SecretaryCockpitModel;
  classById: ReadonlyMap<string, SecretaryCockpitClass>;
  onFocusClass: (classId: string) => void;
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
          <div className="flex flex-col gap-2 p-3">
            {group.classes.map((classItem, classIndex) => {
              const focused = model.focusedClass?.id === classItem.id;
              const breakdown = breakdownFor(classItem.id);
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
                    onClick={event => {
                      if (selectsRow(event)) onFocusClass(classItem.id);
                    }}
                    className={cn(
                      'flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-3.5 py-3 transition-colors hover:border-primary/40',
                      focused && 'border-primary bg-primary/5 hover:border-primary'
                    )}
                  >
                    <div className="w-[4.5rem] shrink-0 whitespace-nowrap text-sm font-semibold">
                      {classItem.expectedStart ? (
                        classItem.timeLabel
                      ) : (
                        <span className="font-normal text-muted-foreground">No time</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-[1_1_220px]">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* No onClick: the click (keyboard too) bubbles to the card's. */}
                        <button
                          type="button"
                          data-selects-row
                          aria-pressed={focused}
                          className="text-left font-semibold hover:underline hover:underline-offset-4"
                        >
                          {classItem.name}
                        </button>
                        {/* Read-only here; the status menu is in the selected-class panel. */}
                        <ClassStatusControl
                          classId={classItem.id}
                          lifecycle={classItem.lifecycle.value}
                          canManageShow={false}
                        />
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground [&>div]:mt-0">
                        <span>
                          {[
                            classItem.operationalArea.value?.label,
                            classItem.judgeName || 'Judge not set',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {breakdown && (
                          <>
                            <span aria-hidden="true">·</span>
                            <ClassEntryBreakdownLine
                              breakdown={breakdown}
                              showId={showId}
                              trialId={classItem.trialId}
                              classId={classItem.id}
                              className={classItem.name}
                            />
                          </>
                        )}
                        {classItem.attentionCount > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-destructive">
                              {classItem.attentionCount} needs attention
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {classItem.checklist && (
                      <div className="ml-auto shrink-0">
                        <ClassChecklistStrip summary={classItem.checklist} />
                      </div>
                    )}
                  </div>
                  {focused && inlineFocusedContent && (
                    <div
                      className="rounded-xl border bg-muted/20 p-3"
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
  );
}
