import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search } from 'lucide-react';

interface SearchablePopoverProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerLabel: string;
  searchPlaceholder: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  emptyMessage: string;
  /** id on the trigger button so a sibling <label htmlFor> connects for a11y. */
  id?: string | undefined;
  /**
   * Optional ARIA wiring for the trigger so a field error stays associated with
   * the control — parity with a native SelectTrigger when this popover stands in
   * for a required Select inside a FormField.
   */
  'aria-invalid'?: boolean | undefined;
  'aria-describedby'?: string | undefined;
}

function SearchablePopover<T extends { id: string }>({
  open,
  onOpenChange,
  triggerLabel,
  searchPlaceholder,
  searchTerm,
  onSearchChange,
  items,
  renderItem,
  emptyMessage,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: SearchablePopoverProps<T>) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          {...(id !== undefined && { id })}
          {...(ariaInvalid !== undefined && { 'aria-invalid': ariaInvalid })}
          {...(ariaDescribedBy !== undefined && { 'aria-describedby': ariaDescribedBy })}
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
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={e => onSearchChange(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="max-h-60 overflow-auto">
          {items.map(item => (
            <React.Fragment key={item.id}>{renderItem(item)}</React.Fragment>
          ))}
          {items.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground text-center">{emptyMessage}</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { SearchablePopover };
export type { SearchablePopoverProps };
