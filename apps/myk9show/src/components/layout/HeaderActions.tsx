import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useCurrentActions } from '@/features/actions/useCurrentActions';

/**
 * The one Actions menu, in the app header left of the notifications bell, the
 * same spot on every page and at 375px (Richard, 2026-09-17: "one place to
 * go... always visible").
 *
 * It renders whatever `useCurrentActions` resolves for the current route, so
 * every page's action list is registry data rather than page-owned chrome. An
 * empty list HIDES the button -- a permanently disabled control would be a
 * promise the app cannot keep.
 */
export function HeaderActions() {
  const { actions } = useCurrentActions();

  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="gap-1 px-2 min-[400px]:px-3"
          data-testid="header-actions-trigger"
        >
          Actions
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {actions.map(action => (
          <Fragment key={action.id}>
            {action.separatorBefore && <DropdownMenuSeparator />}
            {action.disabledReason ? (
              <DropdownMenuItem
                disabled
                data-testid={`header-action-${action.id}`}
                title={action.disabledReason}
                className="flex-col items-start gap-0"
              >
                <span>{action.label}</span>
                <span className="text-xs text-muted-foreground">{action.disabledReason}</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                asChild
                className={cn(action.destructive && 'text-destructive focus:text-destructive')}
              >
                <Link to={action.href} data-testid={`header-action-${action.id}`}>
                  {action.label}
                </Link>
              </DropdownMenuItem>
            )}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
