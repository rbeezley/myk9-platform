import React from 'react';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { RowActionMenu, type RowAction } from '@/components/ui/RowActionMenu';

interface ClassRowActionsMenuProps {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const ClassRowActionsMenu: React.FC<ClassRowActionsMenuProps> = ({ onView, onEdit, onDelete }) => {
  const actions: RowAction[] = [
    { id: 'view', label: 'View Details', icon: <Eye />, onSelect: onView },
    { id: 'edit', label: 'Edit Class', icon: <Pencil />, onSelect: onEdit },
    { id: 'delete', label: 'Delete Class', icon: <Trash2 />, onSelect: onDelete, variant: 'destructive' },
  ];

  return <RowActionMenu actions={actions} size="sm" label="Class actions" />;
};

export default ClassRowActionsMenu;
