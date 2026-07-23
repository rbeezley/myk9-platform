import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import {
  buildShowRegistrationPage,
  getScopedShowRegistrationQueueCounts,
  getShowRegistrationQueueCounts,
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
  trialClassIds?: readonly string[];
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
        ...(state.trialId ? { trialClassIds: trialClassIds ?? [] } : {}),
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
            state.trialId ? (trialClassIds ?? []) : undefined
          ),
    [groups, state.classId, state.search, state.trialId, trialClassIds]
  );
  const focusedGroup =
    builtPage.effectiveGroups.find(group => group.groupKey === state.registrationKey) ??
    builtPage.page.items[0] ??
    null;
  const focusedGroupIsVisible =
    !state.registrationKey ||
    builtPage.effectiveGroups.some(group => group.groupKey === state.registrationKey);

  useEffect(() => {
    if (!canValidateFocus || focusedGroupIsVisible) return;
    setSearchParams(previous => writeCockpitFocus(previous, null), { replace: true });
  }, [canValidateFocus, focusedGroupIsVisible, setSearchParams]);

  const updateParams = useCallback(
    (writer: (previous: URLSearchParams) => URLSearchParams) => {
      setSearchParams(previous => writer(previous), { replace: true });
    },
    [setSearchParams]
  );

  return {
    state,
    groups,
    queueCounts,
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
      setSearchParams(previous => writeCockpitFocus(previous, registrationKey)),
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
