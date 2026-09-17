import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Zap } from 'lucide-react';
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
import { useMediaQuery } from '@/hooks/useMediaQuery';

const LABEL_BREAKPOINT_QUERY = '(min-width: 640px)';

/**
 * The one Actions menu, in the app header left of the notifications bell, the
 * same spot on every page and at 375px (Richard, 2026-09-17: "one place to
 * go... always visible").
 *
 * It renders whatever `useCurrentActions` resolves for the current route, so
 * every page's action list is registry data rather than page-owned chrome. An
 * empty list HIDES the button -- a permanently disabled control would be a
 * promise the app cannot keep.
 *
 * Below `sm` the trigger is ICON-ONLY with a screen-reader label. The labelled
 * button cost the brand wordmark 45px it does not have at 360-414px, so signed
 * in with actions the wordmark rendered as "myK9S..." on every phone
 * (`src/test/e2e/header-wordmark-fits.spec.ts` measures it). The label returns
 * from `sm` up, where the room exists.
 */
export function HeaderActions() {
  const { actions } = useCurrentActions();
  // Fail narrow: without matchMedia we render the icon, which always fits.
  const showsLabel = useMediaQuery(LABEL_BREAKPOINT_QUERY, false);

  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="touch"
          className={cn('gap-1', showsLabel ? 'px-3' : 'min-w-11 justify-center px-2')}
          data-testid="header-actions-trigger"
        >
          {showsLabel ? (
            <>
              <span>Actions</span>
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </>
          ) : (
            <>
              <span className="sr-only">Actions</span>
              <Zap className="h-4 w-4" aria-hidden="true" />
            </>
          )}
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
