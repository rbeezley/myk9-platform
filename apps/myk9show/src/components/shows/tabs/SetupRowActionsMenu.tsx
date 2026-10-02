import { Pencil, Trash2 } from 'lucide-react';
import { RowActionMenu, type RowAction } from '@/components/ui/RowActionMenu';

interface SetupRowActionsMenuProps {
  /** "Trial" or "Class" — names the row in the trigger's accessible label. */
  subject: string;
  /** The row's own name, so every trigger on the page has a distinct label. */
  rowLabel: string;
  onEdit: () => void;
  onDelete: () => void;
  /** The row's data is still being prepared: the menu is disabled and announces it. */
  busy?: boolean;
  /** Another row's action is being prepared: disabled, but this row's own label is kept. */
  locked?: boolean;
  /** Row-specific actions listed between Edit and Delete (a class's waitlist link and status). */
  extraActions?: RowAction[];
}

/**
 * Edit, any row-specific `extraActions`, then Delete for one Setup row (MYK9-900). The row itself still opens the
 * detail page; this menu opens the existing edit panel and delete dialog for
 * that row. The wrapper stops click AND keydown: the row/card navigates on
 * both, and React events bubble out of the menu's portal into the row.
 */
export function SetupRowActionsMenu({
  subject,
  rowLabel,
  onEdit,
  onDelete,
  busy = false,
  locked = false,
  extraActions = [],
}: SetupRowActionsMenuProps) {
  const hasExtras = extraActions.some(action => !action.hidden);
  // Edit is first on every row menu (MYK9-928). The row-specific items follow it, and
  // Delete stays last.
  const actions: RowAction[] = [
    {
      id: 'edit',
      label: `Edit ${subject}`,
      icon: <Pencil />,
      onSelect: onEdit,
    },
    ...extraActions.map((action, index) =>
      index === 0 ? { ...action, separatorBefore: true } : action
    ),
    {
      id: 'delete',
      label: `Delete ${subject}`,
      icon: <Trash2 />,
      onSelect: onDelete,
      variant: 'destructive',
      separatorBefore: hasExtras,
    },
  ];

  return (
    <div
      className="shrink-0"
      onClick={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
    >
      <RowActionMenu
        actions={actions}
        size="touch"
        disabled={busy || locked}
        label={
          busy
            ? `Opening ${subject.toLowerCase()} ${rowLabel}`
            : `${subject} actions for ${rowLabel}`
        }
      />
    </div>
  );
}
