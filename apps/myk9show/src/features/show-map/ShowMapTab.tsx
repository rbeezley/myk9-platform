import { useMemo } from 'react';
import { ListTree, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getShowMapNodeId } from './showMapTree';
import { ShowMapStructureTable } from './ShowMapStructureTable';
import { ShowMapMoveUpDialog, type ShowMapMoveUpTarget } from './ShowMapMoveUpDialog';
import { ShowMapMessageHandlerDialog } from './ShowMapMessageHandlerDialog';
import { ShowMapScratchNoShowDialog } from './ShowMapScratchNoShowDialog';
import { ShowMapToolbar } from './ShowMapToolbar';
import { ShowMapRunningNowStrip } from './ShowMapRunningNowStrip';
import { ShowMapGuidanceCard } from './ShowMapGuidanceCard';
import { countCatalogEntries } from './entryCounts';
import { resolveShowMapActionExecution } from './showMapActionExecution';
import { useShowMapWorkbenchState } from './useShowMapWorkbenchState';
import type { ShowMapWorkbenchState } from './useShowMapWorkbenchState';
import type {
  BuildShowMapTreeInput,
  ShowMapCompletionScope,
  ShowMapDayScope,
} from './showMapTypes';
import type { ShowMapAction } from './showMapActions';
import type { ExecutableShowMapActionExecution } from './showMapActionExecution';
import type { LastShowMapMoveUp } from './useShowMapActionExecutor';

