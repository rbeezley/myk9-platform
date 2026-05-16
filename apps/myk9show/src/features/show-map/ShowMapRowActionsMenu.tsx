import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getRankedActions, getRecommendedActions } from './showMapActions';
import type { ShowMapAction } from './showMapActions';
import type { ShowMapNode, ShowMapTree } from './showMapTypes';

interface ShowMapRowActionsMenuProps {
  node: ShowMapNode;
  tree: ShowMapTree;
  onNavigate?: ((href: string) => void) | undefined;
  openSignal?: number | undefined;
}

function ActionButton({
  action,
  onNavigate,
  showWhy = false,
}: {
  action: ShowMapAction;
  onNavigate?: ((href: string) => void) | undefined;
  showWhy?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={!action.href}
      onClick={() => {
        if (action.href) onNavigate?.(action.href);
      }}
      className="flex w-full items-start gap-3 rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      <action.icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <span className="block font-medium">{action.label}</span>
        {showWhy && <span className="block text-xs text-muted-foreground">{action.why}</span>}
      </span>
    </button>
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

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Actions for ${node.label}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="h-9 w-9 shrink-0"
        onClick={() => {
          if (isOpen) {
            setManualOpen(false);
            setDismissedOpenSignal(openSignal ?? 0);
            return;
          }
          setManualOpen(true);
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-64 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {recommendedActions.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold uppercase text-muted-foreground">
                Recommended
              </div>
              {recommendedActions.map(action => (
                <ActionButton
                  key={`${action.id}:${action.nodeId}:recommended`}
                  action={action}
                  onNavigate={onNavigate}
                  showWhy
                />
              ))}
              <div className="-mx-1 my-1 h-px bg-muted" />
            </>
          )}
          {allActions.map(action => (
            <ActionButton
              key={`${action.id}:${action.nodeId}`}
              action={action}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
