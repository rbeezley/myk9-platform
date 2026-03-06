import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { SortDefinition, SortDirection } from './types';

interface SortPillProps {
  sortDefs: SortDefinition[];
  activeKey: string | null;
  direction: SortDirection;
  onSort: (key: string | null, direction?: SortDirection) => void;
}

export function SortPill({ sortDefs, activeKey, direction, onSort }: SortPillProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const activeLabel = sortDefs.find(s => s.key === activeKey)?.label;
  const DirectionIcon = direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Badge
          variant="outline"
          role="status"
          aria-label={
            activeKey
              ? `Sorted by ${activeLabel} ${direction === 'asc' ? 'ascending' : 'descending'}`
              : 'Sort'
          }
          className="py-1.5 px-2 flex items-center gap-1.5 cursor-pointer hover:bg-muted/50 transition-colors text-sm font-normal"
        >
          {activeKey ? (
            <DirectionIcon className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
          )}
          <span className="text-muted-foreground">Sort:</span>
          <span className="font-medium">{activeLabel || 'Default'}</span>
        </Badge>
      </PopoverTrigger>

      <PopoverContent className="w-48 p-2" align="start">
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => {
              onSort(null);
              setPopoverOpen(false);
            }}
            className={cn(
              'flex items-center w-full rounded-md px-2 py-1.5 text-sm transition-colors',
              !activeKey ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
            )}
          >
            Default
          </button>
          {sortDefs.map(def => {
            const isActive = activeKey === def.key;
            return (
              <button
                key={def.key}
                type="button"
                onClick={() => {
                  if (isActive) {
                    // Toggle direction
                    onSort(def.key, direction === 'asc' ? 'desc' : 'asc');
                  } else {
                    onSort(def.key, 'asc');
                  }
                  setPopoverOpen(false);
                }}
                className={cn(
                  'flex items-center justify-between w-full rounded-md px-2 py-1.5 text-sm transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
                )}
              >
                <span>{def.label}</span>
                {isActive && <DirectionIcon className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
