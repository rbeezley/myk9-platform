/**
 * The Entries tab toolbar (docs/plan-entries-filter-button.md): a quiet search, one Filter button
 * for Status, Trial and Class, the applied filters as plain sentences, and the result line.
 * Everything else the page holds is in the header Actions menu (MYK9-1594). The exception lists
 * (Pulls, Move-ups, ...) are their own views and draw no toolbar.
 */
import { useMemo, useRef } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MASTER_DETAIL_QUERY } from '@/components/layout/MasterDetailLayout';
import {
  ListAppliedFilters,
  ListFilterMenu,
  ListResultLine,
  ListSearchField,
  ListToolbarLayout,
} from '@/components/list-toolkit';
import type { useEntryManagementCockpit } from '@/hooks/useEntryManagementCockpit';
import type {
  EntryManagementTrial,
  useEntryManagementTrialClasses,
} from '@/hooks/useEntryManagementTrialScope';
import { countFormsByTrialAndClass } from './entryManagementFilterCounts';
import { buildEntryManagementFilterFields } from './entryManagementFilterFields';

type Cockpit = ReturnType<typeof useEntryManagementCockpit>;
type TrialClasses = ReturnType<typeof useEntryManagementTrialClasses>;

interface EntryManagementViewToolbarProps {
  cockpit: Pick<
    Cockpit,
    'state' | 'groups' | 'queueCounts' | 'setQueues' | 'setScope' | 'setSearch'
  >;
  trials: readonly EntryManagementTrial[];
  trialsLoaded: boolean;
  classes: Pick<
    TrialClasses,
    'trialClasses' | 'classesLoaded' | 'classTrialById' | 'knownClassIds'
  >;
  onClearAll: () => void;
  /**
   * Distinct forms on screen after every filter, and in the whole show (never a sum of queues).
   * Null until the entries have loaded successfully: no sentence before then.
   */
  result: { shown: number; total: number } | null;
}

export function EntryManagementViewToolbar({
  cockpit,
  trials,
  trialsLoaded,
  classes,
  onClearAll,
  result,
}: EntryManagementViewToolbarProps) {
  const { state } = cockpit;
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const entriesLoaded = result !== null;
  const filterCounts = useMemo(
    () =>
      entriesLoaded
        ? countFormsByTrialAndClass(
            cockpit.groups,
            classes.knownClassIds ? classes.classTrialById : undefined
          )
        : null,
    [classes.classTrialById, classes.knownClassIds, cockpit.groups, entriesLoaded]
  );
  const filterFields = buildEntryManagementFilterFields({
    state,
    trials,
    trialsLoaded,
    trialClasses: classes.trialClasses,
    classesLoaded: classes.classesLoaded,
    classTrialById: classes.classTrialById,
    counts: filterCounts,
    onScopeChange: cockpit.setScope,
    queueCounts: cockpit.queueCounts,
    onQueuesChange: cockpit.setQueues,
  });
  // From lg: search and Filter on one row, and the count only once the list is narrowed, because
  // the queue is the work. On a phone or tablet the one row does not fit, so they stack.
  const singleRow = useMediaQuery(MASTER_DETAIL_QUERY);
  const filtered =
    state.search.trim() !== '' ||
    !(state.queues.length === 1 && state.queues[0] === 'all') ||
    state.trialIds.length > 0 ||
    state.classIds.length > 0;

  return (
    <div className="min-w-0">
      <ListToolbarLayout
        compact={singleRow}
        viewTabs={null}
        filterBar={
          // From lg the search is a fixed-width field; below it the group fills the row.
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:flex-none">
            <ListSearchField
              value={state.search}
              onChange={cockpit.setSearch}
              placeholder="Search exhibitor, dog, handler, armband, confirmation, class…"
            />
            <ListFilterMenu fields={filterFields} triggerRef={filterButtonRef} />
          </div>
        }
        appliedFilters={
          <ListAppliedFilters
            fields={filterFields}
            onClearAll={onClearAll}
            alsoNarrowed={state.search.trim() !== ''}
            focusTargetRef={filterButtonRef}
          />
        }
        resultLine={
          result ? (
            <ListResultLine
              shown={result.shown}
              total={result.total}
              noun={['form', 'forms']}
              filtered={filtered}
              onShowAll={onClearAll}
              quietWhenUnfiltered={singleRow}
            />
          ) : null
        }
      />
    </div>
  );
}
