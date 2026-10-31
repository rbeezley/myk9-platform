/**
 * ClockTimeInput -- the one field where a person types a time of day (MYK9-1504).
 *
 * Reads through `parseClockTime` from @myk9/core, so a trial start, a class start,
 * a briefing, a break-until and an expected start all understand the same
 * keystrokes. A live line under the field says what was understood ("= 09:30 AM")
 * before the person leaves it; a time that fits both AM and PM asks, and one that
 * cannot be read says why, instead of being guessed at. The stored `value` keeps the
 * field's own format (`storage`), is '' while unset (never midnight), and holds the
 * raw typed text while it is not yet a time, so a caller can refuse to save it
 * (`isUnresolvedClockTime`).
 *
 * INTENT: secretary "the software already knows what I need" -- type 930, see
 * 09:30 AM, move on.
 */

import React from 'react';
import { Input } from '@myk9/ui';
import {
  formatClockTime,
  isClockTimeFailure,
  parseClockTime,
  parseStoredClockTime,
  storeClockTime,
  type ClockTimeResult,
  type ClockTimeStorage,
} from '@myk9/core';

export interface ClockTimeInputProps {
  /** Stored text in `storage`'s format, '' for unset, or unresolved typed text. */
  value: string;
  onChange: (value: string, result: ClockTimeResult) => void;
  /** How a valid time is written back; the stored format of the field does not change. */
  storage?: ClockTimeStorage | undefined;
  ariaLabel?: string | undefined;
  id?: string | undefined;
  testId?: string | undefined;
  autoFocus?: boolean | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  placeholder?: string | undefined;
  /** Enter pressed: the host saves. */
  onSubmit?: (() => void) | undefined;
  onCancel?: (() => void) | undefined;
  onFocus?: (() => void) | undefined;
  onBlur?: (() => void) | undefined;
  /** A host-side problem (conflict, required) shown by the host; marks the field invalid. */
  invalid?: boolean | undefined;
  /** Extra id of an element (such as an outside error) to describe the field. */
  describedBy?: string | undefined;
  /** Keep one line free for the preview/error (default) so the layout does not jump. */
  reserveHint?: boolean | undefined;
}

/** What the field shows for a stored value: the one display format, or the raw text. */
function displayFor(value: string): string {
  const minutes = parseStoredClockTime(value);
  return minutes === null ? value : formatClockTime(minutes);
}

/** What the field stores for a parse of `text`. */
function storedFor(text: string, result: ClockTimeResult, storage: ClockTimeStorage): string {
  if (result.ok) return storeClockTime(result.minutesSinceMidnight, storage);
  return text.trim() === '' ? '' : text;
}

export const ClockTimeInput: React.FC<ClockTimeInputProps> = ({
  value,
  onChange,
  storage = 'text',
  ariaLabel,
  id,
  testId,
  autoFocus,
  disabled,
  className,
  placeholder = 'e.g., 9:30 AM',
  onSubmit,
  onCancel,
  onFocus,
  onBlur,
  invalid,
  describedBy,
  reserveHint = true,
}) => {
  const autoId = React.useId();
  const hintId = `${id ?? autoId}-hint`;
  const [text, setText] = React.useState(() => displayFor(value));
  // What we last reported, so the parent echoing it back never rewrites the
  // digits mid-typing, while a change from elsewhere does.
  const reported = React.useRef(value);
  React.useEffect(() => {
    if (value !== reported.current) {
      reported.current = value;
      setText(displayFor(value));
    }
  }, [value]);

  const result = parseClockTime(text);

  const report = (next: string) => {
    setText(next);
    const parsed = parseClockTime(next);
    const stored = storedFor(next, parsed, storage);
    reported.current = stored;
    onChange(stored, parsed);
  };

  // Show the canonical text; tell the parent only if the stored value changed, so
  // tabbing through an existing time never makes a pending edit.
  const settle = () => {
    if (!result.ok || text === result.formatted) return;
    const stored = storeClockTime(result.minutesSinceMidnight, storage);
    if (stored === reported.current) setText(result.formatted);
    else report(result.formatted);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && onCancel) {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter' && onSubmit) {
      e.preventDefault();
      settle();
      onSubmit();
    }
  };

  const hasText = text.trim() !== '';
  const failure = isClockTimeFailure(result) ? result : undefined;
  let hint: React.ReactNode = null;
  if (failure && hasText) {
    hint = (
      <p role="alert" className="text-sm text-destructive" data-testid="clock-time-error">
        {failure.reason}
        {failure.candidates?.map(candidate => (
          <button
            key={candidate.formatted}
            type="button"
            className="ml-2 inline-flex h-11 items-center rounded-md border border-border px-3 font-medium text-foreground"
            onMouseDown={e => e.preventDefault()}
            onClick={() => report(candidate.formatted)}
          >
            {candidate.formatted}
          </button>
        ))}
      </p>
    );
  } else if (result.ok && text.trim() !== result.formatted) {
    hint = (
      <p role="status" className="text-sm text-muted-foreground" data-testid="clock-time-preview">
        = {result.formatted}
      </p>
    );
  }

  return (
    <div className="min-w-0 flex-1">
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint={onSubmit ? 'done' : 'next'}
        spellCheck={false}
        value={text}
        onChange={e => report(e.target.value)}
        onFocus={e => {
          // Typing a new time replaces the old one instead of appending to it (MYK9-832).
          e.currentTarget.select();
          onFocus?.();
        }}
        // The click that focused the field would otherwise drop the selection on mouseup.
        onMouseUp={e => e.preventDefault()}
        onBlur={() => {
          settle();
          onBlur?.();
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={(failure && hasText) || invalid ? true : undefined}
        aria-describedby={
          [hint ? hintId : null, describedBy].filter(Boolean).join(' ') || undefined
        }
        data-testid={testId}
        className={className ?? 'h-11 text-base'}
      />
      {(hint || reserveHint) && (
        <div id={hintId} className={reserveHint ? 'min-h-5' : undefined}>
          {hint}
        </div>
      )}
    </div>
  );
};
