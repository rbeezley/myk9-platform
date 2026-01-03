import React from 'react';
import { Trash2, Download, Edit, Archive } from 'lucide-react';

export interface BulkAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'secondary';
  disabled?: boolean;
}

// Predefined bulk actions for common operations
export const createBulkActions = {
  delete: (onDelete: () => void): BulkAction => ({
    id: 'delete',
    label: 'Delete',
    icon: <Trash2 className="h-4 w-4" />,
    onClick: onDelete,
    variant: 'destructive',
  }),

  export: (onExport: () => void): BulkAction => ({
    id: 'export',
    label: 'Export',
    icon: <Download className="h-4 w-4" />,
    onClick: onExport,
  }),

  edit: (onEdit: () => void): BulkAction => ({
    id: 'edit',
    label: 'Edit',
    icon: <Edit className="h-4 w-4" />,
    onClick: onEdit,
  }),

  archive: (onArchive: () => void): BulkAction => ({
    id: 'archive',
    label: 'Archive',
    icon: <Archive className="h-4 w-4" />,
    onClick: onArchive,
  }),
};