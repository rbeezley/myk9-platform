import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { FilterPill } from './FilterPill';
import { SortPill } from './SortPill';
import { isFilterActive } from './types';
import type { FilterBarProps, FilterDefinition, FilterValue } from './types';

/** Get default value for a new filter. Select/multi-select start empty so the
 *  user picks before the filter applies — see `pendingDef` below. */
function defaultValue(def: FilterDefinition): FilterValue {
  switch (def.type) {
    case 'multi-select':
      return [];
    case 'boolean':
      return true;
    case 'text':
      return '';
    case 'select':
      return '';
  }
}

export function FilterBar({
  filterDefs,
  sortDefs,
  state,
  onStateChange,
  className,
}: FilterBarProps) {
  const [addFilterOpen, setAddFilterOpen] = useState(false);
  // Pill that the user just added but hasn't picked a value for yet. Tracked
  // locally (not in onStateChange filters) so the consumer's filter logic
  // doesn't see a half-built filter.
  const [pendingDef, setPendingDef] = useState<FilterDefinition | null>(null);

  const activeFilterKeys = new Set(
    Object.keys(state.filters).filter(k => isFilterActive(state.filters[k]))
  );

  // Filters available to add (not yet active and not currently pending)
  const availableToAdd = filterDefs.filter(
    d => !activeFilterKeys.has(d.key) && d.key !== pendingDef?.key
  );

  const handleFilterChange = (key: string, value: FilterValue) => {
    onStateChange({
      ...state,
      filters: { ...state.filters, [key]: value },
    });
  };

  const handleRemoveFilter = (key: string) => {
    const next = { ...state.filters };
    delete next[key];
    onStateChange({ ...state, filters: next });
  };

  const handleAddFilter = (def: FilterDefinition) => {
    setAddFilterOpen(false);
    // For select/multi-select, don't apply a value yet — show a pending pill
    // and auto-open it so the user picks. For boolean/text, the natural
    // default ("Yes" / empty) applies immediately.
    if (def.type === 'select' || def.type === 'multi-select') {
      setPendingDef(def);
      return;
    }
    onStateChange({
      ...state,
      filters: { ...state.filters, [def.key]: defaultValue(def) },
    });
  };

  const handlePendingChange = (value: FilterValue) => {
    if (!pendingDef) return;
    setPendingDef(null);
    if (!isFilterActive(value)) return;
    onStateChange({
      ...state,
      filters: { ...state.filters, [pendingDef.key]: value },
    });
  };

  const handlePendingRemove = () => setPendingDef(null);

  const handleClearAll = () => {
    onStateChange({ ...state, filters: {} });
  };

  const hasFilters = activeFilterKeys.size > 0;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {/* Active filter pills */}
      {filterDefs
        .filter(d => activeFilterKeys.has(d.key))
        .map(def => (
          <FilterPill
            key={def.key}
            definition={def}
            value={state.filters[def.key]}
            onChange={value => handleFilterChange(def.key, value)}
            onRemove={() => handleRemoveFilter(def.key)}
          />
        ))}

      {/* Pending pill (just added, awaiting first value) */}
      {pendingDef && (
        <FilterPill
          key={`pending-${pendingDef.key}`}
          definition={pendingDef}
          value={defaultValue(pendingDef)}
          onChange={handlePendingChange}
          onRemove={handlePendingRemove}
          defaultOpen
        />
      )}

      {/* Sort pill */}
      {sortDefs && sortDefs.length > 0 && (
        <SortPill
          sortDefs={sortDefs}
          activeKey={state.sortKey}
          direction={state.sortDirection}
          onSort={(key, dir) =>
            onStateChange({
              ...state,
              sortKey: key,
              sortDirection: dir || state.sortDirection,
            })
          }
        />
      )}

      {/* Add filter button */}
      {availableToAdd.length > 0 && (
        <Popover open={addFilterOpen} onOpenChange={setAddFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-haspopup="listbox"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              <Plus className="h-3 w-3" />
              Filter
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <div className="space-y-0.5">
              {availableToAdd.map(def => {
                const Icon = def.icon;
                return (
                  <button
                    key={def.key}
                    type="button"
                    onClick={() => handleAddFilter(def)}
                    className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-muted text-foreground transition-colors"
                  >
                    {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                    {def.label}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Clear all */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearAll}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
        >
          <X className="h-3 w-3" />
          Clear all
        </Button>
      )}
    </div>
  );
}
