/**
 * Search plus filter chips, the list toolkit's query bar.
 *
 * Every active filter is a chip reading "Field: value". The chip itself opens
 * the same editor that set it; the × beside it removes it. "+ Filter" lists the
 * fields not yet in use. Chips and × are separate 44px buttons (docs/INTENT.md
 * § 3) — a clear glyph nested inside the chip is unreachable by keyboard.
 */

import { useState } from 'react';
import { ChevronLeft, Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SearchBar } from '@/components/common/SearchBar';
import { cn } from '@/lib/utils';
import { FilterFieldEditor } from './FilterFieldEditor';
import { describeFieldValue, isFieldActive } from './filterFieldState';
import type { ListFilterField } from './types';

interface ListFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  fields: ListFilterField[];
  /** Resets search and every field. Shown only while something is active. */
  onClearAll?: () => void;
  className?: string;
}

const CHIP_BUTTON =
  'inline-flex h-11 items-center gap-1.5 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function clearField(field: ListFilterField) {
  if (field.kind === 'options') field.onChange(null);
  else field.onChange({ start: null, end: null });
}

function FilterChip({ field }: { field: ListFilterField }) {
  const [open, setOpen] = useState(false);
  const value = describeFieldValue(field);
  return (
    <span className="inline-flex items-center overflow-hidden rounded-lg border border-border bg-card">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(CHIP_BUTTON, 'pl-3 pr-2')}
            aria-label={`${field.label}: ${value}. Change`}
          >
            <span className="text-muted-foreground">{field.label}:</span>
            <span className="max-w-[16rem] truncate font-semibold">{value}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-1">
          <FilterFieldEditor field={field} onDone={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={`Remove ${field.label.toLowerCase()} filter`}
        onClick={() => clearField(field)}
        className={cn(CHIP_BUTTON, 'w-11 justify-center border-l border-border')}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </span>
  );
}

function AddFilterMenu({ fields }: { fields: ListFilterField[] }) {
  const [open, setOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const editing = fields.find(field => field.key === editingKey) ?? null;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setEditingKey(null);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            CHIP_BUTTON,
            'rounded-lg border border-dashed border-border px-3 text-muted-foreground'
          )}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Filter
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        {editing ? (
          <>
            <button
              type="button"
              onClick={() => setEditingKey(null)}
              className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              {editing.label}
            </button>
            <FilterFieldEditor field={editing} onDone={() => handleOpenChange(false)} />
          </>
        ) : (
          <div role="group" aria-label="Filter by" className="flex flex-col py-1">
            {fields.map(field => (
              <button
                key={field.key}
                type="button"
                onClick={() => setEditingKey(field.key)}
                className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {field.label}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
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
  const active = fields.filter(isFieldActive);
  const available = fields.filter(field => !isFieldActive(field));
  const anythingActive = active.length > 0 || searchValue.trim() !== '';

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <SearchBar
        value={searchValue}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        size="sm"
        className="w-full sm:w-72 lg:w-80"
      />
      {active.map(field => (
        <FilterChip key={field.key} field={field} />
      ))}
      {available.length > 0 && <AddFilterMenu fields={available} />}
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
