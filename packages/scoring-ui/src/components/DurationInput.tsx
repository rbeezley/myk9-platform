/**
 * DurationInput -- the one field where a person types a time (MYK9-1503).
 *
 * Reads through `parseDuration` from @myk9/core, so a scoresheet, the paper
 * scoring panel, the results grid and Set Max Time all understand the same
 * keystrokes. A live line under the field says what was understood ("= 0:45.32")
 * before the person leaves it, and a time that cannot be read says why instead
 * of being guessed at. The stored `value` is the canonical text ("1:23.45"), an
 * empty string, or, while the text is not yet a time, what was typed, so a
 * caller can refuse to save it (`isUnresolvedDuration`).
 *
 * INTENT: judge "tap and done" -- the numeric pad, one field, no mode switch.
 */

import React from 'react';
import { Input } from '@myk9/ui';
import {
  formatDuration,
  isDurationFailure,
  parseDuration,
  type DurationKind,
  type DurationResult,
} from '@myk9/core';

export interface DurationInputProps {
  /** `search`: m:ss.cc, digits fill from the right. `max`: m:ss, 1-2 digits are minutes. */
  kind: DurationKind;
  /** Canonical text, '' or unresolved typed text. */
  value: string;
  onChange: (value: string, result: DurationResult) => void;
  ariaLabel?: string | undefined;
  id?: string | undefined;
  testId?: string | undefined;
  /** Max kind: allowed seconds; a readable time outside it is flagged inline. */
  range?: { low: number; high: number } | undefined;
  autoFocus?: boolean | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  /** Blur or Enter or Tab: the grid uses this to move to the next field. */
  onCommit?: (() => void) | undefined;
  onCancel?: (() => void) | undefined;
  onFocus?: (() => void) | undefined;
  /** Renders a clear button once there is text; the string names it for screen readers. */
  clearLabel?: string | undefined;
  /** Extra id of an element (such as an outside warning) to describe the field. */
  describedBy?: string | undefined;
}

const PLACEHOLDER: Record<DurationKind, string> = { search: '0:00.00', max: 'm:ss' };

const mmss = (seconds: number) => formatDuration(seconds, 'max');

/** What the field holds for a parse of `text`. */
function storedFor(text: string, result: DurationResult): string {
  if (result.ok) return result.formatted;
  return text.trim() === '' ? '' : text;
}

export const DurationInput: React.FC<DurationInputProps> = ({
  kind,
  value,
  onChange,
  ariaLabel,
  id,
  testId,
  range,
  autoFocus,
  disabled,
  className,
  onCommit,
  onCancel,
  onFocus,
  clearLabel,
  describedBy,
}) => {
  const autoId = React.useId();
  const hintId = `${id ?? autoId}-hint`;
  const [text, setText] = React.useState(value);
  // What we last reported, so the parent echoing it back never rewrites the
  // digits mid-typing, while a change from elsewhere (the stopwatch) does.
  const reported = React.useRef(value);
  React.useEffect(() => {
    if (value !== reported.current) {
      reported.current = value;
      setText(value);
    }
  }, [value]);

  const result = parseDuration(text, kind);
  const outOfRange =
    result.ok && range !== undefined && (result.seconds < range.low || result.seconds > range.high);

  const report = (next: string) => {
    setText(next);
    const parsed = parseDuration(next, kind);
    const stored = storedFor(next, parsed);
    reported.current = stored;
    onChange(stored, parsed);
  };

  const handleBlur = () => {
    if (result.ok && text !== result.formatted) report(result.formatted);
    onCommit?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && onCancel) {
      e.preventDefault();
      onCancel();
    } else if ((e.key === 'Enter' || e.key === 'Tab') && onCommit && !e.shiftKey) {
      e.preventDefault();
      if (result.ok && text !== result.formatted) report(result.formatted);
      onCommit();
    }
  };

  const hasText = text.trim() !== '';
  const failure = isDurationFailure(result) ? result : undefined;
  const suggestion = failure?.suggestion;
  let hint: React.ReactNode = null;
  if (failure && hasText) {
    hint = (
      <p role="alert" className="text-sm text-destructive" data-testid="duration-error">
        {failure.reason}
        {suggestion && (
          <button
            type="button"
            className="ml-2 inline-flex h-11 items-center rounded-md border border-border px-3 font-medium text-foreground"
            onMouseDown={e => e.preventDefault()}
            onClick={() => report(suggestion.formatted)}
          >
            Use {suggestion.formatted}
          </button>
        )}
      </p>
    );
  } else if (outOfRange && range) {
    hint = (
      <p role="alert" className="text-sm text-destructive" data-testid="duration-error">
        Must be between {mmss(range.low)} and {mmss(range.high)}.
      </p>
    );
  } else if (result.ok && text.trim() !== result.formatted) {
    hint = (
      <p role="status" className="text-sm text-muted-foreground" data-testid="duration-preview">
        = {result.formatted}
      </p>
    );
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint={onCommit ? 'next' : 'done'}
          spellCheck={false}
          value={text}
          onChange={e => report(e.target.value)}
          onFocus={onFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={PLACEHOLDER[kind]}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={(!result.ok && hasText) || outOfRange ? true : undefined}
          aria-describedby={
            [hint ? hintId : null, describedBy].filter(Boolean).join(' ') || undefined
          }
          data-testid={testId}
          className={
            className ??
            'h-11 rounded-lg border-2 text-center font-mono text-base font-medium focus:border-primary'
          }
        />
        {clearLabel && hasText && !disabled && (
          <button
            type="button"
            className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={clearLabel}
            onMouseDown={e => e.preventDefault()}
            onClick={() => report('')}
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        )}
      </div>
      {hint && <div id={hintId}>{hint}</div>}
    </div>
  );
};
