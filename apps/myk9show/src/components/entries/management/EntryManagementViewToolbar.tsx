/**
 * The Entries tab toolbar (docs/plan-entries-filter-button.md): the "Show:" menu of queues and
 * lists, a quiet search, one Filter button for Trial and Class, the applied filters as plain
 * sentences, and the result line. The three exception views (Waitlist, Pulls, Move-ups) render
 * their own search inside their own component, so only Show: is drawn here for them.
 */
import { useMemo, useRef, type ReactNode } from 'react';
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
import { EntryManagementShowMenu } from './EntryManagementShowMenu';
import { countFormsByTrialAndClass } from './entryManagementFilterCounts';
import { buildEntryManagementFilterFields } from './entryManagementFilterFields';

type Cockpit = ReturnType<typeof useEntryManagementCockpit>;
type TrialClasses = ReturnType<typeof useEntryManagementTrialClasses>;

interface EntryManagementViewToolbarProps {
  cockpit: Pick<
    Cockpit,
    | 'state'
    | 'groups'
    | 'queueCounts'
    | 'queueSelectionCount'
    | 'setQueues'
    | 'setException'
    | 'setScope'
    | 'setSearch'
  >;
  exceptionCounts: { pulls: number; moveUps: number | undefined };
  trials: readonly EntryManagementTrial[];
  trialsLoaded: boolean;
  classes: Pick<
    TrialClasses,
    'trialClasses' | 'classesLoaded' | 'classById' | 'classTrialById' | 'knownClassIds'
  >;
  onClearAll: () => void;
  /** Registrations on screen after every filter, and in the show's whole queue. */
  /** Null until the entries have loaded successfully: no sentence before then. */
  result: { shown: number; total: number } | null;
  /** Page-level actions (Add Entry, More), beside the controls instead of in a title row. */
  actions?: ReactNode;
}

export function EntryManagementViewToolbar({
  cockpit,
  exceptionCounts,
  trials,
  trialsLoaded,
  classes,
  onClearAll,
  result,
  actions,
}: EntryManagementViewToolbarProps) {
  const { state } = cockpit;
  const isRegistrationsView = state.tab === 'registrations';
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
    classById: classes.classById,
    allClassesLoaded: classes.knownClassIds !== undefined,
    classTrialById: classes.classTrialById,
    counts: filterCounts,
    onScopeChange: cockpit.setScope,
  });
  // From lg: Show:, search and Filter on one row, and the count only once the list is narrowed,
  // because the queue is the work. On a phone or tablet the one row does not fit, so they stack.
  const singleRow = useMediaQuery(MASTER_DETAIL_QUERY);
  const filtered =
    state.search.trim() !== '' ||
    !(state.queues.length === 1 && state.queues[0] === 'all') ||
    state.trialIds.length > 0 ||
    state.classIds.length > 0;

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1 basis-[22rem]">
        <ListToolbarLayout
          compact={singleRow}
          viewTabs={
            <EntryManagementShowMenu
              state={state}
              counts={{ queueCounts: cockpit.queueCounts, ...exceptionCounts }}
              selectionCount={cockpit.queueSelectionCount}
              onQueuesChange={cockpit.setQueues}
              onSelectException={cockpit.setException}
              compact={singleRow}
            />
          }
          filterBar={
            isRegistrationsView ? (
              // From lg the search is a fixed-width field, so this group keeps its width and a long
              // Show: summary truncates instead of sliding over the Filter button.
              <div className="flex min-w-0 flex-1 items-center gap-2 lg:flex-none">
                <ListSearchField
                  value={state.search}
                  onChange={cockpit.setSearch}
                  placeholder="Search exhibitor, dog, handler, armband, confirmation, class…"
                />
                <ListFilterMenu fields={filterFields} triggerRef={filterButtonRef} />
              </div>
            ) : null
          }
          appliedFilters={
            isRegistrationsView ? (
              <ListAppliedFilters
                fields={filterFields}
                onClearAll={onClearAll}
                alsoNarrowed={state.search.trim() !== ''}
                focusTargetRef={filterButtonRef}
              />
            ) : null
          }
          resultLine={
            isRegistrationsView && result ? (
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
      {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
    </div>
  );
}
