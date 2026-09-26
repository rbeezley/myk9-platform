/**
 * The body of a filter popover: a value list for an options field, a From/To
 * pair for a date-range field. Shared by an active chip (edit its value) and
 * the "+ Filter" menu (set a new one), so both read identically.
 */

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fromDateInputValue, toDateInputValue } from './filterFieldState';
import type { ListDateRangeFilterField, ListFilterField, ListOptionsFilterField } from './types';

interface FilterFieldEditorProps {
  field: ListFilterField;
  /** Called after a choice that finishes the edit (picking an option). */
  onDone: () => void;
}

function OptionsEditor({ field, onDone }: { field: ListOptionsFilterField; onDone: () => void }) {
  return (
    <div role="group" aria-label={field.label} className="flex flex-col py-1">
      {field.options.length === 0 && (
        <p className="px-3 py-2 text-sm text-muted-foreground">
          No {field.label.toLowerCase()} values yet
        </p>
      )}
      {field.options.map(option => {
        const selected = field.value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              field.onChange(selected ? null : option.value);
              onDone();
            }}
            className={cn(
              'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm',
              'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected && 'font-semibold'
            )}
          >
            <Check
              className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
              aria-hidden="true"
            />
            <span className="flex-1 truncate">{option.label}</span>
            {option.count !== undefined && (
              <span className="text-muted-foreground tabular-nums">
                {option.count.toLocaleString()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function DateRangeEditor({ field }: { field: ListDateRangeFilterField }) {
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

export function FilterFieldEditor({ field, onDone }: FilterFieldEditorProps) {
  return field.kind === 'options' ? (
    <OptionsEditor field={field} onDone={onDone} />
  ) : (
    <DateRangeEditor field={field} />
  );
}
