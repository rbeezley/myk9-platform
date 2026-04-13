import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { formatSearchTime, parseSearchTimeDigits } from './sorting';

export interface TimeInputProps {
  /** Raw digits (e.g. "4532") or pre-formatted time (e.g. "0:45.32") */
  value: string;
  onChange: (digits: string) => void;
  /** Called on blur, Tab, or Enter — triggers auto-advance */
  onCommit: () => void;
  /** Called on Escape */
  onCancel: () => void;
  autoFocus?: boolean;
  className?: string;
  id?: string;
}

/**
 * Resolve the internal digit string from a value that may already be formatted.
 * If the value looks like a formatted time (M:SS.hh), parse it back to digits.
 * Otherwise treat it as raw digits already.
 */
function toDigits(value: string): string {
  if (/^\d+:\d{2}\.\d{2}$/.test(value)) {
    return parseSearchTimeDigits(value);
  }
  return value;
}

/**
 * Specialized input for entering dog search times as a digit stream.
 *
 * - When focused: shows raw digits for fast entry (e.g. "4532")
 * - When blurred: shows formatted time (e.g. "0:45.32")
 * - Only accepts numeric input
 * - Tab/Enter calls onCommit; Escape calls onCancel
 */
export function TimeInput({
  value,
  onChange,
  onCommit,
  onCancel,
  autoFocus = false,
  className,
  id,
}: TimeInputProps) {
  const digits = toDigits(value);
  const [focused, setFocused] = useState(autoFocus);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derive the display value based on focus state
  const displayValue = focused ? digits : formatSearchTime(digits) || value;

  // Auto-focus on mount if requested
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleFocus = useCallback(() => {
    setFocused(true);
  }, [setFocused]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    onCommit();
  }, [onCommit, setFocused]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // Filter to digits only
      const raw = e.target.value.replace(/\D/g, '');
      onChange(raw);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setFocused(false);
        onCancel();
        return;
      }

      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        setFocused(false);
        onCommit();
        return;
      }

      // Block non-numeric keys (allow control keys like Backspace, Delete, arrows)
      const isControlKey = e.ctrlKey || e.metaKey || e.altKey;
      const isNavigationKey = [
        'Backspace',
        'Delete',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
      ].includes(e.key);

      if (!isControlKey && !isNavigationKey && !/^\d$/.test(e.key)) {
        e.preventDefault();
      }
    },
    [onCommit, onCancel, setFocused]
  );

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={cn(
        'w-full bg-background text-sm border border-input rounded px-1 py-0.5',
        'focus:outline-none focus:ring-1 focus:ring-ring font-mono',
        className
      )}
    />
  );
}
