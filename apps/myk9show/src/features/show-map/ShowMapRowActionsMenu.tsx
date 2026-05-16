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
import type { ShowMapNode, ShowMapTree } from './showMapTypes';

interface ShowMapRowActionsMenuProps {
  node: ShowMapNode;
  tree: ShowMapTree;
  onNavigate?: ((href: string) => void) | undefined;
  openSignal?: number | undefined;
}

function ActionContent({ action, showWhy = false }: { action: ShowMapAction; showWhy?: boolean }) {
  return (
    <>
      <action.icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{action.label}</span>
        {showWhy && <span className="block text-xs text-muted-foreground">{action.why}</span>}
      </span>
    </>
  );
}

export function ShowMapRowActionsMenu({
  node,
  tree,
  onNavigate,
  openSignal,
}: ShowMapRowActionsMenuProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const [dismissedOpenSignal, setDismissedOpenSignal] = useState(0);
  const recommendedActions = getRecommendedActions(node, { tree });
  const allActions = getRankedActions(node, { tree });
  const signalOpen = Boolean(openSignal && openSignal !== dismissedOpenSignal);
  const isOpen = manualOpen || signalOpen;

  if (allActions.length === 0) return null;

  const handleOpenChange = (open: boolean) => {
    setManualOpen(open);
    if (!open) setDismissedOpenSignal(openSignal ?? 0);
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
            {recommendedActions.map(action => (
              <DropdownMenuItem
                key={`${action.id}:${action.nodeId}:recommended`}
                disabled={!action.href}
                className="items-start gap-3 py-2"
                {...(action.href ? { onClick: () => onNavigate?.(action.href!) } : {})}
              >
                <ActionContent action={action} showWhy />
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        {allActions.map(action => (
          <DropdownMenuItem
            key={`${action.id}:${action.nodeId}`}
            disabled={!action.href}
            className="gap-3"
            {...(action.href ? { onClick: () => onNavigate?.(action.href!) } : {})}
          >
            <ActionContent action={action} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
