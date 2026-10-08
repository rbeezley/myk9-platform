/**
 * ThreeDotMenu — a list ROW's overflow menu (View / Edit / qualifications / Delete). A thin
 * adapter over the canonical {@link RowActionMenu} primitive: all menu behavior (trigger,
 * a11y, destructive token, separators) lives there.
 *
 * Rows only. A detail page's own actions (Change Photo, Suspend account...) live in the
 * header Actions menu (CRUD standard decision 6), never in a ⋮ on the page's card.
 * New code should prefer RowActionMenu directly.
 */
import React from 'react';
import { Eye, Pencil, Award, Trash2 } from 'lucide-react';
import { RowActionMenu, type RowAction } from '@/components/ui/RowActionMenu';

interface ThreeDotMenuProps {
  onView?: (() => void) | undefined;
  onEdit?: (() => void) | undefined;
  onManageQualifications?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  viewLabel?: string | undefined;
  editLabel?: string | undefined;
  showManageQualifications?: boolean | undefined;
}

const ThreeDotMenu: React.FC<ThreeDotMenuProps> = ({
  onView,
  onEdit,
  onManageQualifications,
  onDelete,
  viewLabel = 'View',
  editLabel = 'Edit Profile',
  showManageQualifications = false,
}) => {
  const actions: RowAction[] = [];

  // Edit is first on every row menu (MYK9-928).
  if (onEdit) {
    actions.push({ id: 'edit', label: editLabel, icon: <Pencil />, onSelect: onEdit });
  }
  if (onView) {
    actions.push({ id: 'view', label: viewLabel, icon: <Eye />, onSelect: onView });
  }
  if (showManageQualifications && onManageQualifications) {
    actions.push({
      id: 'qualifications',
      label: 'Manage Qualifications',
      icon: <Award />,
      onSelect: onManageQualifications,
      separatorBefore: true,
    });
  }
  if (onDelete) {
    actions.push({
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 />,
      onSelect: onDelete,
      variant: 'destructive',
    });
  }

  // Every row caller has laid out against this 40px trigger.
  return (
    <RowActionMenu
      actions={actions}
      label="More actions"
      size="touch"
      triggerClassName="h-10 w-10"
    />
  );
};

export default ThreeDotMenu;
