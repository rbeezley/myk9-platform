import React, { ReactNode, useState } from 'react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreVertical } from 'lucide-react';

export interface ThreeDotMenuItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  className?: string;
}

interface ThreeDotMenuProps {
  items: ThreeDotMenuItem[];
  align?: 'start' | 'center' | 'end';
}

const ThreeDotMenu: React.FC<ThreeDotMenuProps> = ({ items, align = 'end' }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 p-0" aria-label="More actions">
          <MoreVertical className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {items.map((item, idx) => (
          <DropdownMenuItem
            key={idx}
            onClick={item.onClick}
            className={`min-h-[44px] ${item.className || ''}`}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThreeDotMenu;
