/**
 * The body of a date-range filter's popover: a From/To pair. Options fields are
 * labelled selects (ListFilterBar) and need no editor of their own.
 */

import { fromDateInputValue, toDateInputValue } from './filterFieldState';
import type { ListDateRangeFilterField } from './types';

export function DateRangeEditor({ field }: { field: ListDateRangeFilterField }) {
  const { start, end } = field.value;
  const startId = `list-filter-${field.key}-from`;
  const endId = `list-filter-${field.key}-to`;
  const inputClass =
    'h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div role="group" aria-label={field.label} className="flex flex-col gap-3 p-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={startId} className="text-sm font-medium">
          From
        </label>
        <input
          id={startId}
          type="date"
          className={inputClass}
          value={toDateInputValue(start)}
          max={toDateInputValue(end) || undefined}
          onChange={e => field.onChange({ start: fromDateInputValue(e.target.value), end })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={endId} className="text-sm font-medium">
          To
        </label>
        <input
          id={endId}
          type="date"
          className={inputClass}
          value={toDateInputValue(end)}
          min={toDateInputValue(start) || undefined}
          onChange={e => field.onChange({ start, end: fromDateInputValue(e.target.value) })}
        />
      </div>
    </div>
  );
}
