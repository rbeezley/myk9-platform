import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search } from 'lucide-react';

export interface PopoverGroup<T> {
  label: string;
  items: T[];
  groupKey: string;
}

export interface GroupedSearchablePopoverProps<T extends { id: string }> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerLabel: string;
  searchPlaceholder: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  groups: PopoverGroup<T>[];
  renderItem: (item: T, groupKey: string) => React.ReactNode;
  onSelect: (item: T, groupKey: string) => void;
  footer?: React.ReactNode;
}

function GroupedSearchablePopover<T extends { id: string }>({
  open,
  onOpenChange,
  triggerLabel,
  searchPlaceholder,
  searchTerm,
  onSearchChange,
  groups,
  renderItem,
  onSelect,
  footer,
}: GroupedSearchablePopoverProps<T>) {
  const visibleGroups = groups.filter(g => g.items.length > 0);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          {triggerLabel}
          <Search className="ml-auto h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <Input
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <div className="max-h-60 overflow-auto">
          {visibleGroups.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground text-center">No results</div>
          )}
          {visibleGroups.map((group, idx) => (
            <React.Fragment key={group.groupKey}>
              {idx > 0 && <div className="h-px bg-border mx-2" />}
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </div>
              {group.items.map(item => (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelect(item, group.groupKey);
                    onOpenChange(false);
                  }}
                  data-group-key={group.groupKey}
                >
                  {renderItem(item, group.groupKey)}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
        {footer && <div className="border-t p-2">{footer}</div>}
      </PopoverContent>
    </Popover>
  );
}

export { GroupedSearchablePopover };
