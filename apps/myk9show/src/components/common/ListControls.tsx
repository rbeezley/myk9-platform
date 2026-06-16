import { SearchBar } from './SearchBar';
import { FilterChips, type FilterDefinition } from './FilterChips';
import { ViewToggle, type ViewMode } from './ViewToggle';
import { ResultsCount } from './ResultsCount';
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

  /** View-mode toggle. Defaults to the standard cards/table pair. */
  viewMode: string;
  onViewModeChange: (mode: string) => void;
  viewModes?: readonly ViewMode[];

  /** Result count summary (pluralize `entityName` at the call site). */
  resultsShowing: number;
  resultsTotal: number;
  filtered?: boolean;
  entityName: string;

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
 * INTENT: search stays deliberately narrow — browse queries are short — so
 * filter chips get the room to breathe. On mobile the search takes its own row
 * and the rest wraps below it.
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
  className,
}: ListControlsProps) {
  return (
    <div
      className={cn(
        'bg-card/30 border border-border/40 rounded-2xl p-3 space-y-2 backdrop-blur-sm',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar
          size="sm"
          value={search}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          className="w-full sm:w-48"
        />

        {filters.length > 0 && (
          <FilterChips filters={filters} values={filterValues} onChange={onFilterChange} />
        )}

        <ViewToggle
          modes={viewModes}
          active={viewMode}
          onChange={onViewModeChange}
          className="ml-auto"
        />
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
