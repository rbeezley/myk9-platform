import { useEffect, useRef } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTrialRowActions } from '@/components/shows/tabs/useTrialRowActions';
import { getAddClassesHref } from '@/pages/secretary/ShowCreationWizard/addClassesHref';

import { Button } from '@/components/ui/button';
import { formatWeekdayMonthDay } from '@/lib/format/dates';
import { cn } from '@/lib/utils';
import { useElementWidth } from '@/hooks/useElementWidth';
import { COCKPIT_SPLIT_COLUMNS, isCockpitSplit } from './cockpitSplit';

import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';
import { ALL_DAYS, buildSecretaryCockpitModel } from './secretaryCockpitModel';
import { useSecretaryCockpitUrlState } from './useSecretaryCockpitUrlState';
import { CockpitAttentionStrip } from './CockpitAttentionStrip';
import { SecretaryCockpitFocusedClass } from './SecretaryCockpitFocusedClass';
import { useFocusedClassSetupActions } from './FocusedClassSetupActions';
import { CockpitResultsHandoff } from './CockpitResultsHandoff';
import { isEveryClassComplete } from './resultsHandoff';
import { SecretaryCockpitSchedule } from './SecretaryCockpitSchedule';
import { getCockpitAnchorElementId } from './cockpitRoutes';
import type {
  SecretaryCockpitRunOrderControls,
  SecretaryCockpitSnapshot,
} from './secretaryCockpitTypes';

