/**
 * AtShowCombinedEntryListPage — host shim for the COMBINED Novice Section A/B
 * entry list (AKC Scent Work Novice runs A + B together, places them
 * separately). Mounts `@myk9/ringside`'s `EntryListPage` in combined mode.
 *
 * It used to mount a second page, `CombinedEntryListPage`. MYK9-260 collapsed
 * the two: every difference between them was a divergence rather than a design
 * choice, and each one was invisible to typecheck, lint and the whole test
 * suite. This shim now builds the SAME bags the single-class shim builds --
 * `useAtShowEntryListUiState` and `useAtShowEntryListHandlers` -- so a
 * behaviour can no longer exist on one route and not the other.
 *
 * What genuinely differs, and is therefore all this file still owns:
 *  - `useEntryListData({ classIdA, classIdB })` → fetchCombinedClasses
 *  - `useEntryListFilters({ supportSectionFilter: true })` → the
 *    All / Section A / Section B tabs + counts, sorted 'section-armband'
 *  - `handleApplyRunOrder` → `applyCombinedRunOrder`, the one handler that
 *    honours the A/B `scope` + `renumberMode` contract
 *  - `buildScoreSheetState` → carries the PAIRED classId to the scoresheet
 *
 * Run order persists offline-first through the replication layer (same RLS /
 * `ringside_update_entry` routing as the single-class shim) on both paths:
 * drag-to-reorder via `persistEntryRunOrder`, and the section-aware PRESET
 * dialog via `applyCombinedRunOrder`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  RingsideProvider,
  EntryListPage,
  useEntryListData,
  useEntryListFilters,
  useDragAndDropEntries,
  buildEntryListOwnership,
  type Entry,
  type EntryListDataDependencies,
  type RingsideShowContext,
  type RunOrderPreset,
  type RunOrderScope,
  type RenumberMode,
} from '@myk9/ringside';

import { replicatedShowsTable } from '@/services/replication';
import { applyCombinedRunOrder } from './applyCombinedRunOrder';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { areReplicationTablesPendingFirstSync } from '@/utils/replicationSyncEmptyState';
import { notifyRunOrderPersistError } from './runOrderErrorToast';
import { persistEntryRunOrder } from './persistEntryRunOrder';
import { buildRingsideContextValue, buildRingsideReplication } from './ringsideCapabilities';
import { useRingsideEffectiveRole } from './useRingsideEffectiveRole';
import { createAtShowDataDependencies } from './atShowDataAdapter';
import { useAtShowEntryListActions } from './useAtShowEntryListActions';
import { useAtShowEntryListUiState } from './useAtShowEntryListUiState';
import { useAtShowEntryListHandlers } from './useAtShowEntryListHandlers';
import { atShowLayoutSlots } from './slots/atShowLayoutSlots';
import { atShowDialogSlots } from './slots/atShowDialogSlots';
import { useAtShowDogFavoritesSynced } from './dogFavoritesSync';
import { useAtShowFavoriteAlertNudge } from './useAtShowFavoriteAlertNudge';
import { AtShowAddToHomeNudge } from './AtShowAddToHomeNudge';
import { useMyAtShowEntries } from './useMyAtShowEntries';
import { useMyRingConflicts } from './useMyRingConflicts';
import { useAtShowRealtimeRefresh } from './useAtShowRealtimeRefresh';

export const AtShowCombinedEntryListPage: React.FC = () => {
  const { showId, classIdA, classIdB } = useParams<{
    showId: string;
    classIdA: string;
    classIdB: string;
  }>();
  // ── Role + permissions ────────────────────────────────────────────────
  // Account RBAC → primary ShowRole → ringside's 4-role enum, with a Phase 1c
  // show-scoped passcode grant overriding the mapping. Shared with the
  // single-class and scoresheet shims via `useRingsideEffectiveRole`.
  const navigate = useNavigate();
  const { showRole, grantRole, ringsideRole, hasPermission } = useRingsideEffectiveRole(showId);
  // Device-local favorites, mirrored to `dog_favorites` when signed in so the
  // notification monitor can watch them for "your turn" push (MYK9-79).
  const { favoriteArmbands, toggleFavoriteArmband } = useAtShowDogFavoritesSynced(showId);
  const { showAddToHomeNudge, nudgeReason, installInstructions, dismissNudge } =
    useAtShowFavoriteAlertNudge(favoriteArmbands);

  // ── Show metadata + provider value ─────────────────────────────────────
  const { data: show } = useQuery({
    queryKey: ['at-show', 'show', showId],
    queryFn: () => replicatedShowsTable.getShowById(showId as string),
    enabled: !!showId,
  });
  const ringsideShowContext = useMemo<RingsideShowContext | null>(() => {
    if (!showId) return null;
    return {
      showId,
      showName: show?.name ?? '',
      clubName: '',
      showDate: show?.startDate ?? '',
      licenseKey: showId,
      org: show?.organization ?? '',
      // Drives ringside Nationals detection (isNationalsCompetition matches
      // the substring 'national'); map from the show's is_nationals flag.
      competition_type: show?.isNationals ? 'Nationals' : 'Regular',
    };
  }, [showId, show]);
  const contextValue = useMemo(
    () => buildRingsideContextValue({ showRole, showContext: ringsideShowContext, grantRole }),
    [showRole, ringsideShowContext, grantRole]
  );

  // ── Data (combined: both class ids) ────────────────────────────────────
  const isDraggingRef = useRef<boolean>(false);
  const dependencies = useMemo<EntryListDataDependencies>(
    () => ({
      auth: {
        role: ringsideRole,
        showContext: showId ? { licenseKey: showId } : null,
      },
      ...createAtShowDataDependencies(),
    }),
    [ringsideRole, showId]
  );

  const { entries, classInfo, isRefreshing, fetchError, refresh } = useEntryListData({
    ...(classIdA ? { classIdA } : {}),
    ...(classIdB ? { classIdB } : {}),
    isDraggingRef,
    dependencies,
  });

  // An exhibitor-role account (including an admin who entered an exhibitor
  // passcode) lacks the staff RLS authority the replicated writer needs, so its
  // check-in writes must route through the ownership-scoped `self_checkin_entry`
  // RPC — otherwise the optimistic update sticks locally but never syncs.
  const actions = useAtShowEntryListActions({
    refresh,
    writer: ringsideRole === 'exhibitor' ? 'self-checkin-rpc' : 'replicated',
  });

  // ── Realtime: scoring/check-in changes elsewhere re-sync this list ─────
  useAtShowRealtimeRefresh(
    showId,
    [classIdA, classIdB].filter((classId): classId is string => !!classId),
    refresh
  );

  // ── Shim-owned state (mirrors CombinedEntryListUiState) ────────────────
  const { status: syncStatus } = useReplicationSync();
  const [localEntries, setLocalEntries] = useState<Entry[]>([]);
  const [manualOrder, setManualOrder] = useState<Entry[]>([]);
  // Mirrors AtShowEntryListPage. Without this the combined route presented an
  // empty ring as settled truth while the FIRST replication sync was still
  // running -- `isRefreshing` alone only covers a refetch, not the cold boot.
  const isInitialEntryDataSyncing =
    entries.length === 0 &&
    areReplicationTablesPendingFirstSync(syncStatus, ['shows', 'trials', 'classes', 'entries']);

  // ── Filters (section filter ON → All / Section A / Section B tabs) ─────
  const {
    activeTab,
    setActiveTab,
    sortBy: sortOrder,
    setSortBy: setSortOrder,
    searchTerm,
    setSearchTerm,
    sectionFilter,
    setSectionFilter,
    filteredEntries,
    pendingEntries,
    completedEntries,
    entryCounts,
  } = useEntryListFilters({
    entries: localEntries,
    supportSectionFilter: true,
    // The combined route used to sort itself with `compareEntries`, which only
    // floated in-ring dogs. Sharing the single-class route's options is the
    // point of the collapse, and it brings three orderings the combined ring
    // never had: pulled dogs last, at-gate dogs bubbled above plain pending,
    // and a manual order that survives a drag.
    prioritizeInRing: true,
    deprioritizePulled: true,
    manualOrder,
    defaultSort: 'section-armband',
  });

  const currentEntries = activeTab === 'pending' ? pendingEntries : completedEntries;

  // ── UI state + handlers: the SAME bags the single-class route builds ────
  // Sharing them is the point of the MYK9-260 collapse -- the combined route
  // previously carried its own smaller hand-rolled bag, which is how the two
  // surfaces drifted apart in the first place.
  const { uiState, uiActions } = useAtShowEntryListUiState({
    localEntries,
    setLocalEntries,
    manualOrder,
    setManualOrder,
    setActiveTab,
    setSortOrder,
    setSearchTerm,
  });

  const replication = useMemo(() => buildRingsideReplication(), []);
  const buildScoreSheetRoute = useCallback(
    (entry: Entry) => `/at-show/${showId}/class/${entry.classId}/score/${entry.id}`,
    [showId]
  );
  // The scoresheet needs to know the OTHER section is running alongside this
  // one; a single-class list has no pair, so it passes no state at all.
  const buildScoreSheetState = useCallback(
    (entry: Entry) => ({ pairedClassId: entry.classId === classIdA ? classIdB : classIdA }),
    [classIdA, classIdB]
  );

  const baseHandlers = useAtShowEntryListHandlers({
    actions,
    replication,
    // No single class to act on: recalculate-placements and class settings are
    // hidden in combined mode for exactly that reason (see EntryListPage).
    classId: undefined,
    localEntries,
    hasPermission,
    navigate,
    buildScoreSheetRoute,
    buildScoreSheetState,
    refresh,
    setActiveStatusPopup: uiActions.setActiveStatusPopup,
    setActiveResetMenu: uiActions.setActiveResetMenu,
    setResetMenuPosition: uiActions.setResetMenuPosition,
    setResetConfirmDialog: uiActions.setResetConfirmDialog,
    setIsDragMode: uiActions.setIsDragMode,
    setIsManualRefreshing: uiActions.setIsManualRefreshing,
    setActiveTab,
    setLocalEntries,
  });

  // ── Drag (run-order persist) ───────────────────────────────────────────
  // Same contract as the single-class AtShowEntryListPage — see
  // persistEntryRunOrder for the offline-first / RLS details.
  const updateExhibitorOrder = useCallback(
    (reordered: Entry[]) => persistEntryRunOrder(reordered),
    []
  );
  // A drag whose write never QUEUED used to be silent on both routes: the
  // reordered list stayed on screen and the steward worked the gate from an
  // order that existed only on their phone. Notify, then re-derive from the
  // replicated data -- the write is per-row, so a failure may be partial and
  // only a refresh can settle what actually landed.
  const handleRunOrderPersistError = useCallback(
    (error: unknown) => {
      notifyRunOrderPersistError(error);
      void refresh(true);
    },
    [refresh]
  );

  const { sensors, handleDragStart, handleDragEnd, isDragging } = useDragAndDropEntries({
    localEntries,
    setLocalEntries,
    currentEntries,
    updateExhibitorOrder,
    isDraggingRef,
    setManualOrder,
    onPersistError: handleRunOrderPersistError,
  });

  // ── Effects: mirror fetched entries (drag-guarded) + initial load ──────
  // `isDragging` is a dep (not just the ref) so the mirror re-runs when a drag
  // ENDS. The drag hook clears `isDraggingRef` inside a grace-period timeout --
  // a ref mutation that does not re-trigger this effect on its own -- so with
  // `[entries]` alone a sync landing mid-drag was silently DROPPED until some
  // unrelated future refetch, leaving the combined list stale after every
  // reorder. The single-class page has carried this dep and its rationale since
  // it was written; this route did not. The ref stays as the synchronous guard.
  useEffect(() => {
    if (isDraggingRef.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalEntries(entries);
  }, [entries, isDragging]);
  const { hasCompletedInitialLoad } = uiState;
  const { setHasCompletedInitialLoad, setIsLoaded } = uiActions;
  useEffect(() => {
    if (!isRefreshing && !isInitialEntryDataSyncing && !hasCompletedInitialLoad) {
      setHasCompletedInitialLoad(true);
      setIsLoaded(true);
    }
  }, [
    isRefreshing,
    isInitialEntryDataSyncing,
    hasCompletedInitialLoad,
    setHasCompletedInitialLoad,
    setIsLoaded,
  ]);

  // Apply a run-order PRESET (by-armband / random / section-scoped). Mirrors the
  // single-class preset path but section-aware: `scope` (A/B/all) + `renumberMode`
  // route through `applyCombinedRunOrder`, which persists each entry's run_order
  // offline-first via the replication layer. `manual` opens drag mode instead.
  const handleApplyRunOrder = useCallback<
    (preset: RunOrderPreset, scope?: RunOrderScope, renumberMode?: RenumberMode) => Promise<boolean>
  >(
    async (preset, scope, renumberMode) => {
      if (preset === 'manual') {
        uiActions.setIsDragMode(true);
        return false;
      }
      try {
        await applyCombinedRunOrder(localEntries, preset, scope, renumberMode);
      } catch (error) {
        // Surface the failure and report it through the RETURN value, matching
        // the single-class host. Throwing would work too -- the page catches --
        // but the dialog calls this fire-and-forget, so one convention that
        // never rejects is the safer of the two.
        notifyRunOrderPersistError(error);
        return false;
      }
      // The write landed — re-pull is best-effort reconciliation, kept OUT of the
      // try so a refresh hiccup can't read as a failed apply (false error toast +
      // suppressed success banner). The persist outcome alone decides success.
      await refresh();
      return true;
    },
    [localEntries, refresh, uiActions]
  );

  // Section-aware run order is the ONE handler the combined route cannot take
  // from the shared bag: `applyCombinedRunOrder` honours the A/B `scope` and
  // `renumberMode` contract that a single-class renumber has no notion of.
  const handlers = useMemo(
    () => ({ ...baseHandlers, handleApplyRunOrder }),
    [baseHandlers, handleApplyRunOrder]
  );

  // ── Ownership annotations (own-dog highlight + dogs-ahead pills) ────────
  // Combined A/B run together, so the queue is computed over the merged
  // localEntries — exactly what the page renders.
  const { ownEntryIds } = useMyAtShowEntries(showId);
  const conflictLabels = useMyRingConflicts(showId, ownEntryIds);
  const ownership = useMemo(
    () => buildEntryListOwnership(localEntries, ownEntryIds, conflictLabels),
    [localEntries, ownEntryIds, conflictLabels]
  );

  // ── Context ────────────────────────────────────────────────────────────
  const canManageClasses = hasPermission('canManageClasses');
  const pageShowContext = useMemo(
    () => (showId ? { ...(show?.organization ? { org: show.organization } : {}) } : null),
    [showId, show]
  );

  return (
    <RingsideProvider value={contextValue}>
      <div className="ringside-root">
        {showAddToHomeNudge && (
          <AtShowAddToHomeNudge
            reason={nudgeReason}
            installInstructions={installInstructions}
            onDismiss={dismissNudge}
          />
        )}
        <EntryListPage
          classId={classIdA}
          combined={{
            classIds: { a: classIdA as string, b: classIdB as string },
            sectionFilter,
            setSectionFilter,
          }}
          data={{ entries, classInfo }}
          dataStatus={{ isRefreshing, fetchError, refresh }}
          handlers={handlers}
          actions={actions}
          uiState={uiState}
          uiActions={uiActions}
          derived={{
            activeTab,
            sortOrder,
            searchTerm,
            filteredEntries,
            pendingEntries,
            completedEntries,
            currentEntries,
            entryCounts,
          }}
          favorites={{ favoriteArmbands, onToggleFavoriteArmband: toggleFavoriteArmband }}
          {...(ownership ? { ownership } : {})}
          drag={{ sensors, handleDragStart, handleDragEnd, isDraggingRef }}
          dialogs={atShowDialogSlots}
          layout={atShowLayoutSlots}
          context={{
            role: ringsideRole,
            showContext: pageShowContext,
            hasPermission,
            hideMaxTimeOption: !canManageClasses,
            hideSettingsOption: !canManageClasses,
            // No printing at ringside — reports live on the secretary Reports page.
            hidePrintOptions: true,
          }}
        />
      </div>
    </RingsideProvider>
  );
};

export default AtShowCombinedEntryListPage;
