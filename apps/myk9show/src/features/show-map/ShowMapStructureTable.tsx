import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { cn } from '@/lib/utils';
import { getAttentionNodeIds, getPrimaryActionForNode } from './showMapActions';
import { ShowMapRowActionsMenu } from './ShowMapRowActionsMenu';
import {
  DEFAULT_SHOW_MAP_SCOPE,
  getNodeDayBucket,
  isDimmedByDayScope,
  nodeMatchesCompletionScope,
  nodeMatchesDayScope,
} from './showMapTimeScope';
import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import type { ExecutableShowMapActionExecution } from './showMapActionExecution';
import type { ShowMapAction } from './showMapActions';
import type { ShowMapFilter, ShowMapNode, ShowMapScopeState, ShowMapTree } from './showMapTypes';

interface ShowMapStructureTableProps {
  tree: ShowMapTree;
  expandedNodeIds: Set<string>;
  filter: ShowMapFilter;
  onToggle: (nodeId: string) => void;
  onNavigate?: (href: string) => void;
  onAction?: (action: ShowMapAction, execution: ExecutableShowMapActionExecution) => void;
  scope?: ShowMapScopeState | undefined;
  scopeNow?: Date | undefined;
}

function nodeMatchesFilter(
  node: ShowMapNode,
  filter: ShowMapFilter,
  attentionNodeIds: Set<string>
): boolean {
  if (filter === 'all') return true;
  if (filter === 'needs-attention') {
    return attentionNodeIds.has(node.id);
  }
  return node.status?.kind === 'active';
}

function nodeMatchesScopeAndFilter(
  tree: ShowMapTree,
  node: ShowMapNode,
  filter: ShowMapFilter,
  attentionNodeIds: Set<string>,
  scope: ShowMapScopeState,
  scopeNow: Date
): boolean {
  return (
    nodeMatchesDayScope(tree, node, scope.dayScope, scopeNow) &&
    nodeMatchesCompletionScope(node, scope.completionScope) &&
    nodeMatchesFilter(node, filter, attentionNodeIds)
  );
}

function descendantsMatch(
  tree: ShowMapTree,
  nodeId: string,
  filter: ShowMapFilter,
  attentionNodeIds: Set<string>,
  scope: ShowMapScopeState,
  scopeNow: Date
): boolean {
  const childIds = tree.childIdsByParentId[nodeId] ?? [];
  return childIds.some(childId => {
    const child = tree.nodesById[childId];
    return (
      !!child &&
      (nodeMatchesScopeAndFilter(tree, child, filter, attentionNodeIds, scope, scopeNow) ||
        descendantsMatch(tree, childId, filter, attentionNodeIds, scope, scopeNow))
    );
  });
}

function shouldRenderNode(
  tree: ShowMapTree,
  node: ShowMapNode,
  filter: ShowMapFilter,
  attentionNodeIds: Set<string>,
  scope: ShowMapScopeState,
  scopeNow: Date
): boolean {
  return (
    node.type === 'show' ||
    nodeMatchesScopeAndFilter(tree, node, filter, attentionNodeIds, scope, scopeNow) ||
    descendantsMatch(tree, node.id, filter, attentionNodeIds, scope, scopeNow)
  );
}

function getTreeItemAttrs(
  node: ShowMapNode,
  depth: number,
  hasChildren: boolean,
  isExpanded: boolean
) {
  return {
    role: 'treeitem' as const,
    'aria-level': depth + 1,
    'aria-expanded': hasChildren ? isExpanded : undefined,
    'data-node-id': node.id,
    'data-node-type': node.type,
  };
}

function ProgressCell({ node }: { node: ShowMapNode }) {
  if (!node.progress) return <span className="text-sm text-muted-foreground">-</span>;
  const value = Math.round((node.progress.completed / node.progress.total) * 100);
  return (
    <div className="min-w-[150px]">
      <div className="mb-1 text-xs text-muted-foreground">{node.progress.label}</div>
      <Progress value={value} className="h-1.5" />
    </div>
  );
}

