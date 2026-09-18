/**
 * One labelled `Actions` trigger per show card (MYK9-631 AC2), replacing the
 * four-link row that used to spread Orders & receipts, Edit entry, Add to
 * calendar and View show across the header.
 *
 * The primitive is the one the secretary side already uses
 * (`features/show-map/ShowMapRowActionsMenu.tsx`): a `DropdownMenu` with a
 * ghost trigger. The trigger is LABELLED here rather than a bare `⋯` — the
 * exhibitor audience is not a power user in a table, and MYK9-631 Q5 decided
 * words over a glyph. Below `sm` the word is hidden and only the icon shows,
 * with the label kept for screen readers, so the header still fits a phone.
 *
 * Which items exist is `myShowActions.ts`'s job; this file only renders them.
 *
 * @module MyEntriesPage/modules/MyShowActionsMenu
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buildMyShowActions, type MyShowAction, type MyShowActionsFacts } from './myShowActions';

export interface MyShowActionsMenuProps extends MyShowActionsFacts {
  onOpenEdit: () => void;
  onOpenReceipts: () => void;
  onAddToCalendar: () => void;
}

export const MyShowActionsMenu: React.FC<MyShowActionsMenuProps> = ({
  onOpenEdit,
  onOpenReceipts,
  onAddToCalendar,
  ...facts
}) => {
  const actions = buildMyShowActions(facts);
  if (actions.length === 0) return null;

  const runAction = (action: MyShowAction) => {
    if (action.id === 'edit-entry') onOpenEdit();
    else if (action.id === 'receipts') onOpenReceipts();
    else if (action.id === 'add-to-calendar') onAddToCalendar();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild nativeButton>
        <Button
          type="button"
          variant="outline"
          aria-label={`Actions for ${facts.showName}`}
          className="min-h-[44px] shrink-0 gap-1.5"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          {/* Hidden below sm so a phone header keeps the icon alone; the
              trigger's aria-label carries the name either way. */}
          <span className="hidden sm:inline">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {actions.map(action =>
          action.href ? (
            <DropdownMenuItem key={action.id} asChild className="min-h-[44px] cursor-pointer">
              <Link to={action.href} {...(action.ariaLabel && { 'aria-label': action.ariaLabel })}>
                {action.label}
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={action.id}
              onClick={() => runAction(action)}
              className="min-h-[44px] cursor-pointer"
              {...(action.ariaLabel && { 'aria-label': action.ariaLabel })}
            >
              {action.label}
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
