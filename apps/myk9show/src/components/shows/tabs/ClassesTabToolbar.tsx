import type { ReactNode } from 'react';
import {
  ListFilterBar,
  ListResultLine,
  ListViewTabs,
  type ListView,
} from '@/components/list-toolkit';

const CLASS_NOUN = ['class', 'classes'] as const;

interface ClassesTabToolbarProps {
  views: ListView[];
  activeViewId: string | null;
  onSelectView: (id: string) => void;
  /** The "Showing N of M classes" sentence, for every reader. */
  result: {
    shown: number;
    total: number;
    narrowed: boolean;
    onClearFilters: () => void;
    /** The empty state below already offers "Show all". */
    showAllInEmptyState: boolean;
  };
  /** The view toggle, shown on the right of the result line. */
  viewToggle: ReactNode;
  /** The one search box. */
  search: { value: string; onChange: (value: string) => void };
}

/** Views, then the search, then the result line. */
export function ClassesTabToolbar({
  views,
  activeViewId,
  onSelectView,
  result,
  viewToggle,
  search,
}: ClassesTabToolbarProps) {
  return (
    <div className="space-y-3">
      <ListViewTabs
        label="Class views"
        views={views}
        activeId={activeViewId}
        onSelect={onSelectView}
      />
      <div className="flex flex-wrap items-center gap-3">
        <ListFilterBar
          className="min-w-0 flex-1"
          searchValue={search.value}
          onSearchChange={search.onChange}
          searchPlaceholder="Search classes..."
          fields={[]}
        />
      </div>
      <ListResultLine
        ready
        shown={result.shown}
        total={result.total}
        noun={CLASS_NOUN}
        filtered={result.narrowed}
        onShowAll={result.onClearFilters}
        showAllInEmptyState={result.showAllInEmptyState}
      >
        {viewToggle}
      </ListResultLine>
    </div>
  );
}