function StatusCell({ node }: { node: ShowMapNode }) {
  return (
    <div className="flex flex-wrap gap-1">
      {node.status && <Badge variant="secondary">{node.status.label}</Badge>}
      {node.checkInStatus && <Badge variant="outline">{node.checkInStatus.label}</Badge>}
      {!!node.attentionCount && (
        <Badge variant="outline">{node.attentionCount} need attention</Badge>
      )}
      {!node.status && !node.checkInStatus && !node.attentionCount && (
        <span className="text-sm text-muted-foreground">-</span>
      )}
    </div>
  );
}

function EntryIdentity({
  node,
  onNavigate,
}: {
  node: ShowMapNode;
  onNavigate?: ((href: string) => void) | undefined;
}) {
  const display = node.entryDisplay;
  if (!display) {
    return <span className="block truncate text-sm font-semibold">{node.label}</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <ArmbandBadge armband={display.armband} className="size-12 rounded-[10px] text-base" />
      <div className="min-w-0">
        {display.dogHref ? (
          <button
            type="button"
            onClick={() => onNavigate?.(display.dogHref!)}
            className="block max-w-full truncate rounded-sm text-left text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {display.dogName}
          </button>
        ) : (
          <div className="truncate text-sm font-semibold">{display.dogName}</div>
        )}
        {display.breed && (
          <div className="truncate text-sm text-muted-foreground">{display.breed}</div>
        )}
        {display.handler && display.handlerHref && (
          <button
            type="button"
            onClick={() => onNavigate?.(display.handlerHref!)}
            className="block max-w-full truncate rounded-sm text-left text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {display.handler}
          </button>
        )}
        {display.handler && !display.handlerHref && (
          <div className="truncate text-xs text-muted-foreground">{display.handler}</div>
        )}
      </div>
    </div>
  );
}

