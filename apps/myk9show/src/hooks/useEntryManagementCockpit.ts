import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import {
  buildShowRegistrationPage,
  countShowRegistrationQueueUnion,
  getScopedShowRegistrationQueueCounts,
  getShowRegistrationQueueCounts,
  summarizeShowRegistrationTotals,
  getVisiblePageSelectionState,
  scopeShowRegistrationGroups,
  type ShowRegistrationGroup,
  type ShowRegistrationQueue,
} from '@/components/entries/management/showRegistrationProjection';
import {
  countListedForms,
  deriveDefaultQueues,
} from '@/components/entries/management/entryQueueDefault';
import {
  writeCockpitException,
  writeCockpitFocus,
  writeCockpitQueues,
  writeCockpitScope,
  writeCockpitSearch,
  writeCockpitTab,
  type EntryManagementCockpitTab,
  type EntryManagementCockpitState,
  type EntryManagementException,
} from '@/components/entries/management/entryManagementCockpitParams';

interface UseEntryManagementCockpitOptions {
  groups: ShowRegistrationGroup[];
  state: EntryManagementCockpitState;
  trialClassIds?: readonly string[] | undefined;
  canValidateFocus?: boolean;
}

const getGroupKey = (group: ShowRegistrationGroup) => group.groupKey;
const PRE_LOAD_DEFAULT_QUEUES = deriveDefaultQueues(null);

/** The same array while its contents are the same, so a caller that rebuilds state each render
 * does not recompute every count. */
function useStableList<T>(list: readonly T[]): readonly T[] {
  const key = JSON.stringify(list);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => list, [key]);
}

export function useEntryManagementCockpit({
  groups,
  state: urlState,
  trialClassIds,
  canValidateFocus = true,
}: UseEntryManagementCockpitOptions) {
  const [, setSearchParams] = useSearchParams();
  const classIds = useStableList(urlState.classIds);
  const scopedTrialClassIds = urlState.trialIds.length > 0 ? trialClassIds : undefined;
  // THE one place the default queue is decided (MYK9-1276): when the URL names no queue, the
  // default is decided ONCE per scope, from the first loaded forms (All when Needs review would
  // list nothing and All has forms), and kept until the scope or the show changes. Arrivals,
  // refreshes and load errors never flip it, so the open form and ticked rows stay put; the
  // Needs review count in the Show menu still rises. Until the forms have loaded the default is
  // Needs review. `cockpit.state.queues` stays the single source of queue state, and the
  // decided default is never written to the URL.
  const scopeKey = [
    urlState.tab,
    urlState.exception,
    urlState.search,
    urlState.trialIds.join(','),
    urlState.classIds.join(','),
  ].join('|');
  const showId = groups[0]?.entries[0]?.showId ?? null;
  const [landing, setLanding] = useState<{
    scopeKey: string;
    showId: string | null;
    queues: readonly ShowRegistrationQueue[];
  } | null>(null);
  const landingFits =
    landing !== null &&
    landing.scopeKey === scopeKey &&
    (showId === null || landing.showId === showId);
  // Decided only on loaded forms, and on a trial's classes once they are known: a landing taken
  // before either would be kept for the whole scope.
  const scopeIsKnown = urlState.trialIds.length === 0 || trialClassIds !== undefined;
  if (!urlState.queuesNamed && canValidateFocus && scopeIsKnown && !landingFits) {
    setLanding({
      scopeKey,
      showId,
      queues: deriveDefaultQueues(
        countListedForms(groups, {
          search: urlState.search,
          classIds,
          trialClassIds: scopedTrialClassIds,
        })
      ),
    });
  }
  const defaultQueues = urlState.queuesNamed
    ? urlState.queues
    : landingFits && landing
      ? landing.queues
      : PRE_LOAD_DEFAULT_QUEUES;
  const state = useMemo(
    () => ({ ...urlState, queues: [...defaultQueues] }),
    [urlState, defaultQueues]
  );
  // A search lists its matches whatever the queue, so the queue is not part of the view then.
  const viewKey = [
    state.tab,
    state.exception,
    state.search.trim() ? '' : state.queues.join(','),
    state.search,
    state.trialIds.join(','),
    state.classIds.join(','),
  ].join('|');
  const queues = useStableList(state.queues);
  const [pageState, setPageState] = useState({ viewKey, pageIndex: 0 });
  if (pageState.viewKey !== viewKey) {
    setPageState({ viewKey, pageIndex: 0 });
  }
  const pageIndex = pageState.viewKey === viewKey ? pageState.pageIndex : 0;
  const builtPage = useMemo(
    () =>
      buildShowRegistrationPage(groups, {
        queues,
        search: state.search,
        classIds,
        // Scope by trial ONLY when the trials' class ids are actually known.
        // `trialClassIds` is `undefined` when a classes query is pending,
        // paused (offline) or errored; passing `[]` there is an empty
        // allowlist, which filters every registration out and reports zero as
        // fact. Omitting the key leaves the groups unscoped, and the cockpit
        // renders an explicit "scope unavailable" notice instead.
        ...(scopedTrialClassIds ? { trialClassIds: scopedTrialClassIds } : {}),
        pageIndex,
      }),
    [groups, pageIndex, classIds, queues, state.search, scopedTrialClassIds]
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
        : getScopedShowRegistrationQueueCounts(groups, classIds, scopedTrialClassIds),
    [groups, classIds, state.search, scopedTrialClassIds]
  );
  // The Show: trigger's number: distinct forms in the checked queues, on the same basis as the
  // per-queue counts above (settled rule 8), so it never reads as their sum.
  const queueSelectionCount = useMemo(
    () =>
      countShowRegistrationQueueUnion(
        state.search ? groups : scopeShowRegistrationGroups(groups, classIds, scopedTrialClassIds),
        queues
      ),
    [groups, classIds, queues, state.search, scopedTrialClassIds]
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
  const queueTotalsDescribeWholeShow =
    !state.search && state.classIds.length === 0 && state.trialIds.length === 0;
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
    queueSelectionCount,
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
    /** The checked registration queues; switches back from an exception list if one is open. */
    setQueues: (queues: readonly ShowRegistrationQueue[]) =>
      updateParams(previous =>
        writeCockpitQueues(writeCockpitTab(previous, 'registrations'), queues)
      ),
    setSearch: (search: string) => updateParams(previous => writeCockpitSearch(previous, search)),
    // Focus changes are navigable work steps. Push them into history so browser
    // Back/Forward can move between focused registrations without losing scope.
    setFocus: (registrationKey: string | null) =>
      setSearchParams(previous => writeCockpitFocus(previous, registrationKey), {
        preventScrollReset: true,
      }),
    setScope: (trialIds: readonly string[], classIds: readonly string[]) =>
      updateParams(previous => writeCockpitScope(previous, trialIds, classIds)),
    setTab: (tab: EntryManagementCockpitTab) =>
      updateParams(previous => writeCockpitTab(previous, tab)),
    setException: (exception: EntryManagementException) =>
      updateParams(previous => writeCockpitException(previous, exception)),
  };
}
