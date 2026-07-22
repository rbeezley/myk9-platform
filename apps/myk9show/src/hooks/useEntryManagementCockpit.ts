import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  buildShowRegistrationPage,
  getShowRegistrationQueueCounts,
  groupEntriesByShowRegistration,
  type ShowRegistrationGroup,
  type ShowRegistrationQueue,
} from '@/components/entries/management/showRegistrationProjection';
import {
  normalizeEntryManagementCockpitParams,
  writeCockpitDensity,
  writeCockpitException,
  writeCockpitFocus,
  writeCockpitQueue,
  writeCockpitScope,
  writeCockpitSearch,
  writeCockpitTab,
  type EntryManagementCockpitTab,
  type EntryManagementException,
} from '@/components/entries/management/entryManagementCockpitParams';
import type { OperationalViewDensity } from '@/features/operational-views/operationalViews';

interface UseEntryManagementCockpitOptions {
  entries: EntryManagementEntry[];
  trialClassIds?: readonly string[];
  canValidateFocus: boolean;
}

const getGroupKey = (group: ShowRegistrationGroup) => group.groupKey;

export function useEntryManagementCockpit({
  entries,
  trialClassIds,
  canValidateFocus,
}: UseEntryManagementCockpitOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const groups = useMemo(() => groupEntriesByShowRegistration(entries), [entries]);
  const validRegistrationKeys = useMemo(
    () => new Set(groups.map(group => group.groupKey)),
    [groups]
  );
  const entryToRegistration = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach(group => {
      group.entries.forEach(entry => map.set(entry.id, group.groupKey));
    });
    return map;
  }, [groups]);
  const normalized = useMemo(
    () =>
      normalizeEntryManagementCockpitParams(
        searchParams,
        canValidateFocus ? { validRegistrationKeys, entryToRegistration } : {}
      ),
    [canValidateFocus, entryToRegistration, searchParams, validRegistrationKeys]
  );

  useEffect(() => {
    if (normalized.params.toString() !== searchParams.toString()) {
      setSearchParams(normalized.params, { replace: true });
    }
  }, [normalized.params, searchParams, setSearchParams]);

  const state = normalized.state;
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
  const focusedGroup =
    builtPage.effectiveGroups.find(group => group.groupKey === state.registrationKey) ??
    builtPage.page.items[0] ??
    null;
  const focusedGroupIsVisible =
    !state.registrationKey ||
    builtPage.effectiveGroups.some(group => group.groupKey === state.registrationKey);

  useEffect(() => {
    if (focusedGroupIsVisible) return;
    setSearchParams(previous => writeCockpitFocus(previous, null), { replace: true });
  }, [focusedGroupIsVisible, setSearchParams]);

  const updateParams = useCallback(
    (writer: (previous: URLSearchParams) => URLSearchParams) => {
      setSearchParams(previous => writer(previous), { replace: true });
    },
    [setSearchParams]
  );

  return {
    state,
    groups,
    queueCounts: getShowRegistrationQueueCounts(groups),
    page: builtPage.page,
    effectiveGroups: builtPage.effectiveGroups,
    matchingEntryIdsByGroup: builtPage.matchingEntryIdsByGroup,
    focusedGroup,
    selection,
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
