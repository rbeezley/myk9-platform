/**
 * The toolbar's quiet search (docs/plan-entries-filter-button.md): a plain field from 1024px up,
 * and below that a 44px search icon that opens the field when tapped. The field is shown while it
 * has focus or holds text, so it needs no flag of its own to close: leave it empty and it goes
 * back to the icon, press Escape on an empty field and it does the same.
 */

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { SearchBar } from '@/components/common/SearchBar';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

/** Below Tailwind's `lg`: the exact complement of `(min-width: 1024px)`, so no width is in both. */
const COLLAPSE_QUERY = 'not all and (min-width: 1024px)';

interface ListSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}

export function ListSearchField({ value, onChange, placeholder, className }: ListSearchFieldProps) {
  const narrow = useMediaQuery(COLLAPSE_QUERY);
  // The icon was tapped and the field is on its way open; cleared once focus lands in it.
  const [requested, setRequested] = useState(false);
  // Focus is inside the field (including its clear button).
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const restoreButtonFocus = useRef(false);
  const showField = !narrow || requested || focused || value !== '';

  useEffect(() => {
    if (requested) wrapperRef.current?.querySelector('input')?.focus();
  }, [requested]);

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
        aria-expanded={false}
        onClick={() => setRequested(true)}
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

  const handleChange = (next: string) => {
    onChange(next);
    // The clear button unmounts as the text empties; keep focus in the field instead of losing it.
    if (next === '') wrapperRef.current?.querySelector('input')?.focus();
  };

  return (
    <div
      ref={wrapperRef}
      className={cn('min-w-0 flex-1 lg:w-72 lg:flex-none xl:w-80', className)}
      onFocus={() => {
        setFocused(true);
        setRequested(false);
      }}
      onBlur={event => {
        // Leaving the browser window blurs the field with nowhere to go; the user is still in it.
        if (!document.hasFocus()) return;
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onKeyDown={event => {
        // SearchBar clears text on Escape; on an empty field Escape closes it, back to the icon.
        // Handled here, so it must not also close a dialog or sheet around the list.
        if (narrow && event.key === 'Escape' && value === '') {
          event.stopPropagation();
          restoreButtonFocus.current = true;
          setRequested(false);
          setFocused(false);
        }
      }}
    >
      <SearchBar value={value} onChange={handleChange} placeholder={placeholder} size="sm" />
    </div>
  );
}
