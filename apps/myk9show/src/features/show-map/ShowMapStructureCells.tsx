import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { JudgePresenceDot } from '@/features/show-presence/JudgePresenceDot';
import { judgesOnClass } from '@/features/show-presence/presenceSelectors';
import type { ShowPresence } from '@/features/show-presence/types';
import { resolveShowMapActionExecution } from './showMapActionExecution';
import type { ExecutableShowMapActionExecution } from './showMapActionExecution';
import type { ShowMapAction } from './showMapActions';
import type { ShowMapNode } from './showMapTypes';

export function ProgressCell({ node }: { node: ShowMapNode }) {
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
export function ClassPrimaryActionButton({
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

export function StatusCell({
  node,
  attentionCount,
  present,
}: {
  node: ShowMapNode;
  attentionCount: number;
  present: ShowPresence[];
}) {
  const classId = node.type === 'class' ? node.id.slice(node.type.length + 1) : null;
  const hasJudge = classId ? judgesOnClass(present, classId).length > 0 : false;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {classId && <JudgePresenceDot present={present} classId={classId} />}
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
      {!node.status &&
        !node.wrapUpStatus &&
        !node.checkInStatus &&
        attentionCount === 0 &&
        !hasJudge && <span className="text-sm text-muted-foreground">-</span>}
    </div>
  );
}

export function EntryIdentity({
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

export function DogEntryIdentity({ node }: { node: ShowMapNode }) {
  const display = node.dogEntryDisplay;
  if (!display) {
    return <span className="block truncate text-sm font-semibold">{node.label}</span>;
  }

  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-semibold">{display.classLabel}</div>
      {node.subtitle && (
        <div className="truncate text-xs text-muted-foreground">{node.subtitle}</div>
      )}
    </div>
  );
}
