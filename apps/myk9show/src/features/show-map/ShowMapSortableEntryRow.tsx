import { GripVertical, Lock } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { cn } from '@/lib/utils';
import type { ShowMapNode } from './showMapTypes';

interface ShowMapSortableEntryRowProps {
  node: ShowMapNode;
  depth: number;
  isPinned: boolean;
  isDimmed: boolean;
  attentionCount: number;
}

// INTENT: Reorder-mode entry row. Strips clickable links and action menus
// (suppression rule from the plan) so only the drag handle and identity are
// active. Pinned entries (already-scored / in-ring) render with a lock icon
// in place of the grip and `useSortable({disabled: true})` so dnd-kit
// ignores them. Layout mirrors the standard entry row to avoid visual jump
// when entering/exiting reorder mode.
export function ShowMapSortableEntryRow({
  node,
  depth,
  isPinned,
  isDimmed,
  attentionCount,
}: ShowMapSortableEntryRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
    disabled: isPinned,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const display = node.entryDisplay;

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      role="treeitem"
      aria-level={depth + 1}
      data-node-id={node.id}
      data-node-type={node.type}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        className={cn(
          'grid min-h-[72px] grid-cols-[minmax(300px,1.5fr)_minmax(150px,0.7fr)_minmax(170px,0.8fr)_minmax(160px,auto)] items-center gap-3 border-b bg-background/60 px-3 py-2 pl-4 hover:bg-muted/20',
          isDimmed && 'opacity-60',
          isDragging && 'ring-2 ring-primary'
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {isPinned ? (
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground"
              aria-label="Pinned (already scored or currently in ring)"
              title="Pinned (already scored or currently in ring)"
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
            </span>
          ) : (
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:text-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Drag to reorder ${display?.dogName ?? node.label}`}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {display ? (
            <div className="flex min-w-0 items-center gap-3">
              <ArmbandBadge armband={display.armband} className="size-12 rounded-[10px] text-base" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{display.dogName}</div>
                {display.breed && (
                  <div className="truncate text-sm text-muted-foreground">{display.breed}</div>
                )}
                {display.handler && (
                  <div className="truncate text-xs text-muted-foreground">{display.handler}</div>
                )}
              </div>
            </div>
          ) : (
            <span className="block truncate text-sm font-semibold">{node.label}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {node.status && <Badge variant="secondary">{node.status.label}</Badge>}
          {node.checkInStatus && <Badge variant="outline">{node.checkInStatus.label}</Badge>}
          {attentionCount > 0 && (
            <Badge variant="outline">{attentionCount} need attention</Badge>
          )}
          {!node.status && !node.checkInStatus && attentionCount === 0 && (
            <span className="text-sm text-muted-foreground">-</span>
          )}
        </div>
        <span className="text-sm text-muted-foreground">-</span>
        <span />
      </div>
    </li>
  );
}
