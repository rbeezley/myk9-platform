import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { SearchBar } from './SearchBar';
import { FilterChips, type FilterDefinition } from './FilterChips';
import { ViewToggle, type ViewMode } from './ViewToggle';
import { ResultsCount } from './ResultsCount';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { cn } from '@/lib/utils';

export interface ListControlsProps {
  /** Search box value + handler. */
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;

  /** Filter chip definitions, active values, and change handler (FilterChips contract). */
  filters: FilterDefinition[];
  filterValues: Record<string, string>;
  onFilterChange: (key: string, value: string | null) => void;

  /**
   * View-mode toggle. Defaults to the standard cards/table pair. Omit both
   * (or set `hideViewToggle`) for card-only surfaces such as the exhibitor
   * My Dogs view — see design.md D3.
   */
  viewMode?: string;
  onViewModeChange?: (mode: string) => void;
  viewModes?: readonly ViewMode[];

  /** Result count summary (pluralize `entityName` at the call site). */
  resultsShowing: number;
  resultsTotal: number;
  filtered?: boolean;
  entityName: string;
  hideViewToggle?: boolean;

  className?: string;
}

/**
 * ListControls — the single, standard toolbar for core browse pages.
 *
 * One compact row: a small search box, inline filter chips, and the view-mode
 * toggle pinned to the right; the result count sits just beneath. Adopting this
 * everywhere (Dogs, People, Clubs, Shows) means the user learns search +
 * filter + view-switch exactly once.
 *
 * INTENT: search stays compact on desktop so filter chips get room to breathe,
 * but uses full width on phones so the toolbar does not clip. PR #791 fixed the
 * old Tailwind emission-order issue that made `w-full sm:w-NN` unsafe.
 */
export function ListControls({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters,
  filterValues,
  onFilterChange,
  viewMode,
  onViewModeChange,
  viewModes = CARD_TABLE_MODES,
  resultsShowing,
  resultsTotal,
  filtered = false,
  entityName,
  hideViewToggle = false,
  className,
}: ListControlsProps) {
  const activeFilterCount = Object.values(filterValues).filter(Boolean).length;

  return (
    <div
      className={cn(
        'bg-card/30 border border-border/40 rounded-2xl p-3 space-y-2 backdrop-blur-sm',
        className
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchBar
          size="sm"
          value={search}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          className="w-full shrink-0 sm:w-52"
        />

        {filters.length > 0 && (
          <>
            <FilterChips
              filters={filters}
              values={filterValues}
              onChange={onFilterChange}
              className="hidden sm:flex"
            />
            <MobileFiltersSheet
              filters={filters}
              values={filterValues}
              activeFilterCount={activeFilterCount}
              onChange={onFilterChange}
            />
          </>
        )}

        {!hideViewToggle && viewMode !== undefined && onViewModeChange && (
          <ViewToggle
            modes={viewModes}
            active={viewMode}
            onChange={onViewModeChange}
            className="self-end sm:ml-auto sm:self-auto"
          />
        )}
      </div>

      <ResultsCount
        showing={resultsShowing}
        total={resultsTotal}
        filtered={filtered}
        entityName={entityName}
      />
    </div>
  );
}

interface MobileFiltersSheetProps {
  filters: FilterDefinition[];
  values: Record<string, string>;
  activeFilterCount: number;
  onChange: (key: string, value: string | null) => void;
}

function MobileFiltersSheet({
  filters,
  values,
  activeFilterCount,
  onChange,
}: MobileFiltersSheetProps) {
  const [open, setOpen] = useState(false);

  const handleChange = (key: string, value: string | null) => {
    onChange(key, value);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground shadow-card transition-colors hover:bg-muted sm:hidden"
        aria-label="Open filters"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {activeFilterCount > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
            {activeFilterCount}
          </span>
        )}
      </button>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl pb-8">
        <SheetHeader className="text-left">
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow the list without crowding the page.</SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-5">
          {filters.map(filter => {
            const activeValue = values[filter.key];

            return (
              <section
                key={filter.key}
                className="space-y-2"
                aria-labelledby={`${filter.key}-filter`}
              >
                <h3 id={`${filter.key}-filter`} className="text-sm font-semibold text-foreground">
                  {filter.label}
                </h3>
                <div className="grid gap-2">
                  <button
                    type="button"
                    className={cn(
                      'min-h-11 rounded-lg border px-3 text-left text-sm transition-colors',
                      !activeValue
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card hover:bg-muted'
                    )}
                    onClick={() => handleChange(filter.key, null)}
                  >
                    All {filter.label.toLowerCase()}
                  </button>
                  {filter.options.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        'min-h-11 rounded-lg border px-3 text-left text-sm transition-colors',
                        activeValue === option.value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card hover:bg-muted'
                      )}
                      onClick={() => handleChange(filter.key, option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
