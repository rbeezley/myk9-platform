import React from 'react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreVertical } from 'lucide-react';

interface ThreeDotMenuProps {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const ThreeDotMenu: React.FC<ThreeDotMenuProps> = ({ onView, onEdit, onDelete }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
        <MoreVertical className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={onView}>View</DropdownMenuItem>
      <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
      <DropdownMenuItem onClick={onDelete} className="text-red-600">Delete</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default ThreeDotMenu;
