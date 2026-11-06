import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { useTrialRowActions } from '@/components/shows/tabs/useTrialRowActions';

import { cn } from '@/lib/utils';
import {
  FOCUSED_CLASS_PANEL_CLASS,
  FOCUSED_CLASS_PIN_QUERY,
  type FocusedClassPinMode,
} from '@/components/shows/ShowDetails/showStickyLayout';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useElementWidth } from '@/hooks/useElementWidth';
import { COCKPIT_SPLIT_COLUMNS, isCockpitSplit } from './cockpitSplit';

import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';
import { buildSecretaryCockpitModel } from './secretaryCockpitModel';
import { useSecretaryCockpitUrlState } from './useSecretaryCockpitUrlState';
import { cockpitDaysKey } from './cockpitDayFilter';
import { CockpitFilterMenu } from './CockpitFilterMenu';
import { CockpitAttentionStrip } from './CockpitAttentionStrip';
import { SecretaryCockpitFocusedClass } from './SecretaryCockpitFocusedClass';
import { useFocusedClassSetupActions } from './FocusedClassSetupActions';
import { useClassJudgeAssignment } from '@/components/classes/useClassJudgeAssignment';
import { FocusedClassJudge } from './FocusedClassJudge';
import { judgeLockReason } from './focusedClassJudgeModel';
import { CockpitResultsHandoff } from './CockpitResultsHandoff';
import { isEveryClassComplete } from './resultsHandoff';
import { SecretaryCockpitSchedule } from './SecretaryCockpitSchedule';
import { getCockpitAnchorElementId, selectClassesAnchor } from './cockpitRoutes';
import { useScheduleClassSelection } from './useScheduleClassSelection';
import { ScheduleBulkBar } from './ScheduleBulkBar';
import { carryHonouredAnchor, isAnchorHonoured, markAnchorHonoured } from './cockpitAnchorHonoured';
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
  const { state: urlState, updateState } = useSecretaryCockpitUrlState();
  // A Select classes link's trial or class (MYK9-1324) opens and scrolls like the cockpit's own.
  const [searchParams] = useSearchParams();
  const legacyAnchor = urlState.anchor ? undefined : selectClassesAnchor(searchParams);
  const state = legacyAnchor ? { ...urlState, anchor: legacyAnchor } : urlState;
  // The class panel's judge picker (MYK9-1323). Held here so a split/stack remount of the panel
  // cannot drop an assignment mid-write. The write puts the judge on the local class row
  // (MYK9-1327), which the snapshot already reads, so the panel and the schedule row both show it.
  const judges = useClassJudgeAssignment(snapshot.showId, canManageShow, 'when-stale');
  // Edit Trial and Trial details on each trial heading (MYK9-956); Delete is in the edit panel.
  const { trialRowMenu, trialDialogs } = useTrialRowActions(snapshot.showId, canManageShow);
  // Held here, not in the panel, so a split/stack switch cannot close an open editor.
  const { renderClassActions, classDialogs } = useFocusedClassSetupActions(snapshot.showId);
  // Add classes and High in Trial live in the trial's menu (MYK9-1727), so the heading holds
  // only the menu and it stays in the card's top-right corner on a phone.
  const renderTrialActions = (trialId: string, label: string) =>
    trialRowMenu(trialId, label, true, snapshot.registryId === 'AKC');
  const location = useLocation();
  const navigationType = useNavigationType();
  // A remount on a history entry that already scrolled to this anchor starts spent (MYK9-1218).
  const pendingAnchor = useRef(
    state.anchor && !isAnchorHonoured(location.key, state.anchor) ? state.anchor : undefined
  );
  const locationKeyRef = useRef(location.key);
  useEffect(() => {
    const previousKey = locationKeyRef.current;
    locationKeyRef.current = location.key;
    // The cockpit's own `replace` writes mint a new key for the same page.
    if (previousKey !== location.key && navigationType === 'REPLACE') {
      carryHonouredAnchor(previousKey, location.key);
    }
  }, [location.key, navigationType]);
  // The split follows the width the cockpit is given (full page, or beside the Shows list), not
  // the window: see cockpitSplit.ts.
  const { ref: gridRef, width: gridWidth } = useElementWidth<HTMLDivElement>();
  // Unmeasured on the first commit, so a split cockpit renders stacked once and moves the focused
  // panel to its column in the layout effect, before paint. The panel remounts then; the editor
  // it would lose is held here (useFocusedClassSetupActions), and nothing is visible in between.
  const isSplit = isCockpitSplit(gridWidth);
  const canPin = useMediaQuery(FOCUSED_CLASS_PIN_QUERY);
  const pinMode: FocusedClassPinMode = !canPin ? 'none' : isSplit ? 'panel' : 'page';
  const model = buildSecretaryCockpitModel(snapshot, state);
  const selection = useScheduleClassSelection(snapshot.showId, model);
  const selecting = canManageShow && selection.active;
  const focusedId = model.focusedClass?.id;
  const sourceClass = snapshot.classes.find(classItem => classItem.id === focusedId) ?? null;
  const trial = sourceClass
    ? (snapshot.trials.find(item => item.id === sourceClass.trialId) ?? null)
    : null;
  const focusedAttention = model.attention.all.filter(item => item.classId === focusedId);
  const focusedClassIsVisible = model.trialGroups.some(group =>
    group.classes.some(classItem => classItem.id === focusedId)
  );
  // The split's panel scrolls itself and is not remounted per class, so a newly focused class
  // would open at the previous class's scroll position, its controls under the pinned header.
  const splitPanelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (splitPanelRef.current) splitPanelRef.current.scrollTop = 0;
  }, [focusedId]);
  const focusedPanel = model.focusedClass ? (
    <SecretaryCockpitFocusedClass
      showId={snapshot.showId}
      focused={model.focusedClass}
      sourceClass={sourceClass}
      trial={trial}
      attention={focusedAttention}
      timeZone={snapshot.timeZone}
      pinMode={pinMode}
      canManageShow={canManageShow}
      onCommand={onCommand}
      {...(runOrder !== undefined && { runOrder })}
      {...(canManageShow &&
        sourceClass && {
          judgeControl: (
            <FocusedClassJudge
              showId={snapshot.showId}
              classId={sourceClass.id}
              classLabel={model.focusedClass.name}
              judgeName={sourceClass.judgeName ?? null}
              assignedJudgeId={sourceClass.judgeId ?? null}
              availableJudges={judges.availableJudges}
              organization={judges.showOrganization}
              judgeListStatus={judges.judgeListStatus}
              lockReason={judgeLockReason(model.focusedClass)}
              onJudgeChange={(_classId, judgeId) => judges.assignJudge(sourceClass, judgeId)}
            />
          ),
        })}
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
    // All days is the URL's default (no `day`), so it is never written back. Ticks naming no day
    // of this show are dropped from the URL so the chip reads what the schedule shows.
    if (
      (state.selectedDays?.length ?? 0) > 0 &&
      cockpitDaysKey(state.selectedDays ?? []) !== cockpitDaysKey(model.day.days)
    ) {
      updates.selectedDays = model.day.days;
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
    model.day.days,
    state.anchor,
    state.focusedClassId,
    state.selectedDays,
    updateState,
  ]);

  // Scrolling back to the anchor is only for returning to this page (a
  // returnTo link or a refresh). Once the secretary clicks, scrolls or types,
  // a row that renders late must not move the page under them.
  useEffect(() => {
    const cancel = () => {
      if (pendingAnchor.current) markAnchorHonoured(locationKeyRef.current, pendingAnchor.current);
      pendingAnchor.current = undefined;
    };
    const options = { capture: true, passive: true } as const;
    const events = ['pointerdown', 'wheel', 'touchmove', 'keydown'] as const;
    events.forEach(name => window.addEventListener(name, cancel, options));
    return () => events.forEach(name => window.removeEventListener(name, cancel, options));
  }, []);

  // Only in the measured layout: the first commit is unmeasured (stacked), and a split cockpit
  // re-lays out right after it, which would move the row. Scrolls once, then is spent: a resize or
  // rotation never moves the page, and a remount on the same history entry (the window crossing
  // `lg`, roles arriving) finds it recorded in cockpitAnchorHonoured and stays put.
  useEffect(() => {
    const anchor = pendingAnchor.current;
    if (!anchor || gridWidth === null) return;
    const target = document.getElementById(getCockpitAnchorElementId(anchor));
    if (!target) return;
    markAnchorHonoured(locationKeyRef.current, anchor);
    pendingAnchor.current = undefined;
    target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [model.trialGroups, gridWidth]);

  const clearFilters = () =>
    updateState({ selectedDays: [], statuses: [], focusedClassId: undefined, anchor: undefined });

  return (
    <div className="space-y-5" data-testid="secretary-cockpit">
      {/* Needs attention first (MYK9-1727); the Filter sits under the schedule heading it narrows. */}
      {model.attention.items.length > 0 && (
        <CockpitAttentionStrip
          items={model.attention.items}
          all={model.attention.all}
          overflowCount={model.attention.overflowCount}
          classNameById={new Map(model.daySchedule.map(cls => [cls.id, cls.name]))}
          onCommand={onCommand}
        />
      )}

      {isEveryClassComplete(snapshot.classes) && <CockpitResultsHandoff showId={snapshot.showId} />}

      <div
        ref={gridRef}
        // Stacked: one column that may shrink below its content's one-line width. An implicit
        // `auto` track took the Class work links' min-content and widened the page on a phone
        // (MYK9-1322); split already uses minmax(0, …) (cockpitSplit.ts).
        className={cn(
          'grid items-start',
          isSplit ? 'grid-rows-[auto_auto] gap-5' : 'grid-cols-[minmax(0,1fr)] gap-4'
        )}
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
          filtered={(state.statuses?.length ?? 0) > 0}
          filterBar={
            <CockpitFilterMenu
              snapshot={snapshot}
              model={model}
              statuses={state.statuses ?? []}
              onDaysChange={selectedDays =>
                updateState({ selectedDays, focusedClassId: undefined, anchor: undefined })
              }
              onStatusesChange={statuses => updateState({ statuses })}
              onClearAll={clearFilters}
            />
          }
          onShowAll={clearFilters}
          onFocusClass={focusedClassId => updateState({ focusedClassId, anchor: focusedClassId })}
          // Selecting, a row click ticks rather than focuses, so the focused class's panel would
          // sit open in the middle of the list with no way to move or close it.
          inlineFocusedContent={
            !isSplit && focusedClassIsVisible && !selecting ? focusedPanel : undefined
          }
          select={canManageShow ? selection : undefined}
        />
        {/* Kept while selecting: split, the panel has its own column beside the schedule rather
            than sitting inside the tick list. It only ever shows a class the schedule shows
            (MYK9-1727): a class the filter hides waits, still in the URL, until the filter clears. */}
        {isSplit && model.focusedClass && focusedClassIsVisible && (
          <div
            ref={splitPanelRef}
            className={cn(
              'col-start-2 row-start-2',
              pinMode === 'panel' && FOCUSED_CLASS_PANEL_CLASS
            )}
            data-testid="cockpit-split-focus"
          >
            {focusedPanel}
          </div>
        )}
        {isSplit && !(model.focusedClass && focusedClassIsVisible) && (
          <p
            className="col-start-2 row-start-2 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground"
            data-testid="cockpit-split-empty"
          >
            Pick a class from the schedule to see its checklist.
          </p>
        )}
      </div>
      {/* Mounted for managers even with nothing ticked, so a toast's "Retry failed" still reads
          fresh classes after Done; the bar itself renders nothing without a selection. */}
      {canManageShow && (
        <ScheduleBulkBar
          showId={snapshot.showId}
          model={model}
          classes={snapshot.classes}
          selection={selection}
          availableJudges={judges.availableJudges}
          judgeListStatus={judges.judgeListStatus}
          judgeNamesFor={judges.judgeNamesFor}
        />
      )}
      {trialDialogs}
      {canManageShow && classDialogs}
    </div>
  );
}
