import { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { PhaseShell } from '@/features/show-workbench/PhaseShell';

import { SecretaryCockpit } from './cockpit/SecretaryCockpit';
import { buildSecretaryCockpitSnapshot } from './cockpit/buildSecretaryCockpitSnapshot';
import { buildClassPaperworkMap } from './cockpit/buildClassPaperworkMap';
import { useShowPaperworkPrints } from './cockpit/useShowPaperworkPrints';
import { ShowDeskToolsSheet, type ShowDeskToolSection } from './ShowDeskToolsSheet';
import { ShowMapMessageHandlerDialog } from './ShowMapMessageHandlerDialog';
import { ShowMapMoveUpDialog } from './ShowMapMoveUpDialog';
import { ShowMapScratchNoShowDialog } from './ShowMapScratchNoShowDialog';
import { useMoveUpTargets } from './useMoveUpTargets';
import { computeShowDeskPendingSignals } from './showDeskPendingSignals';
import { computeShowDeskStatus } from './showDeskStatus';
import { getRankedActions } from './showMapActions';
import { resolveShowMapActionExecution } from './showMapActionExecution';
import { useShowMapWorkbenchState } from './useShowMapWorkbenchState';
import type { ShowDeskActionableTone } from './showDeskActionable';
import type { BuildShowMapTreeInput } from './showMapTypes';
import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';
import { ShowHomeSetupLinks } from './ShowHomeSetupLinks';
import { getTrialRegistry } from '@/features/registries';
import type { DbClass, DbEntry } from '@/types/database-mappings';

interface ShowDeskPanelProps extends BuildShowMapTreeInput {
  canManageShow: boolean;
  scopeNow?: Date | undefined;
  tools?: readonly ShowDeskToolSection[];
  actionableCount?: number | undefined;
  actionableTone?: ShowDeskActionableTone | undefined;
  actionableIncomplete?: boolean | undefined;
  /** Entered/pending per class for the schedule rows (MYK9-943); absent until read. */
  entryBreakdownByClassId?: ReadonlyMap<string, ClassEntryBreakdown> | undefined;
}

// INTENT: This is the secretary's live operations cockpit. It projects the
// existing Show Map data and action engine by Trial and Class; it does not own
// duplicate entry, score, report, or result workflows. Those remain deep links
// to their canonical pages.
export default function ShowDeskPanel({
  show,
  trials,
  classes,
  entries,
  canManageShow,
  scopeNow,
  tools,
  actionableCount,
  actionableTone,
  actionableIncomplete,
  entryBreakdownByClassId,
}: ShowDeskPanelProps) {
  const location = useLocation();
  const state = useShowMapWorkbenchState({
    show,
    trials,
    classes,
    entries,
    showId: show.id,
    ...(scopeNow !== undefined && { scopeNow }),
    initialDayScope: 'all',
    initialCompletionScope: 'active',
    // Show Desk does not render the tree -- it renders the cockpit, and reads the
    // tree only for actions and counts. The 25-entry preview cap is a TREE-RENDERING
    // concern (ShowMapTab's table), and applying it here silently truncated two
    // things: move-up was offered for a class's first 25 entries only, and the
    // attention count missed `review-entry` on every pending entry past the 25th.
    entryPreviewLimit: Number.POSITIVE_INFINITY,
  });
  const { tree, executor, navigateTo, effectiveScopeNow, runOrderAutoSort } = state;
  const {
    executeAction,
    moveUpAction,
    closeMoveUpDialog,
    confirmMoveUp,
    moveUpReversal,
    isReversingMoveUp,
    reverseMoveUp,
    scratchAction,
    closeScratchDialog,
    confirmScratchNoShow,
    messageAction,
    closeMessageDialog,
    confirmMessageHandler,
    isExecuting,
  } = executor;

  const pendingSignals = useMemo(
    () =>
      canManageShow
        ? computeShowDeskPendingSignals({
            showId: show.id,
            tree,
            entries,
            currentDate: effectiveScopeNow,
          })
        : [],
    [canManageShow, effectiveScopeNow, entries, show.id, tree]
  );
  const returnTo = `${location.pathname}${location.search}`;
  const paperworkPrints = useShowPaperworkPrints(show.id);
  const paperworkByClassId = useMemo(
    () =>
      buildClassPaperworkMap({
        showId: show.id,
        classes: classes.map(classItem => ({
          ...classItem,
          trial_id: classItem.trialId,
        })) as unknown as DbClass[],
        trials: trials.map(trialItem => ({ id: trialItem.id, trialDate: trialItem.trialDate })),
        entries: entries as unknown as DbEntry[],
        records: paperworkPrints.data ?? [],
        // Dropping this is what made "Not confirmed printed" a claim rather
        // than a reading -- see useShowPaperworkPrints' own comment.
        recordsUnavailable: paperworkPrints.isError || paperworkPrints.syncFailed,
        returnTo,
      }),
    [
      classes,
      entries,
      paperworkPrints.data,
      paperworkPrints.isError,
      paperworkPrints.syncFailed,
      returnTo,
      show.id,
      trials,
    ]
  );
  const snapshot = useMemo(
    () =>
      buildSecretaryCockpitSnapshot({
        showId: show.id,
        trials,
        classes,
        tree,
        pendingSignals,
        returnTo,
        now: effectiveScopeNow,
        paperworkByClassId,
      }),
    [
      classes,
      effectiveScopeNow,
      paperworkByClassId,
      pendingSignals,
      returnTo,
      show.id,
      tree,
      trials,
    ]
  );
  const desk = useMemo(
    () => computeShowDeskStatus({ show, trials, tree, now: effectiveScopeNow }),
    [effectiveScopeNow, show, tree, trials]
  );

  const runCommand = useCallback(
    (commandId: string) => {
      const action = getRankedActions('root', { tree, now: effectiveScopeNow }).find(
        candidate => `${candidate.id}:${candidate.nodeId}` === commandId
      );
      if (!action) return;
      const execution = resolveShowMapActionExecution(action);
      if (execution.kind === 'disabled') return;
      if (execution.kind === 'navigate') navigateTo(execution.href);
      else executeAction(action, execution);
    },
    [effectiveScopeNow, executeAction, navigateTo, tree]
  );

  const registryId = getTrialRegistry(trials[0]).id;
  const {
    targets: moveUpTargets,
    capacityState: moveUpCapacityState,
    capacityIsStale: moveUpCapacityIsStale,
  } = useMoveUpTargets(show.id, classes, moveUpAction?.classId, registryId);
  const moveUpCurrentClass = moveUpAction?.classId
    ? tree.nodesById[`class:${moveUpAction.classId}`]
    : undefined;

  return (
    <div className="space-y-4">
      <PhaseShell
        title="Your show"
        kicker="Before, during and after the show"
        actions={
          tools && tools.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {canManageShow && <ShowHomeSetupLinks showId={show.id} />}
              <ShowDeskToolsSheet
                showId={show.id}
                tools={tools}
                {...(actionableCount !== undefined && { actionableCount })}
                {...(actionableTone !== undefined && { actionableTone })}
                {...(actionableIncomplete !== undefined && { actionableIncomplete })}
              />
            </div>
          ) : undefined
        }
      />
      {desk.status === 'setup' && (
        <div
          className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
          role="status"
        >
          Show-day work has not started. Setup and entry work remain available from their normal
          pages.
        </div>
      )}
      <SecretaryCockpit
        entryBreakdownByClassId={entryBreakdownByClassId}
        snapshot={snapshot}
        canManageShow={canManageShow}
        onCommand={runCommand}
        {...(canManageShow && {
          // F29b phase 2a. Gated on canManageShow for the same reason the entry rows
          // are: an exhibitor-facing render must not get a mutation control.
          runOrder: {
            onAutoSort: runOrderAutoSort.autoSort,
            isAutoSorting: runOrderAutoSort.isAutoSorting,
            onPlaceEntry: runOrderAutoSort.placeEntry,
            lastChange: runOrderAutoSort.lastAutoSort
              ? {
                  classId: runOrderAutoSort.lastAutoSort.classId,
                  summary: runOrderAutoSort.lastAutoSort.summary ?? 'Run order changed',
                }
              : null,
            onUndo: runOrderAutoSort.undoLastAutoSort,
          },
        })}
      />

      {canManageShow && (
        <>
          <ShowMapMoveUpDialog
            open={Boolean(moveUpAction)}
            node={moveUpAction ? tree.nodesById[moveUpAction.nodeId] : undefined}
            currentClass={moveUpCurrentClass}
            targets={moveUpTargets}
            capacityState={moveUpCapacityState}
            capacityIsStale={moveUpCapacityIsStale}
            isSubmitting={isExecuting}
            onOpenChange={open => !open && closeMoveUpDialog()}
            onConfirm={confirmMoveUp}
            {...(moveUpReversal !== undefined && { reversal: moveUpReversal })}
            isReversing={isReversingMoveUp}
            onMoveBack={reverseMoveUp}
          />
          <ShowMapScratchNoShowDialog
            open={Boolean(scratchAction)}
            node={scratchAction ? tree.nodesById[scratchAction.nodeId] : undefined}
            isSubmitting={isExecuting}
            onOpenChange={open => !open && closeScratchDialog()}
            onConfirm={confirmScratchNoShow}
          />
          <ShowMapMessageHandlerDialog
            open={Boolean(messageAction)}
            node={messageAction ? tree.nodesById[messageAction.nodeId] : undefined}
            isSubmitting={isExecuting}
            onOpenChange={open => !open && closeMessageDialog()}
            onConfirm={body => confirmMessageHandler({ body })}
          />
        </>
      )}
    </div>
  );
}