interface ShowMapTabProps extends BuildShowMapTreeInput {
  canManageShow: boolean;
  initialDayScope?: ShowMapDayScope | undefined;
  initialCompletionScope?: ShowMapCompletionScope | undefined;
  scopeNow?: Date | undefined;
  // When true, hide internal Guidance card, Up Next queue, and Running Now
  // strip — the parent (e.g., ShowDeskAdaptiveHeader) owns those surfaces.
  // The parent also owns dialog rendering in compact mode so the header's
  // action triggers and the tree's row actions share one dialog root.
  compact?: boolean | undefined;
  // When provided, the tab consumes this shared state instead of creating
  // its own. Required for compact mode (so the header and tree agree on
  // expandedNodeIds, dismissedGuidanceKeys, executor, etc.).
  workbenchState?: ShowMapWorkbenchState | undefined;
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[112px] rounded-md border bg-card/70 px-3 py-2.5">
      <div className="text-xl font-bold leading-none text-foreground">{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function PriorityQueue({
  actions,
  onNavigate,
  onAction,
}: {
  actions: ShowMapAction[];
  onNavigate: (href: string) => void;
  onAction: (action: ShowMapAction, execution: ExecutableShowMapActionExecution) => void;
}) {
  const visibleActions = actions.slice(0, 4);
  if (visibleActions.length === 0) return null;

  return (
    <section className="mb-3 rounded-md border bg-muted/15" aria-label="Up next">
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
        Up next
      </div>
      <div className="divide-y">
        {visibleActions.map(action => {
          const execution = resolveShowMapActionExecution(action);
          const canExecute = execution.kind !== 'disabled';
          const execute = () => {
            if (execution.kind === 'disabled') return;
            if (execution.kind === 'navigate') onNavigate(execution.href);
            else onAction(action, execution);
          };

          return (
            <div
              key={`${action.id}:${action.nodeId}`}
              className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{action.label}</div>
                <div className="text-xs text-muted-foreground">{action.why}</div>
              </div>
              {canExecute && (
                <Button type="button" variant="outline" size="sm" onClick={execute}>
                  <action.icon className="h-4 w-4" />
                  Open
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MoveUpUndoBanner({
  moveUp,
  isUndoing,
  onUndo,
}: {
  moveUp: LastShowMapMoveUp | null;
  isUndoing: boolean;
  onUndo: () => void;
}) {
  if (!moveUp) return null;

  return (
    <div className="mb-3 rounded-md border bg-muted/20 px-3 py-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <span className="font-medium">Last move-up saved.</span>
          {moveUp.targetClassName && (
            <span className="text-muted-foreground"> Moved to {moveUp.targetClassName}.</span>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onUndo} disabled={isUndoing}>
          <RotateCcw className="h-4 w-4" />
          {isUndoing ? 'Undoing...' : 'Undo'}
        </Button>
      </div>
    </div>
  );
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

// INTENT: Thin dispatcher that decides whether to own state (legacy Today /
// Wrap-up mounts) or consume a parent's shared state (Show Desk tab). Splits
// into two child components so React only runs one useShowMapWorkbenchState
// per mount — preventing a duplicate useShowMapActionExecutor (which would
// create a second Supabase subscription + a second set of pending dialogs).
export default function ShowMapTab(props: ShowMapTabProps) {
  if (props.workbenchState) {
    return <ShowMapTabView {...props} state={props.workbenchState} />;
  }
  return <ShowMapTabStandalone {...props} />;
}

function ShowMapTabStandalone(props: ShowMapTabProps) {
  const state = useShowMapWorkbenchState({
    show: props.show,
    trials: props.trials,
    classes: props.classes,
    entries: props.entries,
    showId: props.show.id,
    ...(props.scopeNow !== undefined && { scopeNow: props.scopeNow }),
    initialDayScope: props.initialDayScope ?? 'all',
    initialCompletionScope: props.initialCompletionScope ?? 'active',
  });
  return <ShowMapTabView {...props} state={state} />;
}

function ShowMapTabView({
  show,
  trials,
  classes,
  entries,
  canManageShow,
  compact = false,
  state,
}: ShowMapTabProps & { state: ShowMapWorkbenchState }) {
  const {
    tree,
    scope,
    effectiveScopeNow,
    filter,
    setFilter,
    dayScope,
    setDayScope,
    completionScope,
    setCompletionScope,
    resetFilters,
    expandedNodeIds,
    toggleNode,
    collapseAll,
    expandTrials,
    attentionCountsByNodeId,
    attentionCount,
    guidanceAction,
    guidanceExecution,
    dismissGuidanceAction,
    startGuidanceAction,
    priorityActions,
    runningNowItems,
    selectRunningNowClass,
    executor,
    runOrderAutoSort,
    reorderMode,
    navigateTo,
  } = state;
  const { autoSort, isAutoSorting } = runOrderAutoSort;
  const enterReorderMode = reorderMode.enter;
  const {
    executeAction,
    moveUpAction,
    closeMoveUpDialog,
    confirmMoveUp,
    lastMoveUp,
    undoLastMoveUp,
    isUndoingMoveUp,
    scratchAction,
    closeScratchDialog,
    confirmScratchNoShow,
    messageAction,
    closeMessageDialog,
    confirmMessageHandler,
    isExecuting,
  } = executor;

  const catalogEntryCount = countCatalogEntries(entries);
  const moveUpTargets = useMemo(
    () => buildMoveUpTargets(classes, moveUpAction?.classId),
    [classes, moveUpAction?.classId]
  );
  const moveUpCurrentClass = moveUpAction?.classId
    ? tree.nodesById[`class:${moveUpAction.classId}`]
    : undefined;

  // INTENT: compact mode means the parent (Show Desk tab) renders the
  // dialogs at its own level so the header's action triggers share the
  // same dialog root as the tree's row actions.
  const renderDialogs = canManageShow && !compact;

  if (trials.length === 0) {
    return (
      <div className="rounded-md border bg-card p-6">
        <div className="flex items-start gap-3">
          <ListTree className="mt-1 h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-base font-semibold">No trials yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {canManageShow
                ? "Add trials to start building this show's list."
                : "This show doesn't have trials listed yet."}
            </p>
            {canManageShow && (
              <Button
                type="button"
                className="mt-4"
                onClick={() =>
                  navigateTo(`/secretary/create-show/wizard?showId=${show.id}&mode=add-trials`)
                }
              >
                New Trial
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-md border bg-background">
      <div className="border-b bg-muted/20 p-4">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-foreground">Show Map</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Scan the show by trial and class, then open the class you need.
          </p>
        </div>
        <div
          className="flex flex-wrap gap-3"
          data-node-id={getShowMapNodeId('show', show.id)}
          data-node-type="show"
        >
          <SummaryItem label="Trials" value={trials.length} />
          <SummaryItem label="Classes" value={classes.length} />
          <SummaryItem label="Entries" value={catalogEntryCount} />
          {canManageShow && <SummaryItem label="Need Attention" value={attentionCount} />}
        </div>
      </div>
      <ShowMapToolbar
        filter={filter}
        dayScope={dayScope}
        completionScope={completionScope}
        onFilterChange={setFilter}
        onDayScopeChange={setDayScope}
        onCompletionScopeChange={setCompletionScope}
        onCollapseAll={collapseAll}
        onExpandTrials={expandTrials}
        showActionHelp={canManageShow}
      />
      <div className="p-3">
        {canManageShow && !compact && (
          <ShowMapGuidanceCard
            action={guidanceAction}
            canExecute={Boolean(guidanceExecution && guidanceExecution.kind !== 'disabled')}
            onStart={startGuidanceAction}
            onDismiss={dismissGuidanceAction}
          />
        )}
        {!compact && (
          <ShowMapRunningNowStrip items={runningNowItems} onSelect={selectRunningNowClass} />
        )}
        {canManageShow && !compact && (
          <PriorityQueue
            actions={priorityActions}
            onNavigate={navigateTo}
            onAction={executeAction}
          />
        )}
        {canManageShow && !compact && (
          <MoveUpUndoBanner
            moveUp={lastMoveUp}
            isUndoing={isUndoingMoveUp}
            onUndo={undoLastMoveUp}
          />
        )}
        <ShowMapStructureTable
          tree={tree}
          expandedNodeIds={expandedNodeIds}
          filter={filter}
          scope={scope}
          scopeNow={effectiveScopeNow}
          onToggle={toggleNode}
          onNavigate={navigateTo}
          onAction={executeAction}
          enableRowActions={canManageShow}
          attentionCountsByNodeId={attentionCountsByNodeId}
          onResetFilters={resetFilters}
          runOrderControls={
            canManageShow
              ? {
                  onAutoSort: autoSort,
                  isAutoSorting,
                  onEnterReorderMode: enterReorderMode,
                }
              : undefined
          }
          reorderMode={canManageShow ? reorderMode : undefined}
        />
      </div>
      {renderDialogs && (
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
