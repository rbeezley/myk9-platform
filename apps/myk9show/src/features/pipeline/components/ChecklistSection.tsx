import React from 'react';
import { ChecklistItem } from './ChecklistItem';
import { AddCustomItemForm } from './AddCustomItemForm';
import type { ResolvedChecklistItem, PanelKey } from '../types';

interface ChecklistSectionProps {
  items: ResolvedChecklistItem[];
  onToggle: (key: string, completed: boolean) => void;
  onDeleteCustom: (key: string) => void;
  onAddCustom: (label: string) => void;
  onNavigate?: ((navigateTo: PanelKey) => void) | undefined;
  disabled?: boolean | undefined;
}

export const ChecklistSection: React.FC<ChecklistSectionProps> = ({
  items,
  onToggle,
  onDeleteCustom,
  onAddCustom,
  onNavigate,
  disabled,
}) => {
  const cannedItems = items.filter((i) => i.type === 'canned');
  const customItems = items.filter((i) => i.type === 'custom');

  return (
    <div className="space-y-1">
      {cannedItems.map((item) => (
        <ChecklistItem
          key={item.key}
          item={item}
          onToggle={onToggle}
          onNavigate={onNavigate}
          disabled={disabled}
        />
      ))}

      {customItems.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/40 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-3 pb-1">
            Your items
          </p>
          {customItems.map((item) => (
            <ChecklistItem
              key={item.key}
              item={item}
              onToggle={onToggle}
              onDelete={onDeleteCustom}
              disabled={disabled}
            />
          ))}
        </div>
      )}

      <div className="pt-2">
        <AddCustomItemForm onAdd={onAddCustom} disabled={disabled} />
      </div>
    </div>
  );
};
