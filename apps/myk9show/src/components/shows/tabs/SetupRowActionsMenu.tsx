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
}

/**
 * Edit / Delete for one Setup row (MYK9-900). The row itself still opens the
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
}: SetupRowActionsMenuProps) {
  const actions: RowAction[] = [
    { id: 'edit', label: `Edit ${subject}`, icon: <Pencil />, onSelect: onEdit },
    {
      id: 'delete',
      label: `Delete ${subject}`,
      icon: <Trash2 />,
      onSelect: onDelete,
      variant: 'destructive',
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
        disabled={busy}
        label={
          busy
            ? `Opening ${subject.toLowerCase()} ${rowLabel}`
            : `${subject} actions for ${rowLabel}`
        }
      />
    </div>
  );
}
