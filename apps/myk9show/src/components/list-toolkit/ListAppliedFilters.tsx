/**
 * What is narrowing the list, as plain sentences: "Class: Interior Novice B, Exterior Excellent ×".
 * The × clears that one field; Clear all clears everything the page resets. Draws nothing when
 * nothing is applied (docs/plan-entries-filter-button.md).
 *
 * A field that narrows the list but cannot be named yet (its options are still loading) shows as
 * "Class: loading…", never as raw ids and never as an unfiltered-looking list. A screen reader is
 * told how many filters are applied whenever that changes.
 */

import { useRef, type RefObject } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  clearField,
  describeAppliedFilter,
  isFieldActive,
  isFieldLoading,
} from './filterFieldState';
import type { ListMenuFilterField } from './types';

interface ListAppliedFiltersProps {
  fields: ListMenuFilterField[];
  /** Resets the whole list (search, view and every field), the page's own reset. */
  onClearAll?: () => void;
  /** Something that is not a field here (the search text, a chosen view) also narrows the list. */
  alsoNarrowed?: boolean;
  /**
   * Where focus goes after a removal that leaves no neighbouring chip to land on, usually the
   * Filter button. Without it, focus is lost to the page when the last control disappears.
   */
  focusTargetRef?: RefObject<HTMLElement | null>;
  className?: string;
}

function sentenceFor(field: ListMenuFilterField): string {
  return (
    describeAppliedFilter(field) ??
    `${field.label}: ${isFieldLoading(field) ? 'loading…' : 'applied'}`
  );
}

export function ListAppliedFilters({
  fields,
  onClearAll,
  alsoNarrowed = false,
  focusTargetRef,
  className,
}: ListAppliedFiltersProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  const applied = fields
    .filter(isFieldActive)
    .map(field => ({ field, sentence: sentenceFor(field) }));
  const count = applied.length;
  const showClearAll = onClearAll !== undefined && (count > 0 || alsoNarrowed);
  const showRow = count > 0 || showClearAll;

  const removeField = (field: ListMenuFilterField, button: HTMLButtonElement) => {
    const chips = Array.from(
      groupRef.current?.querySelectorAll<HTMLButtonElement>('button[data-remove-filter]') ?? []
    );
    const index = chips.indexOf(button);
    const neighbour = chips[index + 1] ?? chips[index - 1];
    (neighbour ?? focusTargetRef?.current)?.focus();
    clearField(field);
  };

  // The status line is always mounted, so a change in how many filters apply is announced.
  return (
    <>
      <p role="status" className="sr-only">
        {count === 0
          ? 'No filters applied'
          : `${count} ${count === 1 ? 'filter' : 'filters'} applied`}
      </p>
      {showRow && (
        <div
          ref={groupRef}
          role="group"
          aria-label="Applied filters"
          className={cn('flex flex-wrap items-center gap-2', className)}
        >
          {applied.map(({ field, sentence }) => (
            <span
              key={field.key}
              title={sentence}
              className="inline-flex min-h-11 max-w-full items-center rounded-lg bg-muted pl-3 text-sm"
            >
              <span className="min-w-0 break-words py-2">{sentence}</span>
              <button
                type="button"
                data-remove-filter=""
                aria-label={`Remove filter ${sentence}`}
                onClick={event => removeField(field, event.currentTarget)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </span>
          ))}
          {showClearAll && (
            <button
              type="button"
              aria-label="Clear all filters"
              onClick={() => {
                focusTargetRef?.current?.focus();
                onClearAll?.();
              }}
              className="h-11 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </>
  );
}
