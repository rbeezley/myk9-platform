/**
 * Page-level view row for Entry Management (MYK9-795): one `ListViewTabs`
 * replacing the Registrations/Exceptions `PrimaryTabs`, the queue
 * buttons-with-counts, AND the Exceptions sub-tab buttons, plus the
 * `ListFilterBar` for the four registration-queue views (Trial, Class,
 * Payment status, search). The three exception views (Waitlist, Pulls,
 * Move-ups) render their own search-only filter bar inside their own
 * component, so nothing else is rendered here for them.
 */
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  ListFilterBar,
  ListResultLine,
  ListToolbarLayout,
  ListViewTabs,
} from '@/components/list-toolkit';
import type {
  EntryManagementTrial,
  EntryManagementTrialClass,
} from '@/hooks/useEntryManagementTrialScope';
import { DensityControl } from '@/features/operational-views/DensityControl';
import type { OperationalViewDensity } from '@/features/operational-views/operationalViews';
import {
  entryManagementViewId,
  type EntryManagementCockpitState,
  type EntryManagementViewId,
} from './entryManagementCockpitParams';
import { buildEntryManagementFilterFields } from './entryManagementFilterFields';
import { buildEntryManagementViews, type EntryManagementViewCounts } from './entryManagementViews';

interface EntryManagementViewToolbarProps {
  state: EntryManagementCockpitState;
  counts: EntryManagementViewCounts;
  trials: readonly EntryManagementTrial[];
  trialClasses: readonly EntryManagementTrialClass[];
  density: OperationalViewDensity;
  onSelectView: (viewId: EntryManagementViewId) => void;
  onScopeChange: (trialId: string | null, classId?: string | null) => void;
  onSearchChange: (value: string) => void;
  onDensityChange: (density: OperationalViewDensity) => void;
  onClearAll: () => void;
  /** Registrations on screen after every filter, and in the show's whole queue. */
  /** Null until the entries have loaded successfully: no sentence before then. */
  result: { shown: number; total: number } | null;
}

export function EntryManagementViewToolbar({
  state,
  counts,
  trials,
  trialClasses,
  density,
  onSelectView,
  onScopeChange,
  onSearchChange,
  onDensityChange,
  onClearAll,
  result,
}: EntryManagementViewToolbarProps) {
  const views = buildEntryManagementViews(counts);
  const activeId = entryManagementViewId(state);
  const isRegistrationsView = state.tab === 'registrations';
  const filterFields = buildEntryManagementFilterFields({
    state,
    trials,
    trialClasses,
    onScopeChange,
  });
  // Views, search and filters on one row, and the count only once the list is narrowed: the queue
  // is the work, and three stacked rows of controls pushed it below the fold.
  return (
    <ListToolbarLayout
      compact
      viewTabs={
        <ListViewTabs
          label="Entry views"
          views={views}
          activeId={activeId}
          compact
          onSelect={id => onSelectView(id as EntryManagementViewId)}
        />
      }
      filterBar={
        isRegistrationsView ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <ListFilterBar
                searchValue={state.search}
                onSearchChange={onSearchChange}
                searchPlaceholder="Search exhibitor, dog, handler, armband, confirmation, class…"
                fields={filterFields}
                compact
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 shrink-0 gap-2"
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden />
                  Density
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto">
                <p className="mb-2 text-sm font-semibold">Registration row density</p>
                <DensityControl density={density} onChange={onDensityChange} />
              </PopoverContent>
            </Popover>
          </div>
        ) : null
      }
      resultLine={
        isRegistrationsView && result ? (
          <ListResultLine
            shown={result.shown}
            total={result.total}
            noun={['registration', 'registrations']}
            filtered={
              state.search.trim() !== '' ||
              activeId !== 'all' ||
              state.trialId !== null ||
              state.classId !== null
            }
            onShowAll={onClearAll}
            quietWhenUnfiltered
          />
        ) : null
      }
    />
  );
}
