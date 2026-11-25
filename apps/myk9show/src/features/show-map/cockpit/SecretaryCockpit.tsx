import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { useTrialRowActions } from '@/components/shows/tabs/useTrialRowActions';

import { cn } from '@/lib/utils';
import {
  FOCUSED_CLASS_PIN_QUERY,
  type FocusedClassPinMode,
} from '@/components/shows/ShowDetails/showStickyLayout';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useElementWidth } from '@/hooks/useElementWidth';
import { cockpitSplitTemplate, isCockpitSplit } from './cockpitSplit';

import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';
import { buildSecretaryCockpitModel } from './secretaryCockpitModel';
import { useSecretaryCockpitUrlState } from './useSecretaryCockpitUrlState';
import { cockpitDaysKey } from './cockpitDayFilter';
import { CockpitFilterMenu } from './CockpitFilterMenu';
import { CockpitFocusOutlet } from './CockpitSplitFocusColumn';
import { CockpitRailDivider } from './CockpitRailDivider';
import { useCockpitRailWidth } from './useCockpitRailWidth';
import { pruneCockpitFilters, hasActiveCockpitFilters } from './cockpitClassFilters';
import { CarriedClassNotice } from '@/components/shows/ShowDetails/CarriedClassNotice';
import { filtersUpdate, focusedPanelShows } from './cockpitFocusRules';
import { CockpitAttentionStrip } from './CockpitAttentionStrip';
import { SecretaryCockpitFocusedClass } from './SecretaryCockpitFocusedClass';
import { useFocusedClassSetupActions } from './FocusedClassSetupActions';
import { useClassJudgeAssignment } from '@/components/classes/useClassJudgeAssignment';
import { FocusedClassSettings } from './FocusedClassSettings';
import { isJudgeChangeLocked } from './focusedClassJudgeModel';
import { CockpitResultsHandoff } from './CockpitResultsHandoff';
import { isEveryClassComplete } from './resultsHandoff';
import { TrialPacketPanel } from './trialPacket/TrialPacketPanel';
import { SecretaryCockpitSchedule } from './SecretaryCockpitSchedule';
import { getCockpitAnchorElementId, selectClassesAnchor } from './cockpitRoutes';
import { useScheduleClassSelection } from './useScheduleClassSelection';
import { ScheduleBulkBar } from './ScheduleBulkBar';
import { carryHonouredAnchor, isAnchorHonoured, markAnchorHonoured } from './cockpitAnchorHonoured';
import type {
  SecretaryCockpitRunOrderControls,
  SecretaryCockpitSnapshot,
} from './secretaryCockpitTypes';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { EntriesRefresh } from '@/components/entries/management/checkInDesk/entriesRefresh';