export function SecretaryCockpit({
  snapshot,
  canManageShow,
  onCommand,
  runOrder,
  entryBreakdownByClassId,
}: {
  snapshot: SecretaryCockpitSnapshot;
  canManageShow: boolean;
  onCommand: (commandId: string) => void;
  /**
   * Auto-sort controls for the focused class (F29b phase 2a). Optional so a
   * read-only or test render can omit it; the menu simply does not appear.
   */
  runOrder?: SecretaryCockpitRunOrderControls | undefined;
  /** Entered/pending per class for the schedule rows (MYK9-943); absent until read. */
  entryBreakdownByClassId?: ReadonlyMap<string, ClassEntryBreakdown> | undefined;
}) {
  const { state, updateState } = useSecretaryCockpitUrlState();
  // Edit Trial and Trial details on each trial heading (MYK9-956); Delete is in the edit panel.
  const { trialRowMenu, trialDialogs } = useTrialRowActions(snapshot.showId, canManageShow);
  // Held here, not in the panel, so a split/stack switch cannot close an open editor.
  const { renderClassActions, classDialogs } = useFocusedClassSetupActions(snapshot.showId);
  const renderTrialActions = (trialId: string, label: string) => (
    <>
      <Button asChild variant="ghost" size="sm" className="min-h-11 gap-1">
        <Link
          to={getAddClassesHref(snapshot.showId, trialId)}
          aria-label={`Add classes to ${label}`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Classes
        </Link>
      </Button>
      {trialRowMenu(trialId, label, true)}
    </>
  );
  const pendingAnchor = useRef(state.anchor);
  // The split follows the width the cockpit is given (full page, or beside the Shows list), not
  // the window: see cockpitSplit.ts.
  const { ref: gridRef, width: gridWidth } = useElementWidth<HTMLDivElement>();
  const isSplit = isCockpitSplit(gridWidth);
  const model = buildSecretaryCockpitModel(snapshot, state);
  const focusedId = model.focusedClass?.id;
  const sourceClass = snapshot.classes.find(classItem => classItem.id === focusedId) ?? null;
  const trial = sourceClass
    ? (snapshot.trials.find(item => item.id === sourceClass.trialId) ?? null)
    : null;
  const focusedAttention = model.attention.all.filter(item => item.classId === focusedId);
  const focusedClassIsVisible = model.trialGroups.some(group =>
    group.classes.some(classItem => classItem.id === focusedId)
  );
  const focusedPanel = model.focusedClass ? (
    <SecretaryCockpitFocusedClass
      showId={snapshot.showId}
      focused={model.focusedClass}
      sourceClass={sourceClass}
      trial={trial}
      attention={focusedAttention}
      timeZone={snapshot.timeZone}
      sticky={isSplit}
      canManageShow={canManageShow}
      onCommand={onCommand}
      {...(runOrder !== undefined && { runOrder })}
      {...(canManageShow &&
        trial && {
          setupActions: renderClassActions(
            model.focusedClass.id,
            trial.id,
            model.focusedClass.name
          ),
        })}
    />
  ) : null;

  useEffect(() => {
    const updates: Parameters<typeof updateState>[0] = {};
    // All days is the URL's default (no `day`), so it is never written back.
    if (!model.day.allDays && model.day.selected && state.selectedDay !== model.day.selected) {
      updates.selectedDay = model.day.selected;
    }
    if (focusedId && state.focusedClassId !== focusedId) {
      updates.focusedClassId = focusedId;
    }
    // Recorded so a returnTo link comes back to this class. Written after
    // mount, it is never the pending anchor below, so the page does not move.
    if (focusedId && !state.anchor) updates.anchor = focusedId;
    if (Object.keys(updates).length > 0) updateState(updates, { replace: true });
  }, [
    focusedId,
    model.day.allDays,
    model.day.selected,
    state.anchor,
    state.focusedClassId,
    state.selectedDay,
    updateState,
  ]);

  // Scrolling back to the anchor is only for returning to this page (a
  // returnTo link or a refresh). Once the secretary clicks, scrolls or types,
  // a row that renders late must not move the page under them.
  useEffect(() => {
    const cancel = () => {
      pendingAnchor.current = undefined;
    };
    const options = { capture: true, passive: true } as const;
    const events = ['pointerdown', 'wheel', 'touchmove', 'keydown'] as const;
    events.forEach(name => window.addEventListener(name, cancel, options));
    return () => events.forEach(name => window.removeEventListener(name, cancel, options));
  }, []);

  useEffect(() => {
    const anchor = pendingAnchor.current;
    if (!anchor) return;
    const target = document.getElementById(getCockpitAnchorElementId(anchor));
    if (!target) return;
    pendingAnchor.current = undefined;
    target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [model.trialGroups]);

  return (
    <div className="space-y-5" data-testid="secretary-cockpit">
      {model.day.available.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Show day">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Button
            type="button"
            size="sm"
            variant={model.day.allDays ? 'default' : 'outline'}
            aria-pressed={model.day.allDays}
            className="min-h-11"
            onClick={() =>
              updateState({ selectedDay: ALL_DAYS, focusedClassId: undefined, anchor: undefined })
            }
          >
            All days
          </Button>
          {model.day.available.map(day => (
            <Button
              key={day}
              type="button"
              size="sm"
              variant={!model.day.allDays && model.day.selected === day ? 'default' : 'outline'}
              aria-pressed={!model.day.allDays && model.day.selected === day}
              className="min-h-11"
              onClick={() =>
                updateState({ selectedDay: day, focusedClassId: undefined, anchor: undefined })
              }
            >
              {formatWeekdayMonthDay(day)}
            </Button>
          ))}
        </div>
      )}

      {isEveryClassComplete(snapshot.classes) && <CockpitResultsHandoff showId={snapshot.showId} />}

      {model.attention.items.length > 0 && (
        <CockpitAttentionStrip
          items={model.attention.items}
          all={model.attention.all}
          overflowCount={model.attention.overflowCount}
          classNameById={new Map(model.daySchedule.map(cls => [cls.id, cls.name]))}
          onCommand={onCommand}
        />
      )}

      <div
        ref={gridRef}
        className={cn('grid items-start', isSplit ? 'grid-rows-[auto_auto] gap-5' : 'gap-4')}
        style={isSplit ? { gridTemplateColumns: COCKPIT_SPLIT_COLUMNS } : undefined}
        data-cockpit-layout={isSplit ? 'split' : 'stacked'}
      >
        <SecretaryCockpitSchedule
          showId={snapshot.showId}
          split={isSplit}
          entryBreakdownByClassId={entryBreakdownByClassId}
          renderTrialActions={canManageShow ? renderTrialActions : undefined}
          model={model}
          sourceClasses={snapshot.classes}
          sourceTrials={snapshot.trials}
          filter={state.filter}
          onFilterChange={filter => updateState({ filter })}
          onFocusClass={focusedClassId => updateState({ focusedClassId, anchor: focusedClassId })}
          inlineFocusedContent={!isSplit && focusedClassIsVisible ? focusedPanel : undefined}
        />
        {!isSplit && !focusedClassIsVisible && model.focusedClass && (
          <div
            className="space-y-2"
            data-testid="cockpit-inline-focus"
            aria-label="Focused Class outside current schedule filter"
          >
            <p className="text-sm text-muted-foreground">
              Focused Class is outside the current schedule filter.
            </p>
            {focusedPanel}
          </div>
        )}
        {isSplit && model.focusedClass && (
          <div className="col-start-2 row-start-2" data-testid="cockpit-split-focus">
            {focusedPanel}
          </div>
        )}
      </div>
      {trialDialogs}
      {canManageShow && classDialogs}
    </div>
  );
}
