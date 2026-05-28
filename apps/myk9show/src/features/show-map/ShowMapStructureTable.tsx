import { ChevronDown, ChevronRight, FilterX } from 'lucide-react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { cn } from '@/lib/utils';
import { getAttentionNodeIds, getPrimaryActionForNode } from './showMapActions';
import { resolveShowMapActionExecution } from './showMapActionExecution';
import { ShowMapRowActionsMenu } from './ShowMapRowActionsMenu';
import { ShowMapRunOrderMenu } from './ShowMapRunOrderMenu';
import { ShowMapSortableEntryRow } from './ShowMapSortableEntryRow';
import { DEFAULT_SHOW_MAP_SCOPE } from './showMapTimeScope';
import type { ShowMapAutoSortKind } from './showMapRunOrderAutoSort';
import { isShowMapEntryPinnedForReorder } from './showMapReorderMode';
import type { ShowMapReorderModeControls } from './useShowMapReorderMode';
import {
  getFirstVisibleKeyboardChildNodeId,
  getParentKeyboardNodeId,
  getShowMapNodeScopeAttrs,
  getVisibleKeyboardNodeIds,
  shouldRenderShowMapNode,
  supportsTreeKeyboardActions,
} from './showMapTreeNavigation';
import {
  useMemo,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
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
  // When false, the tree is browse-only: no row menus, primary action buttons,
  // Enter/Space activation, or context-menu actions.
  enableRowActions?: boolean | undefined;
  scope?: ShowMapScopeState | undefined;
  scopeNow?: Date | undefined;
  attentionCountsByNodeId?: ReadonlyMap<string, number> | undefined;
  onResetFilters?: (() => void) | undefined;
  // Class-row Run Order menu controls. When omitted, the menu is not
  // rendered (read-only / browse-only contexts like the public map).
  runOrderControls?:
    | {
        onAutoSort: (input: {
          classId: string;
          kind: ShowMapAutoSortKind;
          classLabel: string;
        }) => void;
        isAutoSorting: boolean;
        onEnterReorderMode?:
          | ((input: { classId: string; classLabel: string }) => void)
          | undefined;
      }
    | undefined;
  // When set, the active class is in drag-and-drop reorder mode. The tree
  // wraps that class's entries in a SortableContext, swaps in the sortable
  // entry row, and globally suppresses other interactive surfaces (row
  // menus, primary buttons, navigation) until reorder mode exits.
  reorderMode?: ShowMapReorderModeControls | undefined;
}

const INTERACTIVE_ROW_TARGET_SELECTOR =
  'a,button,input,textarea,select,[role="button"],[role="menuitem"]';

function isInteractiveRowTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest(INTERACTIVE_ROW_TARGET_SELECTOR));
}

