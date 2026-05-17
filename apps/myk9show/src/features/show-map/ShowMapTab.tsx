import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListTree, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/common/ErrorState';
import {
  buildShowMapTree,
  getDefaultExpandedNodeIds,
  getShowMapNodeId,
  getTrialsExpandedNodeIds,
} from './showMapTree';
import { ShowMapStructureTable } from './ShowMapStructureTable';
import { ShowMapMoveUpDialog, type ShowMapMoveUpTarget } from './ShowMapMoveUpDialog';
import { ShowMapMessageHandlerDialog } from './ShowMapMessageHandlerDialog';
import { ShowMapScratchNoShowDialog } from './ShowMapScratchNoShowDialog';
import { ShowMapToolbar } from './ShowMapToolbar';
import { countCatalogEntries } from './entryCounts';
import { getRankedActions, getRecommendedActions } from './showMapActions';
import { resolveShowMapActionExecution } from './showMapActionExecution';
import { useShowMapActionExecutor } from './useShowMapActionExecutor';
import type {
  BuildShowMapTreeInput,
  ShowMapCompletionScope,
  ShowMapDayScope,
  ShowMapFilter,
  ShowMapTree,
} from './showMapTypes';
import type { ShowMapAction } from './showMapActions';
import type { ExecutableShowMapActionExecution } from './showMapActionExecution';
import type { LastShowMapMoveUp } from './useShowMapActionExecutor';

interface ShowMapTabProps extends BuildShowMapTreeInput {
  canManageShow: boolean;
  initialDayScope?: ShowMapDayScope | undefined;
  scopeNow?: Date | undefined;
}

function useExpandedNodes(tree: ShowMapTree) {
  const [expandedNodeIds, setExpandedNodeIds] = useState(() => getDefaultExpandedNodeIds(tree));

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodeIds(current => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const collapseAll = useCallback(
    () => setExpandedNodeIds(new Set([tree.root.id])),
    [tree.root.id]
  );
  const expandTrials = useCallback(
    () => setExpandedNodeIds(getTrialsExpandedNodeIds(tree)),
    [tree]
  );

  return { expandedNodeIds, toggleNode, collapseAll, expandTrials };
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

function NextBestAction({
  action,
  onNavigate,
  onAction,
}: {
  action: ShowMapAction | undefined;
  onNavigate: (href: string) => void;
  onAction: (action: ShowMapAction, execution: ExecutableShowMapActionExecution) => void;
}) {
  if (!action) return null;
  const execution = resolveShowMapActionExecution(action);
  const canExecute = execution.kind !== 'disabled';
  const execute = () => {
    if (execution.kind === 'disabled') return;
    if (execution.kind === 'navigate') onNavigate(execution.href);
    else onAction(action, execution);
  };

  return (
    <div className="border-b bg-muted/20 px-4 py-3 text-foreground">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Next: {action.label}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">{action.why}</div>
        </div>
        {canExecute && (
          <Button type="button" size="sm" onClick={execute}>
            <action.icon className="h-4 w-4" />
            Start
          </Button>
        )}
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
    <div className="mb-3 rounded-md border bg-muted/15">
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
        Priority Queue
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
    </div>
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

export default function ShowMapTab({
  show,
  trials,
  classes,
  entries,
  canManageShow,
  initialDayScope = 'all',
  scopeNow,
}: ShowMapTabProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ShowMapFilter>('all');
  const [dayScope, setDayScope] = useState<ShowMapDayScope>(initialDayScope);
  const [completionScope, setCompletionScope] = useState<ShowMapCompletionScope>('active');
  const tree = useMemo(
    () => buildShowMapTree({ show, trials, classes, entries }),
    [show, trials, classes, entries]
  );
  const scope = useMemo(() => ({ dayScope, completionScope }), [completionScope, dayScope]);
  const effectiveScopeNow = useMemo(() => scopeNow ?? new Date(), [scopeNow]);
  const { expandedNodeIds, toggleNode, collapseAll, expandTrials } = useExpandedNodes(tree);
  const navigateTo = useCallback((href: string) => navigate(href), [navigate]);
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
  } = useShowMapActionExecutor({ showId: show.id });
  const attentionCount = tree.root.attentionCount ?? 0;
  const catalogEntryCount = countCatalogEntries(entries);
  const recommendedActions = useMemo(() => getRecommendedActions('root', { tree }), [tree]);
  const priorityActions = useMemo(() => getRankedActions('root', { tree }), [tree]);
  const moveUpTargets = useMemo(
    () => buildMoveUpTargets(classes, moveUpAction?.classId),
    [classes, moveUpAction?.classId]
  );
  const moveUpCurrentClass = moveUpAction?.classId
    ? tree.nodesById[`class:${moveUpAction.classId}`]
    : undefined;

  if (!canManageShow) {
    return <ErrorState message="Show Map is only available to show staff." />;
  }

  if (trials.length === 0) {
    return (
      <div className="rounded-md border bg-card p-6">
        <div className="flex items-start gap-3">
          <ListTree className="mt-1 h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-base font-semibold">No trials yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add trials to start building this show's list.
            </p>
            <Button
              type="button"
              className="mt-4"
              onClick={() =>
                navigate(`/secretary/create-show/wizard?showId=${show.id}&mode=add-trials`)
              }
            >
              New Trial
            </Button>
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
          <SummaryItem label="Need Attention" value={attentionCount} />
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
      />
      <NextBestAction
        action={recommendedActions[0]}
        onNavigate={navigateTo}
        onAction={executeAction}
      />
      <div className="p-3">
        <PriorityQueue actions={priorityActions} onNavigate={navigateTo} onAction={executeAction} />
        <MoveUpUndoBanner moveUp={lastMoveUp} isUndoing={isUndoingMoveUp} onUndo={undoLastMoveUp} />
        <ShowMapStructureTable
          tree={tree}
          expandedNodeIds={expandedNodeIds}
          filter={filter}
          scope={scope}
          scopeNow={effectiveScopeNow}
          onToggle={toggleNode}
          onNavigate={navigateTo}
          onAction={executeAction}
        />
      </div>
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
    </div>
  );
}
