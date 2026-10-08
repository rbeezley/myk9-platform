/**
 * What is narrowing the list, as plain sentences: "Class: Interior Novice B, Exterior Excellent ×".
 * The × clears that one field; Clear all clears everything the page resets. Renders nothing when
 * nothing is applied (docs/plan-entries-filter-button.md).
 */

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { clearField, describeAppliedFilter } from './filterFieldState';
import type { ListMenuFilterField } from './types';

interface ListAppliedFiltersProps {
  fields: ListMenuFilterField[];
  /** Resets the whole list (search, view and every field), the page's own reset. */
  onClearAll?: () => void;
  /** Something that is not a field here (the search text, a chosen view) also narrows the list. */
  alsoNarrowed?: boolean;
  className?: string;
}

export function ListAppliedFilters({
  fields,
  onClearAll,
  alsoNarrowed = false,
  className,
}: ListAppliedFiltersProps) {
  const applied = fields.flatMap(field => {
    const sentence = describeAppliedFilter(field);
    return sentence === null ? [] : [{ field, sentence }];
  });
  const showClearAll = onClearAll !== undefined && (applied.length > 0 || alsoNarrowed);
  if (applied.length === 0 && !showClearAll) return null;

  return (
    <div
      role="group"
      aria-label="Applied filters"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {applied.map(({ field, sentence }) => (
        <span
          key={field.key}
          className="inline-flex min-h-11 max-w-full items-center rounded-lg bg-muted pl-3 text-sm"
        >
          <span className="min-w-0 truncate">{sentence}</span>
          <button
            type="button"
            aria-label={`Remove filter ${sentence}`}
            onClick={() => clearField(field)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </span>
      ))}
      {showClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="h-11 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
