import type { ReactNode } from 'react';

interface ListToolbarLayoutProps {
  /** Beside an open record: search and view on one row, so the pane's rows start higher. */
  compact: boolean;
  viewTabs: ReactNode;
  filterBar: ReactNode;
  resultLine: ReactNode;
}

/**
 * How a list's view tabs, filter bar and result line stack — the one arrangement every
 * master-detail list shares. Each list supplies the three toolkit pieces configured with its own
 * fields and passes `compact` to them too.
 */
export function ListToolbarLayout({
  compact,
  viewTabs,
  filterBar,
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
      {resultLine}
    </div>
  );
}
