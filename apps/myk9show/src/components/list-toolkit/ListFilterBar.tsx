/**
 * Search plus one labelled control per filter field, the list toolkit's query
 * bar (MYK9-906).
 *
 * Every field is always visible as "Label: [value ▾]" — an options field is a
 * select whose first entry clears it ("All classes"), a date-range field opens
 * a From/To popover. Nothing hides behind a "+ Filter" menu and no chip reads
 * like a badge: a novice sees what can be narrowed and what it is set to.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchBar } from '@/components/common/SearchBar';
import { cn } from '@/lib/utils';
import { DateRangeEditor } from './FilterFieldEditor';
import { describeDateRange, isFieldActive } from './filterFieldState';
import type { ListDateRangeFilterField, ListFilterField, ListOptionsFilterField } from './types';

interface ListFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  fields: ListFilterField[];
  /** Resets search and every field. Shown only while something is active. */
  onClearAll?: () => void;
  className?: string;
}

const ALL_VALUE = '__all__';

function FieldLabel({ children }: { children: string }) {
  return (
    <span className="text-sm font-medium text-foreground" aria-hidden="true">
      {children}:
    </span>
  );
}

function optionText(label: string, count: number | undefined): string {
  return count === undefined ? label : `${label} (${count.toLocaleString()})`;
}

function OptionsControl({ field }: { field: ListOptionsFilterField }) {
  const allLabel = field.allLabel ?? `Any ${field.label.toLowerCase()}`;
  // A value the field no longer offers still shows — raw — so a stale URL is
  // visible and changeable rather than silently filtering.
  const stale = field.value !== null && !field.options.some(option => option.value === field.value);

  return (
    <div className="flex items-center gap-2">
      <FieldLabel>{field.label}</FieldLabel>
      <Select
        value={field.value ?? ALL_VALUE}
        onValueChange={value => field.onChange(value === ALL_VALUE ? null : value)}
      >
        <SelectTrigger
          aria-label={field.label}
          className="w-auto min-w-[10rem] max-w-[min(20rem,calc(100vw-6.5rem))]"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE} className="min-h-11">
            {allLabel}
          </SelectItem>
          {stale && field.value !== null && (
            <SelectItem value={field.value} className="min-h-11">
              {field.value}
            </SelectItem>
          )}
          {field.options.map(option => (
            <SelectItem key={option.value} value={option.value} className="min-h-11">
              {optionText(option.label, option.count)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DateRangeControl({ field }: { field: ListDateRangeFilterField }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <FieldLabel>{field.label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${field.label}: ${describeDateRange(field.value)}. Change`}
            className={cn(
              'flex h-11 min-w-[10rem] items-center justify-between gap-2 rounded-md border border-input px-3 text-sm',
              'bg-[var(--dialog-input-bg)] shadow-sm focus:outline-none focus:ring-2 focus:ring-primary'
            )}
          >
            <span className="truncate">{describeDateRange(field.value)}</span>
            <ChevronDown className="h-4 w-4 opacity-50" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-1">
          <DateRangeEditor field={field} />
          {isFieldActive(field) && (
            <button
              type="button"
              onClick={() => {
                field.onChange({ start: null, end: null });
                setOpen(false);
              }}
              className="flex min-h-11 w-full items-center rounded-md px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Any time
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ListFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  fields,
  onClearAll,
  className,
}: ListFilterBarProps) {
  const anythingActive = fields.some(isFieldActive) || searchValue.trim() !== '';

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      <SearchBar
        value={searchValue}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        size="sm"
        className="w-full sm:w-72 lg:w-80"
      />
      {fields.map(field =>
        field.kind === 'options' ? (
          <OptionsControl key={field.key} field={field} />
        ) : (
          <DateRangeControl key={field.key} field={field} />
        )
      )}
      {onClearAll && anythingActive && (
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
