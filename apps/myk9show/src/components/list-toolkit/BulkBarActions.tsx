/**
 * Turns a list of `RowAction`s (from `toBulkActions`) into named bulk-bar buttons
 * (MYK9-929, M10). Non-destructive actions share one named menu button ("Change status ▾");
 * a destructive action gets its own button, last ("Delete"), with the action's full wording
 * ("Delete 2 of 3 selected") as its tooltip. Nothing hides behind a bare ⋮.
 */

import { Trash2 } from 'lucide-react';
import { RowActionMenu, type RowAction } from '@/components/ui/RowActionMenu';
import { BulkBarButton } from './FloatingBulkBar';

interface BulkBarActionsProps {
  actions: RowAction[];
  /** The menu button's name, e.g. "Change status". */
  menuLabel: string;
  /** What a destructive action's button says. Defaults to "Delete". */
  destructiveLabel?: string;
  /** Disables every button here, while a bulk operation is in flight. */
  disabled?: boolean;
}

export function BulkBarActions({
  actions,
  menuLabel,
  destructiveLabel = 'Delete',
  disabled = false,
}: BulkBarActionsProps) {
  const visible = actions.filter(action => !action.hidden);
  const menuActions = visible.filter(action => action.variant !== 'destructive');
  const destructive = visible.filter(action => action.variant === 'destructive');

  return (
    <>
      {menuActions.length > 0 && (
        <RowActionMenu
          actions={menuActions}
          triggerLabel={menuLabel}
          size="touch"
          disabled={disabled}
          align="start"
          contentClassName="w-64"
        />
      )}
      {destructive.map(action => (
        <BulkBarButton
          key={action.id}
          onClick={action.onSelect}
          icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
          tone="destructive"
          disabled={disabled || action.disabled === true}
          title={action.label}
        >
          {destructiveLabel}
        </BulkBarButton>
      ))}
    </>
  );
}
