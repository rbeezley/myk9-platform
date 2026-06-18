/**
 * Dropdown menu for entry actions
 */

import React from 'react';
import { Eye, Pencil, Clock, Trash2, CheckCircle, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { RowActionMenu, type RowAction } from '@/components/ui/RowActionMenu';
import { EntryData } from '../../types/classTypes';
import { InlineEditEntry } from '../types';

interface EntryActionsMenuProps {
  entry: EntryData;
  enableInlineEditing: boolean;
  editData: InlineEditEntry;
  onView: () => void;
  onEdit: () => void;
  onEnterResults: () => void;
  onDelete: () => void;
}

export const EntryActionsMenu: React.FC<EntryActionsMenuProps> = ({
  enableInlineEditing,
  editData,
  onView,
  onEdit,
  onEnterResults,
  onDelete
}) => {
  if (enableInlineEditing) {
    // Show edit status for inline editing mode
    return (
      <div className="flex items-center justify-center space-x-1">
        {editData.hasChanges ? (
          editData.isValid ? (
            <Badge variant="default" className="flex items-center space-x-1">
              <CheckCircle className="h-3 w-3" />
              <span>Valid</span>
            </Badge>
          ) : (
            <Badge variant="destructive" className="flex items-center space-x-1">
              <AlertCircle className="h-3 w-3" />
              <span>Invalid</span>
            </Badge>
          )
        ) : (
          <ActionDropdown
            onView={onView}
            onEdit={onEdit}
            onEnterResults={onEnterResults}
            onDelete={onDelete}
            showEnterResults={false}
          />
        )}
      </div>
    );
  }

  // Original dropdown menu for non-inline editing mode
  return (
    <ActionDropdown
      onView={onView}
      onEdit={onEdit}
      onEnterResults={onEnterResults}
      onDelete={onDelete}
      showEnterResults={true}
    />
  );
};

interface ActionDropdownProps {
  onView: () => void;
  onEdit: () => void;
  onEnterResults: () => void;
  onDelete: () => void;
  showEnterResults: boolean;
}

const ActionDropdown: React.FC<ActionDropdownProps> = ({
  onView,
  onEdit,
  onEnterResults,
  onDelete,
  showEnterResults
}) => {
  const actions: RowAction[] = [
    { id: 'view', label: 'View Details', icon: <Eye />, onSelect: onView },
    { id: 'edit', label: 'Edit Entry', icon: <Pencil />, onSelect: onEdit },
    {
      id: 'enter-results',
      label: 'Enter Results',
      icon: <Clock />,
      onSelect: onEnterResults,
      variant: 'warning',
      hidden: !showEnterResults,
    },
    {
      id: 'delete',
      label: 'Delete Entry',
      icon: <Trash2 />,
      onSelect: onDelete,
      variant: 'destructive',
    },
  ];

  return <RowActionMenu actions={actions} size="sm" label="Entry actions" />;
};
