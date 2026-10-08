import type { ReactNode } from 'react';

interface ListToolbarLayoutProps {
  /** Beside an open record: search and view on one row, so the pane's rows start higher. */
  compact: boolean;
  viewTabs: ReactNode;
  filterBar: ReactNode;
  /** The applied-filter sentences (`ListAppliedFilters`), between the controls and the count. */
  appliedFilters?: ReactNode;
  resultLine: ReactNode;
}

/**
 * How a list's view tabs, filter bar and result line stack — the one arrangement every
 * master-detail list shares. Each list supplies the three toolkit pieces configured with its own
 * fields and passes `compact` to them too. A list on the Filter button also passes its applied
 * filters; the others leave `appliedFilters` out and nothing changes for them.
 */
export function ListToolbarLayout({
  compact,
  viewTabs,
  filterBar,
  appliedFilters,
  resultLine,
}: ListToolbarLayoutProps) {
  return (
    <div className="flex flex-col gap-3">
      {compact ? (
        <div className="flex items-center gap-2">
          {filterBar}
          {viewTabs}
        </div>
      ) : (
        <>
          {viewTabs}
          {filterBar}
        </>
      )}
      {appliedFilters}
      {resultLine}
    </div>
  );
}
