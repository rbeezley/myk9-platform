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
  className,
}: ListControlsProps) {
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
          <FilterChips filters={filters} values={filterValues} onChange={onFilterChange} />
        )}

        <ViewToggle
          modes={viewModes}
          active={viewMode}
          onChange={onViewModeChange}
          className="self-end sm:ml-auto sm:self-auto"
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
