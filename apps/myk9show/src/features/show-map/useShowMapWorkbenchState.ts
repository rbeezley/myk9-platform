import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  buildShowMapTree,
  getDefaultExpandedNodeIds,
  getTrialsExpandedNodeIds,
} from './showMapTree';
import {
  getAllRecommendedActions,
  getAttentionCountsByNodeId,
  getRankedActions,
} from './showMapActions';
import { resolveShowMapActionExecution } from './showMapActionExecution';
import { getRunningNowItems } from './showMapRunningNow';
import { useShowMapActionExecutor } from './useShowMapActionExecutor';
import type {
  BuildShowMapTreeInput,
  ShowMapCompletionScope,
  ShowMapDayScope,
  ShowMapFilter,
  ShowMapScopeState,
  ShowMapTree,
} from './showMapTypes';
import type { ShowMapAction } from './showMapActions';

export interface UseShowMapWorkbenchStateInput extends BuildShowMapTreeInput {
  showId: string;
  scopeNow?: Date | undefined;
  initialDayScope?: ShowMapDayScope | undefined;
  initialCompletionScope?: ShowMapCompletionScope | undefined;
}

function actionKey(action: ShowMapAction): string {
  return `${action.id}:${action.nodeId}`;
}

// INTENT: Single source of truth for the workbench orchestration state shared
// by the Show Desk adaptive header and the (compact-mode) Show Map tree.
// Without this hook, the header and the tree would each own their own copy of
// expandedNodeIds / dismissedGuidanceKeys / executor — the surfaces would
// drift, e.g., dismissing a guidance action from the header wouldn't update
// the tree's highlighted row.
export function useShowMapWorkbenchState({
  show,
  trials,
  classes,
  entries,
  showId,
  scopeNow,
  initialDayScope = 'all',
  initialCompletionScope = 'active',
}: UseShowMapWorkbenchStateInput) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ShowMapFilter>('all');
  const [dayScope, setDayScope] = useState<ShowMapDayScope>(initialDayScope);
  const [completionScope, setCompletionScope] =
    useState<ShowMapCompletionScope>(initialCompletionScope);
  // INTENT: Guidance dismissals are session-local noise control, not a permanent action mute.
  const [dismissedGuidanceKeys, setDismissedGuidanceKeys] = useState<Set<string>>(() => new Set());

  const tree = useMemo<ShowMapTree>(
    () => buildShowMapTree({ show, trials, classes, entries }),
    [show, trials, classes, entries]
  );

  const scope = useMemo<ShowMapScopeState>(
    () => ({ dayScope, completionScope }),
    [completionScope, dayScope]
  );
  const effectiveScopeNow = useMemo(() => scopeNow ?? new Date(), [scopeNow]);

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
  const expandPathToNode = useCallback(
    (nodeId: string) => {
      setExpandedNodeIds(current => {
        const next = new Set(current);
        next.add(tree.root.id);
        let parentId = tree.nodesById[nodeId]?.parentId;
        while (parentId) {
          next.add(parentId);
          parentId = tree.nodesById[parentId]?.parentId;
        }
        return next;
      });
    },
    [tree]
  );

  const navigateTo = useCallback((href: string) => navigate(href), [navigate]);

  const executor = useShowMapActionExecutor({ showId });
  const { executeAction } = executor;

  const attentionCountsByNodeId = useMemo(
    () => getAttentionCountsByNodeId(tree),
    [tree]
  );
  const attentionCount = attentionCountsByNodeId.get(tree.root.id) ?? 0;

  const recommendedActions = useMemo(
    () => getAllRecommendedActions('root', { tree }),
    [tree]
  );

  const guidanceAction = recommendedActions.find(
    action => !dismissedGuidanceKeys.has(actionKey(action))
  );
  const guidanceExecution = guidanceAction
    ? resolveShowMapActionExecution(guidanceAction)
    : undefined;
  const startGuidanceAction = useCallback(() => {
    if (!guidanceAction || !guidanceExecution || guidanceExecution.kind === 'disabled') return;
    if (guidanceExecution.kind === 'navigate') navigateTo(guidanceExecution.href);
    else executeAction(guidanceAction, guidanceExecution);
  }, [executeAction, guidanceAction, guidanceExecution, navigateTo]);
  const dismissGuidanceAction = useCallback(() => {
    if (!guidanceAction) return;
    setDismissedGuidanceKeys(current => new Set(current).add(actionKey(guidanceAction)));
  }, [guidanceAction]);

  const priorityActions = useMemo(() => {
    const currentGuidanceKey = guidanceAction ? actionKey(guidanceAction) : null;
    const actions = getRankedActions('root', { tree });
    return currentGuidanceKey
      ? actions.filter(action => actionKey(action) !== currentGuidanceKey)
      : actions;
  }, [guidanceAction, tree]);

  const runningNowItems = useMemo(
    () => getRunningNowItems(tree, scope, effectiveScopeNow),
    [effectiveScopeNow, scope, tree]
  );

  const selectRunningNowClass = useCallback(
    (nodeId: string) => {
      expandPathToNode(nodeId);
      const scrollToNode = () => {
        // INTENT: Running Now uses stable row data attributes to focus recursive tree rows
        // without threading one-off refs through the whole structure table.
        const row = document.querySelector(`[data-node-id="${nodeId}"]`);
        if (row instanceof HTMLElement && typeof row.scrollIntoView === 'function') {
          row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      };
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(scrollToNode);
      } else {
        window.setTimeout(scrollToNode, 0);
      }
    },
    [expandPathToNode]
  );

  const resetFilters = useCallback(() => {
    setFilter('all');
    setDayScope(initialDayScope);
    setCompletionScope(initialCompletionScope);
  }, [initialCompletionScope, initialDayScope]);

  return {
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
    expandPathToNode,
    attentionCountsByNodeId,
    attentionCount,
    recommendedActions,
    guidanceAction,
    guidanceExecution,
    dismissedGuidanceKeys,
    dismissGuidanceAction,
    startGuidanceAction,
    priorityActions,
    runningNowItems,
    selectRunningNowClass,
    executor,
    navigateTo,
  };
}

export type ShowMapWorkbenchState = ReturnType<typeof useShowMapWorkbenchState>;
