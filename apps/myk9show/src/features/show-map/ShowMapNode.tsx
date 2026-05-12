import { memo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { ShowMapNodeData, ShowMapStatusKind } from './showMapTypes';

const BADGE_CLASSES: Record<ShowMapStatusKind, string> = {
  neutral: 'bg-slate-100 text-slate-800 border-slate-200',
  active: 'bg-blue-100 text-blue-800 border-blue-200',
  complete: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  muted: 'bg-muted text-muted-foreground border-border',
  attention: 'bg-amber-100 text-amber-900 border-amber-200',
};

function StatusBadge({
  label,
  kind,
}: {
  label: string;
  kind: ShowMapStatusKind;
}) {
  return (
    <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px]', BADGE_CLASSES[kind])}>
      {label}
    </Badge>
  );
}

function ShowMapNodeComponent({ data }: NodeProps) {
  const nodeData = data as unknown as ShowMapNodeData;
  const { node, isExpanded, hasChildren, isFilteredOut, onToggle, onNavigate } = nodeData;
  const progressValue = node.progress
    ? Math.round((node.progress.completed / node.progress.total) * 100)
    : undefined;

  return (
    <div
      className={cn(
        'w-[244px] rounded-md border bg-card p-3 text-card-foreground shadow-sm',
        'focus-within:ring-2 focus-within:ring-ring',
        node.type === 'show' && 'border-primary/40 bg-primary/5',
        isFilteredOut && 'opacity-55'
      )}
    >
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <div className="flex items-start gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!hasChildren}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.label}`}
          className="h-9 w-9 shrink-0"
          onClick={() => onToggle(node.id)}
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

        <button
          type="button"
          disabled={!node.href}
          onClick={() => node.href && onNavigate?.(node.href)}
          title={node.href ? undefined : 'No detail page available'}
          className={cn(
            'min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none',
            'focus-visible:ring-2 focus-visible:ring-ring',
            node.href ? 'cursor-pointer' : 'cursor-default'
          )}
        >
          <span className="block truncate text-sm font-semibold leading-5">{node.label}</span>
          {node.subtitle && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {node.subtitle}
            </span>
          )}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-11">
        {node.status && <StatusBadge label={node.status.label} kind={node.status.kind} />}
        {node.checkInStatus && (
          <StatusBadge label={node.checkInStatus.label} kind={node.checkInStatus.kind} />
        )}
        {node.count !== undefined && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {node.count} {node.type === 'show' ? 'trials' : node.type === 'trial' ? 'classes' : 'entries'}
          </Badge>
        )}
        {!!node.attentionCount && (
          <StatusBadge label={`${node.attentionCount} need attention`} kind="attention" />
        )}
      </div>

      {node.progress && progressValue !== undefined && (
        <div className="mt-3 pl-11">
          <div className="mb-1 text-xs text-muted-foreground">{node.progress.label}</div>
          <Progress value={progressValue} className="h-1.5" />
        </div>
      )}
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
}

export const ShowMapNode = memo(ShowMapNodeComponent);
