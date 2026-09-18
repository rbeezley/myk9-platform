import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import {
  buildShowRegistrationPage,
  getScopedShowRegistrationQueueCounts,
  getShowRegistrationQueueCounts,
  summarizeShowRegistrationTotals,
  getVisiblePageSelectionState,
  type ShowRegistrationGroup,
  type ShowRegistrationQueue,
} from '@/components/entries/management/showRegistrationProjection';
import {
  writeCockpitDensity,
  writeCockpitException,
  writeCockpitFocus,
  writeCockpitQueue,
  writeCockpitScope,
  writeCockpitSearch,
  writeCockpitTab,
  type EntryManagementCockpitTab,
  type EntryManagementCockpitState,
  type EntryManagementException,
} from '@/components/entries/management/entryManagementCockpitParams';
import type { OperationalViewDensity } from '@/features/operational-views/operationalViews';

interface UseEntryManagementCockpitOptions {
  groups: ShowRegistrationGroup[];
  state: EntryManagementCockpitState;
  trialClassIds?: readonly string[] | undefined;
  canValidateFocus?: boolean;
}

const getGroupKey = (group: ShowRegistrationGroup) => group.groupKey;

export function useEntryManagementCockpit({
  groups,
  state,
  trialClassIds,
  canValidateFocus = true,
}: UseEntryManagementCockpitOptions) {
  const [, setSearchParams] = useSearchParams();
  const viewKey = `${state.tab}|${state.exception}|${state.queue}|${state.search}|${state.trialId ?? ''}|${state.classId ?? ''}`;
  const [pageState, setPageState] = useState({ viewKey, pageIndex: 0 });
  if (pageState.viewKey !== viewKey) {
    setPageState({ viewKey, pageIndex: 0 });
  }
  const pageIndex = pageState.viewKey === viewKey ? pageState.pageIndex : 0;
  const builtPage = useMemo(
    () =>
      buildShowRegistrationPage(groups, {
        queue: state.queue,
        search: state.search,
        classId: state.classId,
        // Scope by trial ONLY when the trial's class ids are actually known.
        // `trialClassIds` is `undefined` when the classes query is pending,
        // paused (offline) or errored; passing `[]` there is an empty
        // allowlist, which filters every registration out and reports zero as
        // fact. Omitting the key leaves the groups unscoped, and the cockpit
        // renders an explicit "scope unavailable" notice instead.
        ...(state.trialId && trialClassIds ? { trialClassIds } : {}),
        pageIndex,
      }),
    [groups, pageIndex, state.classId, state.queue, state.search, state.trialId, trialClassIds]
  );
  const selection = useBulkSelection({
    items: builtPage.effectiveGroups,
    getItemId: getGroupKey,
    pruneToItems: true,
    resetKey: viewKey,
  });
  const visibleSelection = getVisiblePageSelectionState(
    builtPage.page.items,
    selection.selectedIds
  );
  const toggleVisiblePage = useCallback(() => {
    if (visibleSelection.allSelected) selection.deselectItems(builtPage.page.items);
    else selection.selectItems(builtPage.page.items);
  }, [builtPage.page.items, selection, visibleSelection.allSelected]);
  const queueCounts = useMemo(
    () =>
      state.search
        ? getShowRegistrationQueueCounts(groups)
        : getScopedShowRegistrationQueueCounts(
            groups,
            state.classId,
            state.trialId && trialClassIds ? trialClassIds : undefined
          ),
    [groups, state.classId, state.search, state.trialId, trialClassIds]
  );
  // WHOLE-SHOW totals, and said so only when they are true of what is on
  // screen (MYK9-635). A scope cannot be applied to them honestly: the class
  // filter keeps whole REGISTRATIONS whose entries touch the class, so summing
  // `entryCount` over them counts entries in other classes too -- one
  // registration with e1 in class-a and e2 in class-b, scoped to class-a, reads
  // "1 registration, 2 entries". Search is worse: the chip counts already fall
  // back to the whole show. Rather than print a number that is wrong for the
  // current view -- which IS the bug this line exists to fix -- the line is
  // withheld while a scope or a search is active. The chips and the queue's own
  // "Showing X-Y of N" describe the filtered view.
  const queueTotals = useMemo(() => summarizeShowRegistrationTotals(groups), [groups]);
  const queueTotalsDescribeWholeShow = !state.search && !state.classId && !state.trialId;
  const focusedGroup =
    builtPage.effectiveGroups.find(group => group.groupKey === state.registrationKey) ??
    builtPage.page.items[0] ??
    null;
  const focusedGroupIsVisible =
    !state.registrationKey ||
    builtPage.effectiveGroups.some(group => group.groupKey === state.registrationKey);

  useEffect(() => {
    if (!canValidateFocus || focusedGroupIsVisible) return;
    setSearchParams(previous => writeCockpitFocus(previous, null), {
      replace: true,
      preventScrollReset: true,
    });
  }, [canValidateFocus, focusedGroupIsVisible, setSearchParams]);

  const updateParams = useCallback(
    (writer: (previous: URLSearchParams) => URLSearchParams) => {
      setSearchParams(previous => writer(previous), { replace: true, preventScrollReset: true });
    },
    [setSearchParams]
  );

  return {
    state,
    groups,
    queueCounts,
    queueTotals,
    queueTotalsDescribeWholeShow,
    page: builtPage.page,
    effectiveGroups: builtPage.effectiveGroups,
    matchingEntryIdsByGroup: builtPage.matchingEntryIdsByGroup,
    focusedGroup,
    selection: {
      ...selection,
      isAllSelected: visibleSelection.allSelected,
      isPartiallySelected: visibleSelection.partiallySelected,
      toggleAll: toggleVisiblePage,
    },
    setPageIndex: (nextPageIndex: number) => setPageState({ viewKey, pageIndex: nextPageIndex }),
    setQueue: (queue: ShowRegistrationQueue) =>
      updateParams(previous => writeCockpitQueue(previous, queue)),
    setSearch: (search: string) => updateParams(previous => writeCockpitSearch(previous, search)),
    // Focus changes are navigable work steps. Push them into history so browser
    // Back/Forward can move between focused registrations without losing scope.
    setFocus: (registrationKey: string | null) =>
      setSearchParams(previous => writeCockpitFocus(previous, registrationKey), {
        preventScrollReset: true,
      }),
    setScope: (trialId: string | null, classId: string | null = null) =>
      updateParams(previous => writeCockpitScope(previous, trialId, classId)),
    setTab: (tab: EntryManagementCockpitTab) =>
      updateParams(previous => writeCockpitTab(previous, tab)),
    setException: (exception: EntryManagementException) =>
      updateParams(previous => writeCockpitException(previous, exception)),
    setDensity: (density: OperationalViewDensity) =>
      updateParams(previous => writeCockpitDensity(previous, density)),
  };
}
