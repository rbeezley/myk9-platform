/**
 * Page-level view row for Entry Management (MYK9-795): one `ListViewTabs`
 * replacing the Registrations/Exceptions `PrimaryTabs`, the queue
 * buttons-with-counts, AND the Exceptions sub-tab buttons, plus the
 * `ListFilterBar` for the four registration-queue views (Trial, Class,
 * Payment status, search). The three exception views (Waitlist, Pulls,
 * Move-ups) render their own search-only filter bar inside their own
 * component, so nothing else is rendered here for them.
 */
import type { ReactNode } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MASTER_DETAIL_QUERY } from '@/components/layout/MasterDetailLayout';
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
  onSelectView: (viewId: EntryManagementViewId) => void;
  onScopeChange: (trialId: string | null, classId?: string | null) => void;
  onSearchChange: (value: string) => void;
  onClearAll: () => void;
  /** Registrations on screen after every filter, and in the show's whole queue. */
  /** Null until the entries have loaded successfully: no sentence before then. */
  result: { shown: number; total: number } | null;
  /** Page-level actions (Add Entry, More), beside the controls instead of in a title row. */
  actions?: ReactNode;
}

export function EntryManagementViewToolbar({
  state,
  counts,
  trials,
  trialClasses,
  onSelectView,
  onScopeChange,
  onSearchChange,
  onClearAll,
  result,
  actions,
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
  // From lg: views, search and filters on one row, and the count only once the list is narrowed,
  // because the queue is the work and three stacked rows of controls pushed it below the fold. On a
  // phone or tablet the one row does not fit (the search shrinks to nothing), so the controls stack.
  const singleRow = useMediaQuery(MASTER_DETAIL_QUERY);
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1 basis-[22rem]">
        <ListToolbarLayout
          compact={singleRow}
          viewTabs={
            <ListViewTabs
              label="Entry views"
              views={views}
              activeId={activeId}
              compact={singleRow}
              onSelect={id => onSelectView(id as EntryManagementViewId)}
            />
          }
          filterBar={
            isRegistrationsView ? (
              <ListFilterBar
                searchValue={state.search}
                onSearchChange={onSearchChange}
                searchPlaceholder="Search exhibitor, dog, handler, armband, confirmation, class…"
                fields={filterFields}
                compact={singleRow}
              />
            ) : null
          }
          resultLine={
            isRegistrationsView && result ? (
              <ListResultLine
                shown={result.shown}
                total={result.total}
                noun={['form', 'forms']}
                filtered={
                  state.search.trim() !== '' ||
                  activeId !== 'all' ||
                  state.trialId !== null ||
                  state.classId !== null
                }
                onShowAll={onClearAll}
                quietWhenUnfiltered={singleRow}
              />
            ) : null
          }
        />
      </div>
      {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
    </div>
  );
}