export function SecretaryCockpit({
  snapshot,
  canManageShow,
  onCommand,
  runOrder,
  entryBreakdownByClassId,
  onRefreshEntries,
  putBackEntries,
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
  /** Re-reads the page's entries after a Check-in cell write (MYK9-1797). */
  onRefreshEntries?: EntriesRefresh | undefined;
  /** The stored entries by id, so a real Pull can be put back from its row (MYK9-2038). */
  putBackEntries?: ReadonlyMap<string, EntryManagementEntry> | undefined;
}) {
  const { state: urlState, updateState } = useSecretaryCockpitUrlState();
  // A Select classes link's trial or class (MYK9-1324) opens and scrolls like the cockpit's own.
  const [searchParams, setSearchParams] = useSearchParams();
  // The before-trial packet (MYK9-1924): opened from a trial's menu, or by the "Ready for show
  // day" line's `?packet=<trialId>` link. The link is read from the URL on every render, so it
  // opens the panel while the cockpit is mounted and waits out a permission check that has not
  // resolved; closing the panel is what spends it.
  const [menuPacketTrialId, setMenuPacketTrialId] = useState<string | null>(null);
  const packetTrialId = canManageShow ? (menuPacketTrialId ?? searchParams.get('packet')) : null;
  const closePacket = () => {
    setMenuPacketTrialId(null);
    if (!searchParams.has('packet')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('packet');
    setSearchParams(next, { replace: true });
  };
  const legacyAnchor = urlState.anchor ? undefined : selectClassesAnchor(searchParams);
  // Ticks the show does not offer (a stale link, a hidden group) are dropped before they filter.
  const state = pruneCockpitFilters(
    snapshot,
    legacyAnchor ? { ...urlState, anchor: legacyAnchor } : urlState
  );
  // The class panel's judge picker (MYK9-1323). Held here so a split/stack remount of the panel
  // cannot drop an assignment mid-write. The write puts the judge on the local class row
  // (MYK9-1327), which the snapshot already reads, so the panel and the schedule row both show it.
  const judges = useClassJudgeAssignment(snapshot.showId, canManageShow, 'when-stale');
  // Edit Trial and Trial details on each trial heading (MYK9-956); Delete is in the edit panel.
  const { trialRowMenu, trialDialogs } = useTrialRowActions(snapshot.showId, canManageShow);
  // Held here, not in the panel, so a split/stack switch cannot close an open editor.
  const { editClassAction, pendingClassId, classDialogs } = useFocusedClassSetupActions(
    snapshot.showId
  );
  // Add classes and High in Trial live in the trial's menu (MYK9-1727), so the heading holds
  // only the menu and it stays in the card's top-right corner on a phone.
  const renderTrialActions = (trialId: string, label: string) =>
    trialRowMenu(trialId, label, true, snapshot.registryId, setMenuPacketTrialId);
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
  // The rail's width beside a focused class, dragged by the divider (MYK9-2142).
  const rail = useCockpitRailWidth(gridWidth, gridRef);
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
  // MYK9-1727: a class the secretary clicked stays open when her own work moves it out of the
  // filter. Tracked here, not from the URL: the URL also records the automatic default.
  const [clickedClassId, setClickedClassId] = useState<string>();
  const [attentionOpenChoice, setAttentionOpenChoice] = useState<boolean | null>(null);
  const { shows: panelShows, listed: focusedClassIsVisible } = focusedPanelShows(
    model,
    clickedClassId
  );
  // Which trials are open, as each reports it (MYK9-2143). "Listed" only means the class is in
  // the schedule's model: inside a collapsed trial its card is hidden, and the header must then
  // keep saying what the card would have.
  const [trialOpen, setTrialOpen] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const reportTrialOpen = useCallback((trialId: string, open: boolean) => {
    setTrialOpen(current =>
      current.get(trialId) === open ? current : new Map(current).set(trialId, open)
    );
  }, []);
  const focusedGroup = model.trialGroups.find(group =>
    group.classes.some(classItem => classItem.id === focusedId)
  );
  const focusedCardShowing =
    focusedClassIsVisible &&
    focusedGroup !== undefined &&
    (trialOpen.get(focusedGroup.trialId) ?? focusedGroup.defaultOpen);
  // Split with a class focused, the schedule is the rail (MYK9-1782).
  const railShown = isSplit && panelShows && model.focusedClass !== null;
  // Pinned beside the rail, the panel starts at the schedule heading, not under it (MYK9-1989).
  const panelLifted = pinMode === 'panel' && railShown && !selecting;
  const attentionStrip = model.attention.items.length > 0 && (
    <CockpitAttentionStrip
      openChoice={attentionOpenChoice}
      onOpenChoiceChange={setAttentionOpenChoice}
      items={model.attention.items}
      all={model.attention.all}
      overflowCount={model.attention.overflowCount}
      classNameById={new Map(model.daySchedule.map(cls => [cls.id, cls.name]))}
      onCommand={onCommand}
    />
  );
  const focusedPanel = model.focusedClass ? (
    <SecretaryCockpitFocusedClass
      showId={snapshot.showId}
      focused={model.focusedClass}
      sourceClass={sourceClass}
      trial={trial}
      attention={focusedAttention}
      timeZone={snapshot.timeZone}
      pinMode={pinMode}
      cardListed={focusedCardShowing}
      canManageShow={canManageShow}
      onCommand={onCommand}
      entryBreakdownByClassId={entryBreakdownByClassId}
      onRefreshEntries={onRefreshEntries}
      putBackEntries={putBackEntries}
      {...(runOrder !== undefined && { runOrder })}
      {...(canManageShow &&
        trial && {
          editClass: editClassAction(model.focusedClass.id, trial.id),
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

  // Keeps the picked class (everything is listed again), and puts focus on the Filter button
  // before the line or chip that was clicked disappears.
  const clearFilters = () => {
    document.querySelector<HTMLElement>('[data-testid="cockpit-filter"] button')?.focus();
    updateState({
      selectedDays: [],
      statuses: [],
      judges: [],
      elements: [],
      levels: [],
    });
  };

  return (
    <div className="space-y-5" data-testid="secretary-cockpit">
      {/* Needs attention first (MYK9-1727); the Filter sits under the schedule heading it narrows.
          With the class panel lifted it rides the rail above the heading instead (MYK9-1989). */}
      {!panelLifted && attentionStrip}

      {isEveryClassComplete(snapshot.classes) && <CockpitResultsHandoff showId={snapshot.showId} />}

      {model.focusUnavailable && (
        <CarriedClassNotice name={model.focusUnavailable.name ?? undefined} />
      )}

      <div
        ref={gridRef}
        // Stacked: one column that may shrink below its content's one-line width. An implicit
        // `auto` track took the Class work links' min-content and widened the page on a phone
        // (MYK9-1322); split already uses minmax(0, …) (cockpitSplit.ts).
        className={cn(
          'grid items-start',
          // Lifted, the panel spans both rows; a flexible second row takes its extra height, so
          // no gap opens under the heading above a short schedule (MYK9-1989).
          isSplit
            ? cn(panelLifted ? 'grid-rows-[auto_minmax(0,1fr)]' : 'grid-rows-[auto_auto]', 'gap-5')
            : 'grid-cols-[minmax(0,1fr)] gap-4'
        )}
        style={
          isSplit ? { gridTemplateColumns: cockpitSplitTemplate(railShown, rail.width) } : undefined
        }
        data-cockpit-layout={isSplit ? 'split' : 'stacked'}
        data-cockpit-rail={railShown ? 'true' : undefined}
      >
        <SecretaryCockpitSchedule
          showId={snapshot.showId}
          split={isSplit}
          panelLifted={panelLifted}
          aboveHeading={panelLifted ? attentionStrip : undefined}
          entryBreakdownByClassId={entryBreakdownByClassId}
          renderTrialActions={canManageShow ? renderTrialActions : undefined}
          model={model}
          sourceClasses={snapshot.classes}
          sourceTrials={snapshot.trials}
          filtered={hasActiveCockpitFilters(state)}
          filterBar={
            <CockpitFilterMenu
              snapshot={snapshot}
              model={model}
              filters={state}
              onDaysChange={selectedDays =>
                updateState({ selectedDays, focusedClassId: undefined, anchor: undefined })
              }
              onFiltersChange={update =>
                updateState(filtersUpdate(model, state.focusedClassId, state, update))
              }
              onClearAll={clearFilters}
            />
          }
          onShowAll={clearFilters}
          onFocusClass={focusedClassId => {
            setClickedClassId(focusedClassId);
            updateState({ focusedClassId, anchor: focusedClassId });
          }}
          // Selecting, a row click ticks rather than focuses, so the focused class's panel would
          // sit open in the middle of the list with no way to move or close it.
          inlineFocusedContent={
            !isSplit && focusedClassIsVisible && !selecting ? focusedPanel : undefined
          }
          select={canManageShow ? selection : undefined}
          onTrialOpenChange={reportTrialOpen}
        />
        {railShown && (
          <CockpitRailDivider
            width={rail.width}
            max={rail.max}
            lifted={panelLifted}
            onPreview={rail.previewWidth}
            onWidthChange={rail.setWidth}
          />
        )}
        <CockpitFocusOutlet
          split={isSplit}
          focus={{ shows: panelShows, listed: focusedClassIsVisible, id: focusedId }}
          pinned={pinMode === 'panel'}
          lifted={panelLifted}
          scheduleEmpty={model.trialGroups.length === 0}
          selecting={selecting}
        >
          {focusedPanel}
        </CockpitFocusOutlet>
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
      {canManageShow &&
        classDialogs(
          // The class settings sit in Edit class, not the pinned header (MYK9-2379). The Judge is
          // one control: the live one while the class has not started, the panel's own after.
          model.focusedClass && sourceClass && trial && pendingClassId === sourceClass.id ? (
            <FocusedClassSettings
              showId={snapshot.showId}
              focused={model.focusedClass}
              sourceClass={sourceClass}
              trial={trial}
              timeZone={snapshot.timeZone}
              classes={snapshot.classes}
              judges={judges}
              showJudge={!isJudgeChangeLocked(model.focusedClass)}
              registryId={snapshot.registryId ?? ''}
            />
          ) : undefined,
          model.focusedClass !== null &&
            pendingClassId === model.focusedClass.id &&
            !isJudgeChangeLocked(model.focusedClass),
          pendingClassId === sourceClass?.id
            ? {
                id: sourceClass?.judgeId ?? null,
                name: sourceClass?.judgeName ?? null,
                status: sourceClass?.status ?? null,
              }
            : undefined
        )}
      {canManageShow && packetTrialId && (
        <TrialPacketPanel
          open
          showId={snapshot.showId}
          trialId={packetTrialId}
          onClose={closePacket}
        />
      )}
    </div>
  );
}
