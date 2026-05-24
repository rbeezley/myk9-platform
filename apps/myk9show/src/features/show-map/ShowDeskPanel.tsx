import { useCallback, useMemo, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShowDeskAdaptiveHeader } from './ShowDeskAdaptiveHeader';
import { ShowDeskCloseoutSection } from './ShowDeskCloseoutSection';
import { ShowDeskToolsSheet } from './ShowDeskToolsSheet';
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
  // Composed at the page level so this panel never needs to know about
  // judges, incident options, broadcast classes, or other tool-specific
  // data dependencies. When omitted, the Tools sheet is not rendered.
  toolsContent?: ReactNode;
  // Composed at the page level — the closeout section renders only when
  // at least one class is wrap-up-eligible (see ShowDeskCloseoutSection).
  closeoutContent?: ReactNode;
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
  toolsContent,
  closeoutContent,
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
    runOrderAutoSort,
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
  // Depending on the whole `state` object would re-bind this callback on
  // every render (state is a fresh literal each call) and force the header's
  // memoized chips to rebuild — depend only on the stable setter.
  const { setFilter } = state;
  const handlePendingSignal = useCallback(
    (_signalId: ShowDeskPendingSignalId) => {
      setFilter('needs-attention');
    },
    [setFilter]
  );

  return (
    <div className="space-y-4 pt-6">
      {toolsContent && (
        <div className="flex justify-end">
          <ShowDeskToolsSheet>{toolsContent}</ShowDeskToolsSheet>
        </div>
      )}
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
      {canManageShow && runOrderAutoSort.lastAutoSort && (
        <div className="rounded-md border bg-muted/20 px-3 py-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <span className="font-medium">Run order updated.</span>
              {runOrderAutoSort.lastAutoSort.classLabel && (
                <span className="text-muted-foreground">
                  {' '}
                  {runOrderAutoSort.lastAutoSort.classLabel}.
                </span>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={runOrderAutoSort.undoLastAutoSort}
              disabled={runOrderAutoSort.isUndoingAutoSort}
            >
              <RotateCcw className="h-4 w-4" />
              {runOrderAutoSort.isUndoingAutoSort ? 'Undoing...' : 'Undo'}
            </Button>
          </div>
        </div>
      )}
      <ShowMapTab
        show={show}
        trials={trials}
        classes={classes}
        entries={entries}
        canManageShow={canManageShow}
        compact
        workbenchState={state}
      />
      {closeoutContent && (
        <ShowDeskCloseoutSection tree={tree}>{closeoutContent}</ShowDeskCloseoutSection>
      )}
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
