/**
 * The Filter button (docs/plan-entries-filter-button.md): one labelled button that opens a
 * searchable menu of the page's fields, each with its values and live counts. Several values of a
 * multi-select field can be ticked; the menu stays open while you pick. `F` opens it.
 *
 * Which fields exist is the page's call (`fields`); the menu shows only those. What is applied is
 * drawn elsewhere, as plain sentences (`describeAppliedFilter`).
 */

import { useCallback, useState } from 'react';
import { Check, ListFilter } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { isFieldActive, toggleListValue } from './filterFieldState';
import type { ListFilterMenuField, ListFilterOption } from './types';
import { useListFilterShortcut } from './useListFilterShortcut';

interface ListFilterMenuProps {
  fields: ListFilterMenuField[];
  className?: string;
}

function isPicked(field: ListFilterMenuField, option: ListFilterOption): boolean {
  return field.kind === 'multiOptions'
    ? field.values.includes(option.value)
    : field.value === option.value;
}

function pick(field: ListFilterMenuField, option: ListFilterOption): void {
  if (field.kind === 'multiOptions') {
    field.onChange(toggleListValue(field.values, option.value));
  } else {
    field.onChange(field.value === option.value ? null : option.value);
  }
}

function FieldGroup({ field }: { field: ListFilterMenuField }) {
  const loading = field.kind === 'multiOptions' && field.loading === true;
  return (
    <CommandGroup heading={field.label}>
      {loading && <p className="px-2 py-2 text-sm text-muted-foreground">Loading…</p>}
      {!loading && field.options.length === 0 && (
        <p className="px-2 py-2 text-sm text-muted-foreground">Nothing to choose yet.</p>
      )}
      {!loading &&
        field.options.map(option => {
          const picked = isPicked(field, option);
          return (
            <CommandItem
              key={option.value}
              value={`${field.key}:${option.value}`}
              keywords={[option.label, field.label]}
              onSelect={() => pick(field, option)}
              className="min-h-11 gap-3 px-3"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center border',
                  field.kind === 'multiOptions' ? 'rounded-sm' : 'rounded-full',
                  picked
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/60'
                )}
              >
                {picked && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {picked && <span className="sr-only">Selected</span>}
              {option.count !== undefined && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {option.count.toLocaleString()}
                </span>
              )}
            </CommandItem>
          );
        })}
    </CommandGroup>
  );
}

export function ListFilterMenu({ fields, className }: ListFilterMenuProps) {
  const [open, setOpen] = useState(false);
  const toggleOpen = useCallback(() => setOpen(current => !current), []);
  useListFilterShortcut(toggleOpen);
  const applied = fields.filter(isFieldActive).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={applied > 0 ? `Filter, ${applied} applied` : 'Filter'}
          className={cn(
            'inline-flex h-11 items-center gap-2 rounded-lg border border-input px-3 text-sm font-medium',
            'bg-[var(--dialog-input-bg)] shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className
          )}
        >
          <ListFilter className="h-4 w-4" aria-hidden="true" />
          Filter
          {applied > 0 && (
            <span
              aria-hidden="true"
              className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground"
            >
              {applied}
            </span>
          )}
          <kbd
            aria-hidden="true"
            className="hidden rounded border border-border px-1 text-xs text-muted-foreground lg:inline"
          >
            F
          </kbd>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Filter by…" />
          <CommandList className="max-h-[min(24rem,60vh)]">
            <CommandEmpty>No matches.</CommandEmpty>
            {fields.map(field => (
              <FieldGroup key={field.key} field={field} />
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
