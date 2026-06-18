/**
 * ThreeDotMenu — thin adapter over the canonical {@link RowActionMenu} primitive.
 *
 * Kept for its existing call sites (its `items` API maps 1:1 onto RowAction). New
 * code should import `RowActionMenu` directly. This file no longer owns any menu
 * behavior — RowActionMenu is the single source of truth for trigger, a11y,
 * destructive styling, and separators.
 */
import React, { ReactNode } from 'react';
import { RowActionMenu, type RowAction } from '@/components/ui/RowActionMenu';

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
  const actions: RowAction[] = items.map((item, idx) => ({
    id: String(idx),
    label: item.label,
    icon: item.icon,
    onSelect: item.onClick,
    className: item.className,
  }));

  return (
    <RowActionMenu
      actions={actions}
      align={align}
      label="More actions"
      size="touch"
      triggerClassName="h-10 w-10"
    />
  );
};

export default ThreeDotMenu;