function isKeyboardEventForCurrentTreeItem(event: KeyboardEvent<HTMLLIElement>): boolean {
  return (
    event.target instanceof HTMLElement &&
    event.target.closest('[role="treeitem"]') === event.currentTarget
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

function focusTreeItemByNodeId(nodeId: string, root: ParentNode): void {
  const treeItem = Array.from(root.querySelectorAll<HTMLElement>('[role="treeitem"]')).find(
    element => element.dataset.nodeId === nodeId
  );
  treeItem?.focus();
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

// INTENT: Pattern 3 — class-row primary action mirrors the class lifecycle.
// Neutral → Mark Started (mutation, default style). Active → Score Class · N%
// (navigate, accent style; the % decoration is purely visual — the action
// itself stays a clean "what" identifier). Complete → Open Class (navigate,
// outline style). Mutation actions render inline (no href guard) so the next
// operational step is always one click away, never buried in the row menu.
function ClassPrimaryActionButton({
  action,
  progressPercent,
  onNavigate,
  onAction,
}: {
  action: ShowMapAction;
  progressPercent: number | undefined;
  onNavigate: ((href: string) => void) | undefined;
  onAction:
    | ((action: ShowMapAction, execution: ExecutableShowMapActionExecution) => void)
    | undefined;
}) {
  const execution = resolveShowMapActionExecution(action);
  if (execution.kind === 'disabled') return null;

  const variant = action.id === 'score-class' ? 'default' : 'outline';
  const label =
    action.id === 'score-class' && typeof progressPercent === 'number'
      ? `${action.label} · ${progressPercent}%`
      : action.label;

  const onClick = () => {
    if (execution.kind === 'navigate') onNavigate?.(execution.href);
    else onAction?.(action, execution);
  };

  return (
    <Button type="button" size="sm" variant={variant} onClick={onClick}>
      <action.icon className="h-4 w-4" />
      {label}
    </Button>
  );
}

function StatusCell({ node, attentionCount }: { node: ShowMapNode; attentionCount: number }) {
  return (
    <div className="flex flex-wrap gap-1">
      {node.status && <Badge variant="secondary">{node.status.label}</Badge>}
      {node.wrapUpStatus && (
        <Badge variant={node.wrapUpStatus.kind === 'attention' ? 'destructive' : 'outline'}>
          {node.wrapUpStatus.label}
        </Badge>
      )}
      {node.checkInStatus && <Badge variant="outline">{node.checkInStatus.label}</Badge>}
      {attentionCount > 0 && (
        <Badge variant="outline">{attentionCount} need attention</Badge>
      )}
      {!node.status && !node.wrapUpStatus && !node.checkInStatus && attentionCount === 0 && (
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
  // INTENT: When onNavigate is undefined the row is non-navigable (e.g.
  // tree-wide reorder mode is active). Render identity fields as plain
  // text instead of buttons so the secretary can't context-switch into
  // a detail page while a reorder save is pending.
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
        {display.dogHref && onNavigate ? (
          <button
            type="button"
            onClick={() => onNavigate(display.dogHref!)}
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
        {display.handler && display.handlerHref && onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate(display.handlerHref!)}
            className="block max-w-full truncate rounded-sm text-left text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {display.handler}
          </button>
        )}
        {display.handler && (!display.handlerHref || !onNavigate) && (
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
  enableRowActions: enableRowActionsProp = true,
  scope = DEFAULT_SHOW_MAP_SCOPE,
  scopeNow = new Date(),
  attentionCountsByNodeId,
  onResetFilters,
  runOrderControls,
  reorderMode,
}: ShowMapStructureTableProps) {
  // INTENT: While drag-and-drop reorder is active, the tree becomes modal:
  // row menus, primary buttons, navigation links, and Enter/Space keyboard
  // shortcuts are suppressed everywhere — the user is committed to one task
  // (reorder this class) until they hit Escape or Done. Tree expand/collapse
  // stays available so they can browse around.
  const isAnyReorderActive = reorderMode?.isReordering ?? false;
  const enableRowActions = enableRowActionsProp && !isAnyReorderActive;
  const activeReorderClassNodeId = reorderMode?.active
    ? `class:${reorderMode.active.classId}`
    : undefined;
  const [actionMenuOpenSignals, setActionMenuOpenSignals] = useState<Record<string, number>>({});
  const [focusedNodeId, setFocusedNodeId] = useState<string | undefined>();
  const attentionNodeIds = useMemo(
    () => getAttentionNodeIds(tree, { now: scopeNow }),
    [scopeNow, tree]
  );
  const visibleKeyboardNodeIds = useMemo(
    () =>
      getVisibleKeyboardNodeIds({
        tree,
        expandedNodeIds,
        filter,
        attentionNodeIds,
        scope,
        scopeNow,
      }),
    [attentionNodeIds, expandedNodeIds, filter, scope, scopeNow, tree]
  );
  const activeFocusedNodeId =
    focusedNodeId && visibleKeyboardNodeIds.includes(focusedNodeId)
      ? focusedNodeId
      : visibleKeyboardNodeIds[0];
  const openActionsForNode = (nodeId: string) => {
    if (!enableRowActions) return;
    setActionMenuOpenSignals(current => ({
      ...current,
      [nodeId]: (current[nodeId] ?? 0) + 1,
    }));
  };
  const moveFocusToNode = (nodeId: string | undefined, focusRoot: ParentNode) => {
    if (!nodeId) return;
    focusTreeItemByNodeId(nodeId, focusRoot);
  };
  const moveFocusByOffset = (nodeId: string, offset: number, focusRoot: ParentNode) => {
    const currentIndex = visibleKeyboardNodeIds.indexOf(nodeId);
    if (currentIndex === -1) return;
    const nextIndex = Math.min(
      Math.max(currentIndex + offset, 0),
      visibleKeyboardNodeIds.length - 1
    );
    moveFocusToNode(visibleKeyboardNodeIds[nextIndex], focusRoot);
  };
  const getRowActionOpenProps = (nodeId: string) => ({
    'data-row-action-surface': nodeId,
    onContextMenu: (event: MouseEvent<HTMLDivElement>) => {
      if (!enableRowActions) {
        return;
      }
      if (isInteractiveRowTarget(event.target)) {
        return;
      }
      event.preventDefault();
      openActionsForNode(nodeId);
    },
  });
  const getTreeItemKeyboardProps = (
    node: ShowMapNode,
    hasChildren: boolean,
    isExpanded: boolean
  ) =>
    supportsTreeKeyboardActions(node)
      ? {
          tabIndex: node.id === activeFocusedNodeId ? 0 : -1,
          // INTENT: The tree owns one roving tab stop. Arrow keys move between rows;
          // Enter/Space open row actions without turning the row into a fake button.
          onFocus: (event: FocusEvent<HTMLLIElement>) => {
            if (event.target === event.currentTarget) {
              setFocusedNodeId(node.id);
            }
          },
          onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => {
            if (!isKeyboardEventForCurrentTreeItem(event) || isInteractiveRowTarget(event.target)) {
              return;
            }
            const focusRoot = event.currentTarget.closest('[role="tree"]') ?? document;

            if (enableRowActions && (event.key === 'Enter' || event.key === ' ')) {
              if (event.repeat) return;
              event.preventDefault();
              event.stopPropagation();
              openActionsForNode(node.id);
              return;
            }

            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              event.stopPropagation();
              moveFocusByOffset(node.id, event.key === 'ArrowDown' ? 1 : -1, focusRoot);
              return;
            }

            if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault();
              event.stopPropagation();
              moveFocusToNode(
                event.key === 'Home'
                  ? visibleKeyboardNodeIds[0]
                  : visibleKeyboardNodeIds[visibleKeyboardNodeIds.length - 1],
                focusRoot
              );
              return;
            }

            if (event.key === 'ArrowRight') {
              event.preventDefault();
              event.stopPropagation();
              if (hasChildren && !isExpanded) {
                onToggle(node.id);
                return;
              }
              moveFocusToNode(
                getFirstVisibleKeyboardChildNodeId(tree, visibleKeyboardNodeIds, node.id),
                focusRoot
              );
              return;
            }

            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              event.stopPropagation();
              if (hasChildren && isExpanded) {
                onToggle(node.id);
                return;
              }
              moveFocusToNode(
                getParentKeyboardNodeId(tree, visibleKeyboardNodeIds, node),
                focusRoot
              );
            }
          },
        }
      : {};

  const renderNode = (nodeId: string, depth: number): ReactNode => {
    const node = tree.nodesById[nodeId];
    if (!node || !shouldRenderShowMapNode(tree, node, filter, attentionNodeIds, scope, scopeNow)) {
      return null;
    }

    const childIds = tree.childIdsByParentId[nodeId] ?? [];
    const visibleChildIds = childIds.filter(childId => {
      const child = tree.nodesById[childId];
      return child
        ? shouldRenderShowMapNode(tree, child, filter, attentionNodeIds, scope, scopeNow)
        : false;
    });
    const isExpanded = expandedNodeIds.has(nodeId);
    const hasChildren = visibleChildIds.length > 0;
    const { isDimmed, ...scopeAttrs } = getShowMapNodeScopeAttrs(tree, node, scope, scopeNow);

    if (node.type === 'entry') {
      const isReorderEntry =
        activeReorderClassNodeId !== undefined && node.parentId === activeReorderClassNodeId;
      if (isReorderEntry) {
        return (
          <ShowMapSortableEntryRow
            key={nodeId}
            node={node}
            depth={depth}
            isPinned={isShowMapEntryPinnedForReorder(node)}
            isDimmed={isDimmed}
            attentionCount={
              attentionCountsByNodeId?.get(node.id) ?? node.attentionCount ?? 0
            }
            isPersisting={reorderMode?.isPersisting ?? false}
            onKeyboardReorder={
              reorderMode?.onKeyboardReorder
                ? direction => reorderMode.onKeyboardReorder?.(node.id, direction)
                : undefined
            }
          />
        );
      }
      return (
        <li
          key={nodeId}
          {...getTreeItemAttrs(node, depth, hasChildren, isExpanded)}
          {...getTreeItemKeyboardProps(node, hasChildren, isExpanded)}
          {...scopeAttrs}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div
            className={cn(
              'grid min-h-[72px] grid-cols-[minmax(300px,1.5fr)_minmax(150px,0.7fr)_minmax(170px,0.8fr)_minmax(160px,auto)] items-center gap-3 border-b bg-background/60 px-3 py-2 pl-16 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isDimmed && 'opacity-60'
            )}
            {...getRowActionOpenProps(node.id)}
          >
            <EntryIdentity
              node={node}
              onNavigate={isAnyReorderActive ? undefined : onNavigate}
            />
            <StatusCell
              node={node}
              attentionCount={attentionCountsByNodeId?.get(node.id) ?? node.attentionCount ?? 0}
            />
            <ProgressCell node={node} />
            <div className="flex justify-end">
              {enableRowActions && (
                <ShowMapRowActionsMenu
                  node={node}
                  tree={tree}
                  scopeNow={scopeNow}
                  onNavigate={onNavigate}
                  onAction={onAction}
                  openSignal={actionMenuOpenSignals[node.id]}
                />
              )}
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

          {/* INTENT: While drag-and-drop reorder mode is active the tree is
              modal — let the label render as static text instead of a
              navigation button so the secretary can't context-switch
              mid-save and lose the reorder banner. */}
          {node.href && !isAnyReorderActive ? (
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

        <StatusCell
          node={node}
          attentionCount={attentionCountsByNodeId?.get(node.id) ?? node.attentionCount ?? 0}
        />
        <ProgressCell node={node} />

        <div className="flex flex-wrap justify-end gap-2">
          {enableRowActions && node.type === 'class' && primaryAction && (
            <ClassPrimaryActionButton
              action={primaryAction}
              progressPercent={
                node.progress && node.progress.total > 0
                  ? Math.round((node.progress.completed / node.progress.total) * 100)
                  : undefined
              }
              onNavigate={onNavigate}
              onAction={onAction}
            />
          )}
          {enableRowActions && node.type === 'class' && runOrderControls && (() => {
            // INTENT: When the entry preview is truncated (synthetic 'more'
            // child present), manual drag-and-drop reorder is disabled —
            // dragging would silently shuffle entries that aren't on
            // screen. Auto-sort still works because it always reads the
            // full live entry list from the replicated table.
            const classChildren = tree.childIdsByParentId[node.id] ?? [];
            const isTruncated = classChildren.some(
              childId => tree.nodesById[childId]?.type === 'more'
            );
            const enterReorderProp =
              isTruncated ? undefined : runOrderControls.onEnterReorderMode;
            return (
              <ShowMapRunOrderMenu
                classId={node.id.replace(/^class:/, '')}
                classLabel={node.label}
                entryCount={node.childrenCount}
                onAutoSort={runOrderControls.onAutoSort}
                isAutoSorting={runOrderControls.isAutoSorting}
                {...(enterReorderProp !== undefined
                  ? { onEnterReorderMode: enterReorderProp }
                  : {})}
                isReordering={isAnyReorderActive}
              />
            );
          })()}
          {enableRowActions && (
            <ShowMapRowActionsMenu
              node={node}
              tree={tree}
              scopeNow={scopeNow}
              onNavigate={onNavigate}
              onAction={onAction}
              openSignal={actionMenuOpenSignals[node.id]}
            />
          )}
        </div>
      </>
    );

    if (node.type === 'trial') {
      return (
        <li
          key={nodeId}
          {...getTreeItemAttrs(node, depth, hasChildren, isExpanded)}
          {...getTreeItemKeyboardProps(node, hasChildren, isExpanded)}
          {...scopeAttrs}
          className="overflow-hidden rounded-md border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

    const isReorderingThisClass =
      node.type === 'class' && reorderMode?.active?.classId === node.id.replace(/^class:/, '');
    // INTENT: Apply the hook's optimistic order overlay (if present for
    // this class) so the SortableContext items + the rendered child list
    // commit to the new positions in the same frame as the drop. Falls
    // back to the tree's natural order once the persist settles and the
    // overlay clears.
    const reorderedChildIds = (() => {
      if (!isReorderingThisClass || !reorderMode) return visibleChildIds;
      const classId = node.id.replace(/^class:/, '');
      const optimistic = reorderMode.getOptimisticOrder?.(classId);
      if (!optimistic) return visibleChildIds;
      const visibleSet = new Set(visibleChildIds);
      // Take the optimistic order, but constrain to currently visible
      // ids (filter may have changed). Append any not-yet-overlayed
      // visible ids at the end so a new arrival doesn't disappear.
      const ordered = optimistic.filter(id => visibleSet.has(id));
      const remainder = visibleChildIds.filter(id => !ordered.includes(id));
      return [...ordered, ...remainder];
    })();
    const childList = isExpanded && hasChildren ? (
      <ul role="group">{reorderedChildIds.map(id => renderNode(id, depth + 1))}</ul>
    ) : null;
    const wrappedChildList =
      isReorderingThisClass && childList && reorderMode ? (
        <DndContext
          sensors={reorderMode.sensors}
          collisionDetection={closestCenter}
          onDragEnd={reorderMode.buildOnDragEnd(reorderedChildIds)}
        >
          <SortableContext items={reorderedChildIds} strategy={verticalListSortingStrategy}>
            {childList}
          </SortableContext>
        </DndContext>
      ) : (
        childList
      );

    return (
      <li
        key={nodeId}
        {...getTreeItemAttrs(node, depth, hasChildren, isExpanded)}
        {...getTreeItemKeyboardProps(node, hasChildren, isExpanded)}
        {...scopeAttrs}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div
          className={cn(
            'grid min-h-14 grid-cols-[minmax(260px,1.5fr)_minmax(150px,0.7fr)_minmax(170px,0.8fr)_minmax(160px,auto)] items-center gap-3 border-b px-3 py-2 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isDimmed && 'opacity-60',
            isReorderingThisClass && 'border-primary/30 bg-primary/5'
          )}
          {...getRowActionOpenProps(node.id)}
        >
          {rowContent}
        </div>

        {wrappedChildList}
      </li>
    );
  };

  const topLevelChildIds = tree.childIdsByParentId[tree.root.id] ?? [];
  const showFilteredEmptyState = useMemo(() => {
    if (topLevelChildIds.length === 0) return false;
    return !topLevelChildIds.some(childId => {
      const child = tree.nodesById[childId];
      return child
        ? shouldRenderShowMapNode(tree, child, filter, attentionNodeIds, scope, scopeNow)
        : false;
    });
  }, [topLevelChildIds, tree, filter, attentionNodeIds, scope, scopeNow]);

  if (showFilteredEmptyState) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-md border bg-card px-6 py-10 text-center"
        role="status"
      >
        <FilterX className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <div>
          <h3 className="text-base font-semibold">Nothing matches your current filters.</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different view, or reset to defaults.
          </p>
        </div>
        {onResetFilters && (
          <Button type="button" variant="outline" size="sm" onClick={onResetFilters}>
            Reset filters
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <ul role="tree" className="min-w-[900px] space-y-3">
        {topLevelChildIds.map(id => renderNode(id, 0))}
      </ul>
    </div>
  );
}