export function ShowMapStructureTable({
  tree,
  expandedNodeIds,
  filter,
  onToggle,
  onNavigate,
  onAction,
  scope = DEFAULT_SHOW_MAP_SCOPE,
  scopeNow = new Date(),
}: ShowMapStructureTableProps) {
  const [actionMenuOpenSignals, setActionMenuOpenSignals] = useState<Record<string, number>>({});
  const attentionNodeIds = useMemo(() => getAttentionNodeIds(tree), [tree]);
  const openActionsForNode = (nodeId: string) => {
    setActionMenuOpenSignals(current => ({
      ...current,
      [nodeId]: (current[nodeId] ?? 0) + 1,
    }));
  };
  const getRowActionOpenProps = (nodeId: string) => ({
    'data-row-action-surface': nodeId,
    onContextMenu: (event: MouseEvent<HTMLDivElement>) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('a,button,input,textarea,select,[role="button"],[role="menuitem"]')
      ) {
        return;
      }
      event.preventDefault();
      openActionsForNode(nodeId);
    },
  });

  const renderNode = (nodeId: string, depth: number): ReactNode => {
    const node = tree.nodesById[nodeId];
    if (!node || !shouldRenderNode(tree, node, filter, attentionNodeIds, scope, scopeNow)) {
      return null;
    }

    const childIds = tree.childIdsByParentId[nodeId] ?? [];
    const visibleChildIds = childIds.filter(childId => {
      const child = tree.nodesById[childId];
      return child
        ? shouldRenderNode(tree, child, filter, attentionNodeIds, scope, scopeNow)
        : false;
    });
    const isExpanded = expandedNodeIds.has(nodeId);
    const hasChildren = visibleChildIds.length > 0;
    const isDimmed = isDimmedByDayScope(tree, node, scope, scopeNow);
    const scopeAttrs = {
      'data-day-bucket': getNodeDayBucket(tree, node, scopeNow),
      'data-completion-view': scope.completionScope,
    };

    if (node.type === 'entry') {
      return (
        <li
          key={nodeId}
          {...getTreeItemAttrs(node, depth, hasChildren, isExpanded)}
          {...scopeAttrs}
        >
          <div
            className={cn(
              'grid min-h-[72px] grid-cols-[minmax(300px,1.5fr)_minmax(150px,0.7fr)_minmax(170px,0.8fr)_minmax(160px,auto)] items-center gap-3 border-b bg-background/60 px-3 py-2 pl-16 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isDimmed && 'opacity-60'
            )}
            {...getRowActionOpenProps(node.id)}
          >
            <EntryIdentity node={node} onNavigate={onNavigate} />
            <StatusCell node={node} />
            <ProgressCell node={node} />
            <div className="flex justify-end">
              <ShowMapRowActionsMenu
                node={node}
                tree={tree}
                onNavigate={onNavigate}
                onAction={onAction}
                openSignal={actionMenuOpenSignals[node.id]}
              />
            </div>
          </div>
        </li>
      );
    }

    const primaryAction = getPrimaryActionForNode(node, { tree });

    const rowContent = (
      <>
        <div
          className="flex min-w-0 items-center gap-2"
          style={{ paddingLeft: node.type === 'more' ? 36 : 0 }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!hasChildren}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.label}`}
            className="h-10 w-10 shrink-0"
            onClick={() => onToggle(nodeId)}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : (
              <span className="h-4 w-4" />
            )}
          </Button>

          {node.href ? (
            <button
              type="button"
              onClick={() => onNavigate?.(node.href!)}
              className="min-w-0 cursor-pointer rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block truncate text-sm font-semibold">{node.label}</span>
              {node.subtitle && (
                <span className="block truncate text-xs text-muted-foreground">
                  {node.subtitle}
                </span>
              )}
            </button>
          ) : (
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold">{node.label}</span>
              {node.subtitle && (
                <span className="block truncate text-xs text-muted-foreground">
                  {node.subtitle}
                </span>
              )}
            </div>
          )}
        </div>

        <StatusCell node={node} />
        <ProgressCell node={node} />

        <div className="flex flex-wrap justify-end gap-2">
          {node.type === 'class' && primaryAction?.href && (
            <Button
              type="button"
              size="sm"
              variant={primaryAction.id === 'score-class' ? 'default' : 'outline'}
              onClick={() => onNavigate?.(primaryAction.href!)}
            >
              <primaryAction.icon className="h-4 w-4" />
              {primaryAction.label}
            </Button>
          )}
          <ShowMapRowActionsMenu
            node={node}
            tree={tree}
            onNavigate={onNavigate}
            onAction={onAction}
            openSignal={actionMenuOpenSignals[node.id]}
          />
        </div>
      </>
    );

    if (node.type === 'trial') {
      return (
        <li
          key={nodeId}
          {...getTreeItemAttrs(node, depth, hasChildren, isExpanded)}
          {...scopeAttrs}
          className="overflow-hidden rounded-md border bg-card"
        >
          <div
            className={cn(
              'grid min-h-16 grid-cols-[minmax(260px,1.5fr)_minmax(150px,0.7fr)_minmax(170px,0.8fr)_minmax(160px,auto)] items-center gap-3 border-b bg-muted/25 px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isDimmed && 'opacity-60'
            )}
            {...getRowActionOpenProps(node.id)}
          >
            {rowContent}
          </div>

          {isExpanded && hasChildren && (
            <ul role="group">{visibleChildIds.map(id => renderNode(id, depth + 1))}</ul>
          )}
        </li>
      );
    }

    return (
      <li key={nodeId} {...getTreeItemAttrs(node, depth, hasChildren, isExpanded)} {...scopeAttrs}>
        <div
          className={cn(
            'grid min-h-14 grid-cols-[minmax(260px,1.5fr)_minmax(150px,0.7fr)_minmax(170px,0.8fr)_minmax(160px,auto)] items-center gap-3 border-b px-3 py-2 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isDimmed && 'opacity-60'
          )}
          {...getRowActionOpenProps(node.id)}
        >
          {rowContent}
        </div>

        {isExpanded && hasChildren && (
          <ul role="group">{visibleChildIds.map(id => renderNode(id, depth + 1))}</ul>
        )}
      </li>
    );
  };

  return (
    <div className="overflow-x-auto">
      <ul role="tree" className="min-w-[900px] space-y-3">
        {(tree.childIdsByParentId[tree.root.id] ?? []).map(id => renderNode(id, 0))}
      </ul>
    </div>
  );
}
