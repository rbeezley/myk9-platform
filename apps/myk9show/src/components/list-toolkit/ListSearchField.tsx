/**
 * The toolbar's quiet search (docs/plan-entries-filter-button.md): a plain field from 1024px up,
 * and below that a 44px search icon that opens the field when tapped. It stays open while it holds
 * text and closes again when it is empty and you leave it or press Escape.
 */

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { SearchBar } from '@/components/common/SearchBar';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

/** Below this the field is an icon until tapped. */
const COLLAPSE_QUERY = '(max-width: 1023.98px)';

interface ListSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}

export function ListSearchField({ value, onChange, placeholder, className }: ListSearchFieldProps) {
  const narrow = useMediaQuery(COLLAPSE_QUERY);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const restoreButtonFocus = useRef(false);
  const showField = !narrow || open || value !== '';

  useEffect(() => {
    if (open) wrapperRef.current?.querySelector('input')?.focus();
  }, [open]);

  useEffect(() => {
    if (!showField && restoreButtonFocus.current) {
      restoreButtonFocus.current = false;
      buttonRef.current?.focus();
    }
  }, [showField]);

  if (!showField) {
    return (
      <button
        ref={buttonRef}
        type="button"
        aria-label="Search"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-input',
          'bg-[var(--dialog-input-bg)] text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
      >
        <Search className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={cn('min-w-0 flex-1 lg:w-72 lg:flex-none xl:w-80', className)}
      // Once you are in it the field stays open, so clearing the text does not pull it away.
      onFocus={() => setOpen(true)}
      onBlur={event => {
        if (narrow && value === '' && !event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={event => {
        // SearchBar clears text on Escape; on an empty field Escape closes it, back to the icon.
        if (narrow && event.key === 'Escape' && value === '') {
          restoreButtonFocus.current = true;
          setOpen(false);
        }
      }}
    >
      <SearchBar value={value} onChange={onChange} placeholder={placeholder} size="sm" />
    </div>
  );
}
