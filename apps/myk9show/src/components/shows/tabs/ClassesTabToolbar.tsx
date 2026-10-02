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
  /** The right-hand controls (view toggle, Add Classes). */
  actions: ReactNode;
  /** Managers only: the trial being managed, the search box, the element filter and the count. */
  manage?: {
    trials: TrialOption[];
    trialId: string | null;
    onTrialChange: (trialId: string) => void;
    search: string;
    onSearchChange: (value: string) => void;
    elementField: ListOptionsFilterField;
    shown: number;
    total: number;
    narrowed: boolean;
    onClearFilters: () => void;
  };
}

/** Views, then (managers) the trial picker, search, element filter and "N of M classes". */
export function ClassesTabToolbar({
  views,
  activeViewId,
  onSelectView,
  actions,
  manage,
}: ClassesTabToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ListViewTabs
          label="Class views"
          views={views}
          activeId={activeViewId}
          onSelect={onSelectView}
        />
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>
      </div>
      {manage && (
        <>
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
          <ListResultLine
            ready
            shown={manage.shown}
            total={manage.total}
            noun={CLASS_NOUN}
            filtered={manage.narrowed}
            onShowAll={manage.onClearFilters}
          />
        </>
      )}
    </div>
  );
}
