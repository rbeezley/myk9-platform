import { useRef, useEffect, useCallback } from 'react';
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
  'aria-invalid'?: boolean | undefined;
  'aria-describedby'?: string | undefined;
  /** Most digits accepted (MMSShh = 6). Further keystrokes are ignored. */
  maxDigits?: number;
}

/** MMSShh: two digits each for minutes, seconds and hundredths. */
export const TIME_INPUT_MAX_DIGITS = 6;

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
 * - Always shows the formatted time (e.g. "0:45.32"), live while typing, so a
 *   mistake is visible as it happens. Digits fill in from the right.
 * - Only accepts numeric input, capped at `maxDigits` (default 6)
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
  maxDigits = TIME_INPUT_MAX_DIGITS,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: TimeInputProps) {
  const digits = toDigits(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derived only from the value, never from focus, so what the field shows
  // cannot drift from what the parent holds.
  const displayValue = formatSearchTime(digits) || value;

  // Auto-focus on mount if requested
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const handleBlur = useCallback(() => {
    onCommit();
  }, [onCommit]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // The field shows "0:45.20", so the typed string carries separators and
      // the zero padding; keep the significant digits only.
      const raw = e.target.value.replace(/\D/g, '').replace(/^0+/, '');
      // A seventh digit would shift into minutes unseen. Ignore it.
      if (raw.length > maxDigits) return;
      onChange(raw);
    },
    [onChange, maxDigits]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }

      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
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
    [onCommit, onCancel]
  );

  return (
    <input
      ref={inputRef}
      id={id}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
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
