import { useCallback, useMemo } from 'react';
import { ShowDeskAdaptiveHeader } from './ShowDeskAdaptiveHeader';
import { ShowMapMoveUpDialog, type ShowMapMoveUpTarget } from './ShowMapMoveUpDialog';
import { ShowMapMessageHandlerDialog } from './ShowMapMessageHandlerDialog';
import { ShowMapScratchNoShowDialog } from './ShowMapScratchNoShowDialog';
import ShowMapTab from './ShowMapTab';
import { resolveShowMapActionExecution } from './showMapActionExecution';
import { computeShowDeskPendingSignals } from './showDeskPendingSignals';
import { computeShowDeskStatus } from './showDeskStatus';
import { useShowMapWorkbenchState } from './useShowMapWorkbenchState';
import type { BuildShowMapTreeInput } from './showMapTypes';
import type { ShowMapAction } from './showMapActions';
import type { ShowDeskPendingSignalId } from './showDeskPendingSignals';

interface ShowDeskPanelProps extends BuildShowMapTreeInput {
  canManageShow: boolean;
  scopeNow?: Date | undefined;
}

function buildMoveUpTargets(
  classes: BuildShowMapTreeInput['classes'],
  currentClassId: string | undefined
): ShowMapMoveUpTarget[] {
  return classes
    .filter(cls => cls.id !== currentClassId)
    .map(cls => ({
      id: cls.id,
      label: cls.name || [cls.element, cls.level, cls.section].filter(Boolean).join(' '),
      detail: [cls.trialDate, cls.trialNumber ? `Trial ${cls.trialNumber}` : undefined]
        .filter(Boolean)
        .join(' · '),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// INTENT: Show Desk surface for Phase B2a. Owns the shared workbench state so
// the adaptive header and the compact-mode Show Map tree agree on tree,
// expandedNodeIds, dismissedGuidanceKeys, and executor. Dialogs render here
// (not inside the compact tree) so the header's action triggers share one
// dialog root with row-action triggers.
export default function ShowDeskPanel({
  show,
  trials,
  classes,
  entries,
  canManageShow,
  scopeNow,
}: ShowDeskPanelProps) {
  const state = useShowMapWorkbenchState({
    show,
    trials,
    classes,
    entries,
    showId: show.id,
    // Show Desk uses the unified (merged) action set — no phase fork.
    ...(scopeNow !== undefined && { scopeNow }),
    initialDayScope: 'all',
    initialCompletionScope: 'active',
  });

  const {
    tree,
    executor,
    navigateTo,
    guidanceAction,
    priorityActions,
    runningNowItems,
    selectRunningNowClass,
    dismissGuidanceAction,
  } = state;
  const {
    executeAction,
    moveUpAction,
    closeMoveUpDialog,
    confirmMoveUp,
    scratchAction,
    closeScratchDialog,
    confirmScratchNoShow,
    messageAction,
    closeMessageDialog,
    confirmMessageHandler,
    isExecuting,
  } = executor;

  const desk = useMemo(
    () => computeShowDeskStatus({ show, trials, tree }),
    [show, trials, tree]
  );
  const pendingSignals = useMemo(
    () => computeShowDeskPendingSignals({ tree, entries }),
    [entries, tree]
  );
  const moveUpTargets = useMemo(
    () => buildMoveUpTargets(classes, moveUpAction?.classId),
    [classes, moveUpAction?.classId]
  );
  const moveUpCurrentClass = moveUpAction?.classId
    ? tree.nodesById[`class:${moveUpAction.classId}`]
    : undefined;

  // Resolve each action's execution shape so the header can dispatch them.
  const startAction = useCallback(
    (action: ShowMapAction) => {
      const execution = resolveShowMapActionExecution(action);
      if (execution.kind === 'disabled') return;
      if (execution.kind === 'navigate') navigateTo(execution.href);
      else executeAction(action, execution);
    },
    [executeAction, navigateTo]
  );

  // INTENT: Pattern 1 (counts are filter shortcuts) — pending-signal chips
  // map to the existing Show Map filter set. Phase B2a wires the placeholder
  // hook; richer subtree-scoped filtering arrives with the tools sheet (B3).
  const handlePendingSignal = useCallback(
    (_signalId: ShowDeskPendingSignalId) => {
      state.setFilter('needs-attention');
    },
    [state]
  );

  return (
    <div className="space-y-4 pt-6">
      <ShowDeskAdaptiveHeader
        showStatus={desk.status}
        statusSummary={desk.summary}
        guidanceAction={guidanceAction}
        upNextActions={priorityActions}
        runningNow={runningNowItems}
        pendingSignals={pendingSignals}
        onStartAction={startAction}
        onDismissGuidance={dismissGuidanceAction}
        onSelectRunning={selectRunningNowClass}
        onSelectPendingSignal={handlePendingSignal}
      />
      <ShowMapTab
        show={show}
        trials={trials}
        classes={classes}
        entries={entries}
        canManageShow={canManageShow}
        compact
        workbenchState={state}
      />
      {canManageShow && (
        <>
          <ShowMapMoveUpDialog
            key={moveUpAction?.nodeId ?? 'move-up-dialog'}
            open={Boolean(moveUpAction)}
            node={moveUpAction ? tree.nodesById[moveUpAction.nodeId] : undefined}
            currentClass={moveUpCurrentClass}
            targets={moveUpTargets}
            isSubmitting={isExecuting}
            onOpenChange={open => {
              if (!open) closeMoveUpDialog();
            }}
            onConfirm={confirmMoveUp}
          />
          <ShowMapScratchNoShowDialog
            key={scratchAction?.nodeId ?? 'scratch-dialog'}
            open={Boolean(scratchAction)}
            node={scratchAction ? tree.nodesById[scratchAction.nodeId] : undefined}
            isSubmitting={isExecuting}
            onOpenChange={open => {
              if (!open) closeScratchDialog();
            }}
            onConfirm={confirmScratchNoShow}
          />
          <ShowMapMessageHandlerDialog
            key={messageAction?.nodeId ?? 'message-handler-dialog'}
            open={Boolean(messageAction)}
            node={messageAction ? tree.nodesById[messageAction.nodeId] : undefined}
            isSubmitting={isExecuting}
            onOpenChange={open => {
              if (!open) closeMessageDialog();
            }}
            onConfirm={body => confirmMessageHandler({ body })}
          />
        </>
      )}
    </div>
  );
}
