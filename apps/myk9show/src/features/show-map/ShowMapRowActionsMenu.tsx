import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getRankedActions, getRecommendedActions } from './showMapActions';
import type { ShowMapAction } from './showMapActions';
import {
  resolveShowMapActionExecution,
  type ExecutableShowMapActionExecution,
} from './showMapActionExecution';
import type { ShowMapNode, ShowMapTree } from './showMapTypes';

interface ShowMapRowActionsMenuProps {
  node: ShowMapNode;
  tree: ShowMapTree;
  onNavigate?: ((href: string) => void) | undefined;
  onAction?:
    | ((action: ShowMapAction, execution: ExecutableShowMapActionExecution) => void)
    | undefined;
  openSignal?: number | undefined;
  actionPhase?: 'today' | 'wrap-up' | undefined;
}

function ActionContent({
  action,
  subtext,
}: {
  action: ShowMapAction;
  subtext?: string | undefined;
}) {
  return (
    <>
      <action.icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{action.label}</span>
        {subtext && <span className="block text-xs text-muted-foreground">{subtext}</span>}
      </span>
    </>
  );
}

export function ShowMapRowActionsMenu({
  node,
  tree,
  onNavigate,
  onAction,
  openSignal,
  actionPhase,
}: ShowMapRowActionsMenuProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const [dismissedOpenSignal, setDismissedOpenSignal] = useState(0);
  const recommendedActions = getRecommendedActions(node, { tree, phase: actionPhase });
  const allActions = getRankedActions(node, { tree, phase: actionPhase });
  const signalOpen = Boolean(openSignal && openSignal !== dismissedOpenSignal);
  const isOpen = manualOpen || signalOpen;

  if (allActions.length === 0) return null;

  const handleOpenChange = (open: boolean) => {
    setManualOpen(open);
    if (!open) setDismissedOpenSignal(openSignal ?? 0);
  };
  const handleAction = (action: ShowMapAction) => {
    const execution = resolveShowMapActionExecution(action);
    if (execution.kind === 'disabled') return;
    if (execution.kind === 'navigate') {
      onNavigate?.(execution.href);
      return;
    }
    onAction?.(action, execution);
  };
  const getActionProps = (action: ShowMapAction, showWhy = false) => {
    const execution = resolveShowMapActionExecution(action);
    const isDisabled = execution.kind === 'disabled';
    const subtext = isDisabled ? execution.disabledReason : showWhy ? action.why : undefined;

    return {
      disabled: isDisabled,
      subtext,
      onClick: isDisabled ? undefined : () => handleAction(action),
    };
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild nativeButton>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${node.label}`}
          className="h-9 w-9 shrink-0"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {recommendedActions.length > 0 && (
          <>
            <div className="px-2 py-1.5 text-xs font-semibold uppercase text-muted-foreground">
              Recommended
            </div>
            {recommendedActions.map(action => {
              const actionProps = getActionProps(action, true);
              return (
                <DropdownMenuItem
                  key={`${action.id}:${action.nodeId}:recommended`}
                  disabled={actionProps.disabled}
                  className="items-start gap-3 py-2"
                  {...(actionProps.onClick ? { onClick: actionProps.onClick } : {})}
                >
                  <ActionContent action={action} subtext={actionProps.subtext} />
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
          </>
        )}
        {allActions.map(action => {
          const actionProps = getActionProps(action);
          return (
            <DropdownMenuItem
              key={`${action.id}:${action.nodeId}`}
              disabled={actionProps.disabled}
              className="items-start gap-3"
              {...(actionProps.onClick ? { onClick: actionProps.onClick } : {})}
            >
              <ActionContent action={action} subtext={actionProps.subtext} />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
