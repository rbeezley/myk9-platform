import { Fragment, useState, type ReactNode } from 'react';

import { TrialGroupCard } from '@/components/schedule/TrialGroupCard';
import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';

import { CockpitScheduleRow } from './CockpitScheduleRow';
import { getCockpitAnchorElementId } from './cockpitRoutes';
import { ScheduleTrialCheckbox, type TrialGroupSelect } from './ScheduleSelectControls';
import type {
  SecretaryCockpitClass,
  SecretaryCockpitModel,
  TrialScheduleGroupModel,
} from './secretaryCockpitTypes';

const NO_ENTRIES: ClassEntryBreakdown = { entered: 0, pending: 0 };

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * One trial on the show home's schedule (MYK9-955). Collapsible like the old
 * Overview schedule (owner, 2026-10-02): the chevron turns, and the summary
 * reads `N entries · N classes (N in progress)` once entries are read, the
 * total being the rows' entered + pending so the header and rows agree.
 */
export function CockpitTrialGroup({
  group,
  model,
  classById,
  onFocusClass,
  inlineFocusedContent,
  entryBreakdownByClassId,
  trialActions,
  select,
}: {
  group: TrialScheduleGroupModel;
  model: SecretaryCockpitModel;
  classById: ReadonlyMap<string, SecretaryCockpitClass>;
  onFocusClass: (classId: string) => void;
  inlineFocusedContent?: ReactNode;
  entryBreakdownByClassId?: ReadonlyMap<string, ClassEntryBreakdown> | undefined;
  /** The trial's menu (MYK9-956, MYK9-1727), for managers. */
  trialActions?: ReactNode;
  /** Select classes (MYK9-1324): rows tick instead of focusing. */
  select?: TrialGroupSelect | undefined;
}) {
  const [open, setOpenState] = useState(group.defaultOpen);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    select?.onOpenChange(next);
  };
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
  // One line, so the heading never wraps (owner, 2026-10-03). "In progress"
  // counts classes, so it rides inside the class count's parentheses.
  const summary = [
    entryTotal === null ? null : plural(entryTotal, 'entry', 'entries'),
    `${plural(group.summary.classCount, 'class', 'classes')} (${group.summary.inProgressCount} in progress)`,
    group.summary.attentionCount > 0
      ? `${group.summary.attentionCount} ${group.summary.attentionCount === 1 ? 'needs' : 'need'} attention`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TrialGroupCard
      open={open}
      onOpenChange={setOpen}
      label={group.label}
      summary={summary}
      triggerId={getCockpitAnchorElementId(group.trialId)}
      // Only while open: a tick on the heading must never reach rows the collapse hides.
      leading={
        select && open && group.classes.length > 0 ? (
          <ScheduleTrialCheckbox
            label={group.label}
            state={select.headingState}
            onToggle={select.onToggleTrial}
          />
        ) : undefined
      }
      actions={trialActions}
    >
      {group.classes.map((classItem, classIndex) => {
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
            <CockpitScheduleRow
              classItem={classItem}
              focused={focused}
              select={select}
              onFocusClass={onFocusClass}
            />
            {focused && inlineFocusedContent && (
              <div className="rounded-xl border bg-muted/20 p-3" data-testid="cockpit-inline-focus">
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
          No classes match this filter.
        </div>
      )}
    </TrialGroupCard>
  );
}
