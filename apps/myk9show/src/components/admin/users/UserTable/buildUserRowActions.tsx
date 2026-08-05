/**
 * Action-set builder for the admin user table's row menu.
 *
 * The set is derived from the row's lifecycle state. A removed person is not an
 * editable person: the only operations that mean anything are restoring them or
 * clearing them out, so the live-user set (edit, roles, soft delete) is replaced
 * rather than extended. See docs/ia-review-admin-person-detail.md F1 — before
 * this, a removed row offered "Delete user…" and no way back.
 *
 * Kept apart from `RowActions` so the shape can be asserted without a DOM.
 */

import { Eye, Edit, Trash2, Shield, RotateCcw, UserX, UserCheck } from 'lucide-react';
import type { RowAction } from '@/components/ui/RowActionMenu';
import { User } from '@/types/user-types';

export interface UserRowActionHandlers {
  onView: (user: User) => void;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
  onRestore: (user: User) => void;
  onManageRoles?: ((user: User) => void) | undefined;
  onChangeStatus?: ((user: User) => void) | undefined;
  statusActionDisabled?: boolean | undefined;
  statusActionDescription?: string | undefined;
}

export function buildUserRowActions(user: User, handlers: UserRowActionHandlers): RowAction[] {
  const {
    onView,
    onEdit,
    onDelete,
    onRestore,
    onManageRoles,
    onChangeStatus,
    statusActionDisabled,
    statusActionDescription,
  } = handlers;
  const isRemoved = Boolean(user.deletedAt);

  const view: RowAction = {
    id: 'view',
    // Names the destination: this one leaves /admin for the person's profile,
    // while "Edit user" opens the panel in place.
    label: 'Open profile page',
    icon: <Eye />,
    onSelect: () => onView(user),
    className: 'myk9-table-dropdown-item',
  };

  if (isRemoved) {
    // The profile link is back: /people/:id now falls through to the
    // admin-gated removed-person read (MYK9-153), so an admin can look at
    // someone before deciding whether to restore them. It was omitted while
    // that page could only bounce.
    return [
      view,
      {
        id: 'restore',
        label: 'Restore user',
        icon: <RotateCcw />,
        onSelect: () => onRestore(user),
        className: 'myk9-table-dropdown-item',
      },
      {
        id: 'delete',
        label: 'Delete permanently...',
        icon: <Trash2 />,
        onSelect: () => onDelete(user),
        variant: 'destructive',
        className: 'myk9-table-dropdown-item destructive',
      },
    ];
  }

  return [
    view,
    {
      id: 'edit',
      label: 'Edit user',
      icon: <Edit />,
      onSelect: () => onEdit(user),
      className: 'myk9-table-dropdown-item',
    },
    ...(onManageRoles
      ? [
          {
            id: 'roles',
            label: 'Manage roles',
            icon: <Shield />,
            onSelect: () => onManageRoles(user),
            className: 'myk9-table-dropdown-item',
          } satisfies RowAction,
        ]
      : []),
    ...(onChangeStatus
      ? [
          {
            id: 'status',
            label: user.status === 'suspended' ? 'Reinstate account' : 'Suspend account',
            icon: user.status === 'suspended' ? <UserCheck /> : <UserX />,
            onSelect: () => onChangeStatus(user),
            ...(statusActionDisabled !== undefined ? { disabled: statusActionDisabled } : {}),
            ...(statusActionDescription !== undefined
              ? { description: statusActionDescription }
              : {}),
            className: 'myk9-table-dropdown-item',
          } satisfies RowAction,
        ]
      : []),
    {
      id: 'delete',
      label: 'Delete user...',
      icon: <Trash2 />,
      onSelect: () => onDelete(user),
      variant: 'destructive',
      className: 'myk9-table-dropdown-item destructive',
    },
  ];
}
