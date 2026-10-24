import { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { SecretaryCockpit } from './cockpit/SecretaryCockpit';
import { buildSecretaryCockpitSnapshot } from './cockpit/buildSecretaryCockpitSnapshot';
import { ReadyForShowDaySection } from './cockpit/ReadyForShowDaySection';
import { useShowClassPaperwork } from './cockpit/useShowClassPaperwork';
import { ShowDeskToolPanel, type ShowDeskToolSection } from './ShowDeskToolsSheet';
import { ShowMapMessageHandlerDialog } from './ShowMapMessageHandlerDialog';
import { ShowMapMoveUpDialog } from './ShowMapMoveUpDialog';
import { useMoveUpTargets } from './useMoveUpTargets';
import { buildMoveUpClassLabeler, classIdsEnteredByDog } from './buildMoveUpTargets';
import { computeShowDeskPendingSignals } from './showDeskPendingSignals';
import { computeShowDeskStatus } from './showDeskStatus';
import { getRankedActions } from './showMapActions';
import { resolveShowMapActionExecution } from './showMapActionExecution';
import { useShowMapWorkbenchState } from './useShowMapWorkbenchState';
import type { BuildShowMapTreeInput } from './showMapTypes';
import type { ClassEntryBreakdown } from '@/features/entry-operations/classEntryBreakdown';

interface ShowDeskPanelProps extends BuildShowMapTreeInput {
  canManageShow: boolean;
  scopeNow?: Date | undefined;
  tools?: readonly ShowDeskToolSection[];
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
  const trialRefs = useMemo(
    () => trials.map(trialItem => ({ id: trialItem.id, trialDate: trialItem.trialDate })),
    [trials]
  );
  // One class projection for paperwork fingerprints, shared with Reports -- never the camelCase
  // tree rows, which lack the facts a fingerprint includes (time limit, area count).
  const { byClassId: paperworkByClassId, available: paperworkAvailable } = useShowClassPaperwork({
    showId: show.id,
    trials: trialRefs,
    classes,
    entries,
    returnTo,
  });
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

  const moveUpDogId = moveUpAction
    ? tree.nodesById[moveUpAction.nodeId]?.entryDisplay?.dogId
    : undefined;
  const enteredClassIds = useMemo(
    () => classIdsEnteredByDog(entries, moveUpDogId),
    [entries, moveUpDogId]
  );
  const {
    targets: moveUpTargets,
    capacityState: moveUpCapacityState,
    capacityIsStale: moveUpCapacityIsStale,
  } = useMoveUpTargets(show.id, classes, moveUpAction?.classId, enteredClassIds);
  // MYK9-1385: same label the target list shows; the tree node's label can be a stored name that
  // lacks the section.
  const moveUpCurrentClass = useMemo(() => {
    const node = moveUpAction?.classId
      ? tree.nodesById[`class:${moveUpAction.classId}`]
      : undefined;
    const cls = classes.find(candidate => candidate.id === moveUpAction?.classId);
    return node && cls ? { ...node, label: buildMoveUpClassLabeler(classes)(cls) } : node;
  }, [classes, moveUpAction?.classId, tree]);

  return (
    <div className="space-y-4">
      {/* INTENT: no button row here (MYK9-1317). Add Trial and Select classes are Actions-menu
          rows; paper scoring is per class, in the focused class's Class work. The heading stays
          for screen readers and the load-readiness probe. */}
      <h2 className="sr-only">Your show</h2>
      {tools && <ShowDeskToolPanel tools={tools} />}
      {desk.status === 'setup' && (
        <div
          className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
          role="status"
        >
          Show-day work has not started. Entries are on the Entry Forms tab, and show setup is here
          on Overview.
        </div>
      )}
      {canManageShow && (
        <ReadyForShowDaySection
          show={show}
          trials={trials}
          classes={classes}
          now={effectiveScopeNow}
          entryBreakdownByClassId={entryBreakdownByClassId}
          paperwork={{ byClassId: paperworkByClassId, available: paperworkAvailable }}
        />
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
