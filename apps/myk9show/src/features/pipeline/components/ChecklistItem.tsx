import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResolvedChecklistItem, PanelKey } from '../types';

interface ChecklistItemProps {
  item: ResolvedChecklistItem;
  onToggle: (key: string, completed: boolean) => void;
  onDelete?: ((key: string) => void) | undefined;
  onNavigate?: ((navigateTo: PanelKey) => void) | undefined;
  disabled?: boolean | undefined;
}

export const ChecklistItem: React.FC<ChecklistItemProps> = ({
  item,
  onToggle,
  onDelete,
  onNavigate,
  disabled,
}) => {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
        'hover:bg-muted/50',
        item.completed && 'opacity-70',
      )}
    >
      <Checkbox
        checked={item.completed}
        onCheckedChange={(checked) => {
          if (item.autoCompleted) return;
          onToggle(item.key, !!checked);
        }}
        disabled={disabled || item.autoCompleted}
        className={cn(
          item.autoCompleted &&
            'data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500',
        )}
      />

      <div
        className={cn('flex-1 min-w-0', item.navigateTo && 'cursor-pointer')}
        onClick={() => item.navigateTo && onNavigate?.(item.navigateTo)}
      >
        <span
          className={cn(
            'text-sm',
            item.completed && 'line-through text-muted-foreground',
            item.navigateTo && 'hover:underline hover:text-primary',
          )}
        >
          {item.label}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {item.autoCompleted && (
          <Badge
            variant="outline"
            className="text-[10px] gap-0.5 px-1.5 py-0 text-green-600 border-green-200"
          >
            <Zap className="h-2.5 w-2.5" />
            Auto
          </Badge>
        )}
        {item.blocking && !item.completed && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            Required
          </Badge>
        )}
        {item.type === 'custom' && onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.key);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
};
