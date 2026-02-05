/**
 * Dropdown menu for entry actions
 */

import React from 'react';
import { Eye, Pencil, Clock, Trash2, MoreVertical, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  entry,
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
            entry={entry}
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
      entry={entry}
      onView={onView}
      onEdit={onEdit}
      onEnterResults={onEnterResults}
      onDelete={onDelete}
      showEnterResults={true}
    />
  );
};

interface ActionDropdownProps {
  entry: EntryData;
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 hover:bg-muted"
        >
          <span className="sr-only">Open menu</span>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onView}>
          <Eye className="mr-2 h-4 w-4" />
          <span>View Details</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          <span>Edit Entry</span>
        </DropdownMenuItem>
        {showEnterResults && (
          <DropdownMenuItem
            onClick={onEnterResults}
            className="text-amber-600 focus:text-amber-600"
          >
            <Clock className="mr-2 h-4 w-4" />
            <span>Enter Results</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDelete}
          className="text-red-600 focus:text-red-600"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          <span>Delete Entry</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
