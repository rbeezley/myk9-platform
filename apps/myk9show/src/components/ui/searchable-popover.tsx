import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
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
  /**
   * Renders the *contents* of one option. The popover owns the option element
   * itself (`role="option"`, id, selected state, activation), so this must not
   * return a button or any other interactive control — a control nested inside
   * an option is neither reachable by the listbox keyboard model nor valid ARIA.
   */
  renderItem: (item: T) => React.ReactNode;
  /** Called with the chosen item. The popover closes itself afterwards. */
  onSelect: (item: T) => void;
  emptyMessage: string;
  /** id on the trigger button so a sibling <label htmlFor> connects for a11y. */
  id?: string | undefined;
  /**
   * Ids of the currently selected items, used for `aria-selected` on each
   * option. Optional: a picker with no persistent selection may omit it, and
   * options then expose no selection state at all rather than a misleading
   * "not selected".
   */
  selectedItemIds?: readonly string[] | undefined;
  /** Accessible name for the listbox itself. Defaults to the trigger label. */
  listboxLabel?: string | undefined;
  /**
   * Optional ARIA wiring for the trigger so a field error stays associated with
   * the control — parity with a native SelectTrigger when this popover stands in
   * for a required Select inside a FormField.
   */
  'aria-invalid'?: boolean | undefined;
  'aria-describedby'?: string | undefined;
}

/**
 * MYK9-422: the popup Base UI gives us is a `role="dialog"`, and the results
 * used to be bare `<button>`s inside it — a screen reader heard a dialog full
 * of unrelated buttons with no option count, no position and no selected
 * state, and arrow keys did nothing. The results are now a real listbox of
 * options, with combobox semantics on both the trigger (which is what a
 * closed picker exposes) and the search input (which is where focus actually
 * lives while the popup is open, so it is the only element where
 * `aria-activedescendant` can do anything).
 */
function SearchablePopover<T extends { id: string }>({
  open,
  onOpenChange,
  triggerLabel,
  searchPlaceholder,
  searchTerm,
  onSearchChange,
  items,
  renderItem,
  onSelect,
  emptyMessage,
  id,
  selectedItemIds,
  listboxLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: SearchablePopoverProps<T>) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const optionDomId = (index: number) => `${listboxId}-option-${index}`;

  const selectedIdSet = React.useMemo(
    () => (selectedItemIds ? new Set(selectedItemIds) : null),
    [selectedItemIds]
  );

  const [activeIndex, setActiveIndex] = useState(0);
  // Derived, never stored: the list shrinks as the user types, so the stored
  // index is clamped at render time rather than corrected in an effect.
  const activeOption = items.length === 0 ? -1 : Math.min(activeIndex, items.length - 1);

  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus the search input when the popover opens, without scrolling the page.
  useEffect(() => {
    if (!open) return;
    // rAF ensures the popover is fully rendered before we attempt focus.
    const animId = requestAnimationFrame(() => {
      searchRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(animId);
  }, [open]);

  // Keep the active option visible as the arrow keys walk a long list.
  useEffect(() => {
    if (!open || activeOption < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `#${CSS.escape(optionDomId(activeOption))}`
    );
    // jsdom does not implement scrollIntoView.
    el?.scrollIntoView?.({ block: 'nearest' });
    // optionDomId is derived from listboxId, which is stable for this instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeOption, listboxId]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setActiveIndex(0);
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setActiveIndex(0);
      onSearchChange(value);
    },
    [onSearchChange]
  );

  const choose = useCallback(
    (item: T) => {
      onSelect(item);
      handleOpenChange(false);
    },
    [onSelect, handleOpenChange]
  );

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (items.length === 0) return;
    const move = (delta: number) => {
      event.preventDefault();
      setActiveIndex(current => {
        const from = Math.min(current, items.length - 1);
        return (from + delta + items.length) % items.length;
      });
    };
    switch (event.key) {
      case 'ArrowDown':
        move(1);
        break;
      case 'ArrowUp':
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(items.length - 1);
        break;
      case 'Enter': {
        const item = items[activeOption];
        if (item) {
          event.preventDefault();
          choose(item);
        }
        break;
      }
      default:
        break;
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          {...(id !== undefined && { id })}
          {...(ariaInvalid !== undefined && { 'aria-invalid': ariaInvalid })}
          {...(ariaDescribedBy !== undefined && { 'aria-describedby': ariaDescribedBy })}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          {...(open && activeOption >= 0 && { 'aria-activedescendant': optionDomId(activeOption) })}
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
            role="combobox"
            aria-label={searchPlaceholder}
            aria-expanded
            aria-autocomplete="list"
            aria-controls={listboxId}
            {...(activeOption >= 0 && { 'aria-activedescendant': optionDomId(activeOption) })}
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={e => handleSearchChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="h-8"
          />
        </div>
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={listboxLabel ?? triggerLabel}
          className="max-h-60 overflow-auto"
        >
          {items.map((item, index) => (
            <div
              key={item.id}
              id={optionDomId(index)}
              role="option"
              {...(selectedIdSet ? { 'aria-selected': selectedIdSet.has(item.id) } : {})}
              tabIndex={-1}
              data-active={index === activeOption ? '' : undefined}
              className="cursor-pointer data-[active]:bg-muted"
              onClick={() => choose(item)}
              onMouseMove={() => setActiveIndex(index)}
            >
              {renderItem(item)}
            </div>
          ))}
          {items.length === 0 && (
            <div role="presentation" className="p-3 text-sm text-muted-foreground text-center">
              {emptyMessage}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { SearchablePopover };
export type { SearchablePopoverProps };
