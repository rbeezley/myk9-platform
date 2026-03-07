/**
 * RowActions - Per-row action dropdown menu
 */

import React from 'react';
import { MoreHorizontal, Eye, Edit, Trash2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User } from '@/types/user-types';

interface RowActionsProps {
  user: User;
  onView: (user: User) => void;
  onEdit: (user: User) => void;
  onDelete: (user: User) => void;
}

export const RowActions: React.FC<RowActionsProps> = ({ user, onView, onEdit, onDelete }) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="myk9-table-actions-trigger">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="myk9-table-dropdown-content">
        <DropdownMenuItem onClick={() => onView(user)} className="myk9-table-dropdown-item">
          <Eye className="h-4 w-4" />
          View Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(user)} className="myk9-table-dropdown-item">
          <Edit className="h-4 w-4" />
          Edit User
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onView(user)} className="myk9-table-dropdown-item">
          <Shield className="h-4 w-4" />
          Manage Roles
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-border/30 my-2" />
        <DropdownMenuItem
          onClick={() => onDelete(user)}
          className="myk9-table-dropdown-item destructive"
        >
          <Trash2 className="h-4 w-4" />
          Delete User
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
