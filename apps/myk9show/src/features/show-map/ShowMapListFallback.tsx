import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ShowMapTree } from './showMapTypes';

interface ShowMapListFallbackProps {
  tree: ShowMapTree;
  expandedNodeIds: Set<string>;
  onToggle: (nodeId: string) => void;
  onNavigate?: (href: string) => void;
}

export function ShowMapListFallback({
  tree,
  expandedNodeIds,
  onToggle,
  onNavigate,
}: ShowMapListFallbackProps) {
  const renderNode = (nodeId: string, depth: number): React.ReactNode => {
    const node = tree.nodesById[nodeId];
    if (!node) return null;
    const childIds = tree.childIdsByParentId[nodeId] ?? [];
    const isExpanded = expandedNodeIds.has(nodeId);

    return (
      <li key={nodeId}>
        <div
          className={cn(
            'flex min-h-12 items-center gap-2 border-b px-3 py-2',
            depth > 0 && 'bg-muted/20'
          )}
          style={{ paddingLeft: `${12 + depth * 24}px` }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={childIds.length === 0}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.label}`}
            className="h-10 w-10 shrink-0"
            onClick={() => onToggle(nodeId)}
          >
            {childIds.length > 0 ? (
              isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )
            ) : (
              <span className="h-4 w-4" />
            )}
          </Button>

          <button
            type="button"
            disabled={!node.href}
            onClick={() => node.href && onNavigate?.(node.href)}
            className="min-w-0 flex-1 text-left disabled:cursor-default"
          >
            <span className="block truncate text-sm font-medium">{node.label}</span>
            {node.subtitle && (
              <span className="block truncate text-xs text-muted-foreground">{node.subtitle}</span>
            )}
          </button>

          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {node.status && <Badge variant="secondary">{node.status.label}</Badge>}
            {node.checkInStatus && <Badge variant="outline">{node.checkInStatus.label}</Badge>}
            {node.progress && <Badge variant="outline">{node.progress.label}</Badge>}
            {!!node.attentionCount && (
              <Badge variant="outline">{node.attentionCount} need attention</Badge>
            )}
          </div>
        </div>
        {isExpanded && childIds.length > 0 && <ul>{childIds.map(id => renderNode(id, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className="rounded-md border bg-card">
      <ul>{renderNode(tree.root.id, 0)}</ul>
    </div>
  );
}
