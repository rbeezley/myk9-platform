/**
 * RowActions - Per-row action dropdown menu
 *
 * Renders the canonical {@link RowActionMenu} primitive, skinned with the
 * `myk9-table-*` classes so it keeps the admin table's bespoke look.
 */

import React from 'react';
import { Eye, Edit, Trash2, Shield } from 'lucide-react';
import { RowActionMenu, type RowAction } from '@/components/ui/RowActionMenu';
import { User } from '@/types/user-types';

interface RowActionsProps {
  user: User;
  onView: (user: User) => void;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onManageRoles?: (user: User) => void;
}

export const RowActions: React.FC<RowActionsProps> = ({
  user,
  onView,
  onEdit,
  onDelete,
  onManageRoles,
}) => {
  const actions: RowAction[] = [
    {
      id: 'view',
      label: 'View Details',
      icon: <Eye />,
      onSelect: () => onView(user),
      className: 'myk9-table-dropdown-item',
    },
    {
      id: 'edit',
      label: 'Edit User',
      icon: <Edit />,
      onSelect: () => onEdit(user),
      className: 'myk9-table-dropdown-item',
    },
    {
      id: 'roles',
      label: 'Manage Roles',
      icon: <Shield />,
      onSelect: () => (onManageRoles ? onManageRoles(user) : onView(user)),
      className: 'myk9-table-dropdown-item',
    },
    {
      id: 'delete',
      label: 'Delete User',
      icon: <Trash2 />,
      onSelect: () => onDelete(user),
      variant: 'destructive',
      className: 'myk9-table-dropdown-item destructive',
    },
  ];

  return (
    <RowActionMenu
      actions={actions}
      icon="horizontal"
      size="sm"
      label={`Actions for ${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'User actions'}
      triggerClassName="myk9-table-actions-trigger"
      contentClassName="myk9-table-dropdown-content"
    />
  );
};
