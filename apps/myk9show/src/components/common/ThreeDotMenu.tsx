import React from 'react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreVertical, Eye, Pencil, Trash2, Award } from 'lucide-react';

interface ThreeDotMenuProps {
  onView?: (() => void) | undefined;
  onEdit?: (() => void) | undefined;
  onEditPhoto?: (() => void) | undefined;
  onManageQualifications?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  viewLabel?: string | undefined;
  editLabel?: string | undefined;
  showManageQualifications?: boolean | undefined;
}

const ThreeDotMenu: React.FC<ThreeDotMenuProps> = ({ 
  onView, 
  onEdit, 
  onEditPhoto, 
  onManageQualifications, 
  onDelete, 
  viewLabel = "View", 
  editLabel = "Edit Profile",
  showManageQualifications = false 
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="h-10 w-10 p-0">
        <MoreVertical className="h-5 w-5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {onView && (
        <DropdownMenuItem onClick={onView} className="min-h-[44px] cursor-pointer">
          <Eye size={18} className="mr-2" />{viewLabel}
        </DropdownMenuItem>
      )}
      {onEdit && (
        <DropdownMenuItem onClick={onEdit} className="min-h-[44px] cursor-pointer">
          <Pencil size={18} className="mr-2" />{editLabel}
        </DropdownMenuItem>
      )}
      {onEditPhoto && (
        <DropdownMenuItem onClick={onEditPhoto} className="min-h-[44px] cursor-pointer">
          <svg className="w-[18px] h-[18px] mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Change Photo
        </DropdownMenuItem>
      )}
      {showManageQualifications && onManageQualifications && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onManageQualifications} className="min-h-[44px] cursor-pointer">
            <Award size={18} className="mr-2" />
            Manage Qualifications
          </DropdownMenuItem>
        </>
      )}
      {onDelete && (
        <DropdownMenuItem onClick={onDelete} className="text-red-600 min-h-[44px] cursor-pointer">
          <Trash2 size={18} className="mr-2" />Delete
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);

export default ThreeDotMenu;
