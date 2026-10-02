import type { ReactNode } from 'react';
import {
  ListFilterBar,
  ListResultLine,
  ListViewTabs,
  type ListOptionsFilterField,
  type ListView,
} from '@/components/list-toolkit';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TrialOption } from './classesTabScope';

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
  };
  /** The view toggle, shown on the right of the result line. */
  viewToggle: ReactNode;
  /** Managers only: the trial being managed, the search box and the element filter. */
  manage?: {
    trials: TrialOption[];
    trialId: string | null;
    onTrialChange: (trialId: string) => void;
    search: string;
    onSearchChange: (value: string) => void;
    elementField: ListOptionsFilterField;
  };
}

/** Views, then (managers) the trial picker, search and element filter, then the result line. */
export function ClassesTabToolbar({
  views,
  activeViewId,
  onSelectView,
  result,
  viewToggle,
  manage,
}: ClassesTabToolbarProps) {
  return (
    <div className="space-y-3">
      <ListViewTabs
        label="Class views"
        views={views}
        activeId={activeViewId}
        onSelect={onSelectView}
      />
      {manage && (
        <div className="flex flex-wrap items-center gap-3">
          {manage.trials.length > 1 && manage.trialId && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground" aria-hidden="true">
                Trial:
              </span>
              <Select
                value={manage.trialId}
                onValueChange={value => value && manage.onTrialChange(value)}
              >
                <SelectTrigger className="min-w-48" aria-label="Trial">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {manage.trials.map(trial => (
                    <SelectItem key={trial.id} value={trial.id}>
                      {trial.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <ListFilterBar
            className="min-w-0 flex-1"
            searchValue={manage.search}
            onSearchChange={manage.onSearchChange}
            searchPlaceholder="Search classes..."
            fields={[manage.elementField]}
          />
        </div>
      )}
      <ListResultLine
        ready
        shown={result.shown}
        total={result.total}
        noun={CLASS_NOUN}
        filtered={result.narrowed}
        onShowAll={result.onClearFilters}
      >
        {viewToggle}
      </ListResultLine>
    </div>
  );
}
