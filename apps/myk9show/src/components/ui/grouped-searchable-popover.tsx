import React, { useRef, useEffect } from 'react';
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
  /** id on the trigger button so a sibling <label htmlFor> connects for a11y. */
  id?: string | undefined;
  /**
   * When true, the list shows a "Loading…" message instead of "No results".
   * Lets the caller distinguish "still fetching" from "genuinely none" so an
   * empty picker never dead-ends the user at "Add new" prematurely.
   */
  loading?: boolean;
  /** Message shown while `loading` is true. Defaults to "Loading…". */
  loadingLabel?: string;
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
  id,
  loading = false,
  loadingLabel = 'Loading…',
}: GroupedSearchablePopoverProps<T>) {
  const visibleGroups = groups.filter(g => g.items.length > 0);
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus the search input when the popover opens, without scrolling the page.
  useEffect(() => {
    if (!open) return;
    // rAF ensures the popover is fully rendered before we attempt focus.
    const animId = requestAnimationFrame(() => {
      searchRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(animId);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          {...(id !== undefined && { id })}
          variant="outline"
          className="w-full justify-start"
        >
          {triggerLabel}
          <Search className="ml-auto h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b">
          <Input
            ref={searchRef}
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="max-h-60 overflow-auto" role="listbox">
          {loading && (
            <div className="p-3 text-sm text-muted-foreground text-center">{loadingLabel}</div>
          )}
          {!loading && visibleGroups.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground text-center">No results</div>
          )}
          {!loading &&
            visibleGroups.map((group, idx) => (
            <React.Fragment key={group.groupKey}>
              {idx > 0 && <div className="h-px bg-border mx-2" />}
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </div>
              {group.items.map(item => {
                const choose = () => {
                  onSelect(item, group.groupKey);
                  onOpenChange(false);
                };
                return (
                  <div
                    key={item.id}
                    role="option"
                    tabIndex={0}
                    onClick={choose}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        choose();
                      }
                    }}
                    className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    data-group-key={group.groupKey}
                  >
                    {renderItem(item, group.groupKey)}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        {footer && <div className="border-t p-2">{footer}</div>}
      </PopoverContent>
    </Popover>
  );
}

export { GroupedSearchablePopover };
