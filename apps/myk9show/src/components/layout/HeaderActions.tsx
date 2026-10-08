import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useCurrentActions } from '@/features/actions/useCurrentActions';
import { ACTION_ICONS } from '@/features/actions/actionIcons';
import type { AppAction } from '@/features/actions/actionRegistry';
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
 * The list renders as labelled sections in a fixed order -- this object, the show it sits
 * in, the lists on screen, Create -- each item with its icon (CRUD standard decision 6), so
 * the viewer can tell what an item applies to.
 *
 * Below `sm` the trigger is ICON-ONLY with a screen-reader label. The labelled
 * button cost the brand wordmark 45px it does not have at 360-414px, so signed
 * in with actions the wordmark rendered as "myK9S..." on every phone
 * (`src/test/e2e/header-wordmark-fits.spec.ts` measures it). The label returns
 * from `sm` up, where the room exists.
 */
export function HeaderActions() {
  const { groups } = useCurrentActions();
  // Fail narrow: without matchMedia we render the icon, which always fits.
  const showsLabel = useMediaQuery(LABEL_BREAKPOINT_QUERY, false);

  if (groups.length === 0) return null;

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
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {groups.map((group, index) => (
          <Fragment key={group.id}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup data-testid={`header-action-group-${group.id}`}>
              <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                {group.heading}
              </DropdownMenuLabel>
              {group.actions.map(action => (
                <ActionItem key={action.id} action={action} />
              ))}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One menu row: its icon, then its label; a greyed row also carries its reason. */
function ActionItem({ action }: { action: AppAction }) {
  const Icon = ACTION_ICONS[action.icon];
  const icon = <Icon className="text-muted-foreground" aria-hidden="true" />;
  const tone = cn(action.destructive && 'text-destructive focus:text-destructive');
  const testId = `header-action-${action.id}`;

  if (action.disabledReason) {
    return (
      <DropdownMenuItem disabled data-testid={testId} title={action.disabledReason}>
        {icon}
        <span className="flex flex-col">
          <span>{action.label}</span>
          <span className="text-xs text-muted-foreground">{action.disabledReason}</span>
        </span>
      </DropdownMenuItem>
    );
  }
  if (action.href !== undefined) {
    return (
      <DropdownMenuItem asChild className={tone}>
        <Link to={action.href} data-testid={testId}>
          {icon}
          {action.label}
        </Link>
      </DropdownMenuItem>
    );
  }
  // A side effect, not a destination. `useCurrentActions` bound the callback; a registry item
  // with neither `href` nor `run` is a bug, so it renders nothing rather than a dead row.
  if (!action.run) return null;
  return (
    <DropdownMenuItem onClick={action.run} data-testid={testId} className={tone}>
      {icon}
      {action.label}
    </DropdownMenuItem>
  );
}
