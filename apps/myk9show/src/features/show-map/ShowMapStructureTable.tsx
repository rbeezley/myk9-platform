import { ChevronDown, ChevronRight, ClipboardCheck, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import type { ShowMapFilter, ShowMapNode, ShowMapTree } from './showMapTypes';

interface ShowMapStructureTableProps {
  tree: ShowMapTree;
  expandedNodeIds: Set<string>;
  filter: ShowMapFilter;
  onToggle: (nodeId: string) => void;
  onNavigate?: (href: string) => void;
}

function nodeMatchesFilter(node: ShowMapNode, filter: ShowMapFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'needs-attention') {
    return (node.attentionCount ?? 0) > 0 || node.status?.kind === 'attention';
  }
  if (filter === 'complete') return node.status?.kind === 'complete';
  return node.status?.kind === 'active';
}

function descendantsMatch(tree: ShowMapTree, nodeId: string, filter: ShowMapFilter): boolean {
  const childIds = tree.childIdsByParentId[nodeId] ?? [];
  return childIds.some(childId => {
    const child = tree.nodesById[childId];
    return !!child && (nodeMatchesFilter(child, filter) || descendantsMatch(tree, childId, filter));
  });
}

function shouldRenderNode(tree: ShowMapTree, node: ShowMapNode, filter: ShowMapFilter): boolean {
  return (
    filter === 'all' ||
    node.type === 'show' ||
    nodeMatchesFilter(node, filter) ||
    descendantsMatch(tree, node.id, filter)
  );
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

function scoreLabel(node: ShowMapNode): string {
  if (node.type === 'entry') return 'Score entry';
  if (node.type === 'class') return 'Score class';
  return 'Score';
}

export function ShowMapStructureTable({
  tree,
  expandedNodeIds,
  filter,
  onToggle,
  onNavigate,
}: ShowMapStructureTableProps) {
  const renderNode = (nodeId: string, depth: number): ReactNode => {
    const node = tree.nodesById[nodeId];
    if (!node || !shouldRenderNode(tree, node, filter)) return null;

    const childIds = tree.childIdsByParentId[nodeId] ?? [];
    const visibleChildIds = childIds.filter(childId => {
      const child = tree.nodesById[childId];
      return child ? shouldRenderNode(tree, child, filter) : false;
    });
    const isExpanded = expandedNodeIds.has(nodeId);
    const hasChildren = visibleChildIds.length > 0;

    return (
      <li key={nodeId}>
        <div
          className={cn(
            'grid min-h-14 grid-cols-[minmax(260px,1.5fr)_minmax(160px,0.8fr)_minmax(180px,0.9fr)_minmax(160px,auto)] items-center gap-3 border-b px-3 py-2',
            depth > 0 && 'bg-muted/20',
            node.type === 'entry' && 'bg-background'
          )}
        >
          <div
            className="flex min-w-0 items-center gap-2"
            style={{ paddingLeft: `${depth * 22}px` }}
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
            {node.href && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onNavigate?.(node.href!)}
              >
                <ExternalLink className="h-4 w-4" />
                Open
              </Button>
            )}
            {node.scoreHref && (
              <Button type="button" size="sm" onClick={() => onNavigate?.(node.scoreHref!)}>
                <ClipboardCheck className="h-4 w-4" />
                {scoreLabel(node)}
              </Button>
            )}
          </div>
        </div>

        {isExpanded && hasChildren && (
          <ul>{visibleChildIds.map(id => renderNode(id, depth + 1))}</ul>
        )}
      </li>
    );
  };

  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <div className="grid min-w-[900px] grid-cols-[minmax(260px,1.5fr)_minmax(160px,0.8fr)_minmax(180px,0.9fr)_minmax(160px,auto)] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <div>Structure</div>
        <div>Status</div>
        <div>Progress</div>
        <div className="text-right">Actions</div>
      </div>
      <ul className="min-w-[900px]">{renderNode(tree.root.id, 0)}</ul>
    </div>
  );
}
