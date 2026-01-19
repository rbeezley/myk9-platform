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
      <Button variant="ghost" size="icon" className="h-10 w-10 p-0">
        <MoreVertical className="h-5 w-5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={onView} className="min-h-[44px]">View</DropdownMenuItem>
      <DropdownMenuItem onClick={onEdit} className="min-h-[44px]">Edit</DropdownMenuItem>
      <DropdownMenuItem onClick={onDelete} className="text-red-600 min-h-[44px]">Delete</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default ThreeDotMenu;
