/**
 * AtShowEntryListPage — Phase 1a host shim for the ringside EntryList page.
 *
 * This is the keystone of Phase 1a: it mounts `@myk9/ringside`'s controlled
 * `EntryListPage` inside myK9Show. The shim is the ONLY host-coupled layer —
 * it owns auth/role derivation, the shared `isDraggingRef`, the `localEntries`
 * mirror, and it assembles every prop bag from the Phase 1a adapters/hooks:
 *
 *   - data       → `useEntryListData` + `createAtShowDataDependencies`
 *   - actions    → `useAtShowEntryListActions` (real check-in writes)
 *   - handlers   → `useAtShowEntryListHandlers` (mostly delegation + stubs)
 *   - filters    → `useEntryListFilters` (pure ringside hook, called shim-side)
 *   - drag       → `useDragAndDropEntries` (pure ringside hook)
 *   - uiState    → `useAtShowEntryListUiState`
 *   - dialogs    → `atShowDialogSlots`
 *   - layout     → `atShowLayoutSlots`
 *   - context    → role + permission helpers from the auth adapter
 *
 * It renders the page inside `<RingsideProvider>` so any ringside descendant
 * that reads `useRingside()` resolves against myK9Show's capability bag.
 *
 * Mounted behind an OFF-by-default flag (see `atShowFeatureFlag.ts`); the
 * `/at-show/:showId/class/:classId` route is not even registered until a host
 * opts in. Several handlers are spike stubs (run-order persist, placement
 * recalc, prints, statistics nav) — all INTENT-noted in their hooks.
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
  getPermissionsForRole,
  type Entry,
  type EntryListDataDependencies,
  type RingsideShowContext,
  type UserPermissions as RingsidePermissions,
} from '@myk9/ringside';
import { useAuthContext, getPrimaryRole } from '@/hooks/useAuthContext';
import { replicatedShowsTable } from '@/services/replication';
import { logger } from '@/utils/logger';
import { buildRingsideContextValue, buildRingsideReplication } from './ringsideCapabilities';
import { toRingsideRole } from './ringsideAuthAdapter';
import { createAtShowDataDependencies } from './atShowDataAdapter';
import { useAtShowEntryListActions } from './useAtShowEntryListActions';
import { useAtShowEntryListHandlers } from './useAtShowEntryListHandlers';
import { useAtShowEntryListUiState } from './useAtShowEntryListUiState';
import { atShowLayoutSlots } from './slots/atShowLayoutSlots';
import { atShowDialogSlots } from './slots/atShowDialogSlots';

export const AtShowEntryListPage: React.FC = () => {
  const { showId, classId } = useParams<{ showId: string; classId: string }>();
  const navigate = useNavigate();
  const { getUserRoles } = useAuthContext();

  // ── Role + permissions ────────────────────────────────────────────────
  // myK9Show RBAC → primary ShowRole → ringside's 4-role enum. The raw
  // ShowRole feeds the capability adapter (which maps it internally); the
  // mapped ringside role feeds the data hook + permission bag.
  const showRole = useMemo(() => getPrimaryRole(getUserRoles()), [getUserRoles]);
  const ringsideRole = useMemo(() => toRingsideRole(showRole), [showRole]);

  const permissions = useMemo<RingsidePermissions | null>(
    () => (ringsideRole ? getPermissionsForRole(ringsideRole) : null),
    [ringsideRole]
  );
  const hasPermission = useCallback(
    (permission: keyof RingsidePermissions) => permissions?.[permission] ?? false,
    [permissions]
  );

  // ── Show metadata (org/name/date) for the ringside show context ────────
  const { data: show } = useQuery({
    queryKey: ['at-show', 'show', showId],
    queryFn: () => replicatedShowsTable.getShowById(showId as string),
    enabled: !!showId,
  });

  // Full RingsideShowContext for the provider value. licenseKey === showId in
  // myK9Show (replication sync filters on show_id). Fields myK9Show can't
  // source yet (clubName, competition_type) default empty for the spike.
  const ringsideShowContext = useMemo<RingsideShowContext | null>(() => {
    if (!showId) return null;
    return {
      showId,
      showName: show?.name ?? '',
      clubName: '',
      showDate: show?.startDate ?? '',
      licenseKey: showId,
      org: show?.organization ?? '',
      competition_type: '',
    };
  }, [showId, show]);

  const contextValue = useMemo(
    () => buildRingsideContextValue({ showRole, showContext: ringsideShowContext }),
    [showRole, ringsideShowContext]
  );
  const replication = useMemo(() => buildRingsideReplication(), []);

  // ── Data ──────────────────────────────────────────────────────────────
  // Shared drag ref — passed to both the data hook (suppress sync snap-back)
  // and the drag hook (sets it during a drag).
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
    // exactOptionalPropertyTypes: omit `classId` rather than pass an explicit
    // `undefined`; the hook disables its query when classId is absent anyway.
    ...(classId ? { classId } : {}),
    isDraggingRef,
    dependencies,
  });

  const actions = useAtShowEntryListActions({ refresh });

  // ── Shim-owned entry mirror state (see uiState hook ownership note) ────
  const [localEntries, setLocalEntries] = useState<Entry[]>([]);
  const [manualOrder, setManualOrder] = useState<Entry[]>([]);

  // ── Filters (pure ringside hook, called shim-side — Path A) ────────────
  const {
    activeTab,
    setActiveTab,
    sortBy: sortOrder,
    setSortBy: setSortOrder,
    searchTerm,
    setSearchTerm,
    filteredEntries,
    pendingEntries,
    completedEntries,
    entryCounts,
  } = useEntryListFilters({
    entries: localEntries,
    prioritizeInRing: true,
    deprioritizePulled: true,
    manualOrder,
    defaultSort: 'run',
  });

  const currentEntries = activeTab === 'pending' ? pendingEntries : completedEntries;

  // ── Drag-and-drop (pure ringside hook) ─────────────────────────────────
  const updateExhibitorOrder = useCallback(async (): Promise<unknown> => {
    // INTENT (spike): run-order persistence is deferred — matches the
    // handlers' `handleApplyRunOrder` stub. The optimistic local reorder
    // still happens inside the drag hook; only the DB write is skipped.
    logger.warn('[at-show] drag run-order persist is stubbed for the spike', 'at-show');
    return undefined;
  }, []);

  const { sensors, handleDragStart, handleDragEnd, isDragging } = useDragAndDropEntries({
    localEntries,
    setLocalEntries,
    currentEntries,
    updateExhibitorOrder,
    isDraggingRef,
    setManualOrder,
  });

  // ── UI state bag ───────────────────────────────────────────────────────
  const { uiState, uiActions } = useAtShowEntryListUiState({
    localEntries,
    setLocalEntries,
    manualOrder,
    setManualOrder,
    setActiveTab,
    setSortOrder,
    setSearchTerm,
  });

  // ── Scoresheet route (wired fully in Phase 1h — may 404 until then) ────
  const buildScoreSheetRoute = useCallback(
    (entry: Entry) => `/at-show/${showId}/class/${classId}/score/${entry.id}`,
    [showId, classId]
  );

  // ── Handlers ────────────────────────────────────────────────────────────
  const handlers = useAtShowEntryListHandlers({
    actions,
    replication,
    classId,
    localEntries,
    hasPermission,
    navigate,
    buildScoreSheetRoute,
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

  // ── Effects: mirror fetched entries → localEntries; mark initial load ──
  // Mirrors myK9Q's useEntryListEffects (which we don't reuse — it pulls
  // host-specific singletons). Skips the mirror during a drag so optimistic
  // reorders aren't clobbered by an incoming sync.
  // `isDragging` is a dep (not just the ref) so the mirror re-runs when a drag
  // ENDS — the drag hook clears `isDraggingRef` inside a grace-period timeout
  // (a ref mutation that wouldn't re-trigger this effect on its own), so a
  // sync that lands mid-drag would otherwise be dropped until an unrelated
  // future refetch. The ref stays as the synchronous skip-guard.
  useEffect(() => {
    if (isDraggingRef.current) return;
    // Syncing fetched data into the optimistic mirror is the intended pattern
    // here (the mirror diverges from `entries` between syncs), matching the
    // project's other external-data → state effects.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalEntries(entries);
  }, [entries, isDragging]);

  const { hasCompletedInitialLoad } = uiState;
  const { setHasCompletedInitialLoad, setIsLoaded } = uiActions;
  useEffect(() => {
    if (!isRefreshing && !hasCompletedInitialLoad) {
      setHasCompletedInitialLoad(true);
      setIsLoaded(true);
    }
  }, [isRefreshing, hasCompletedInitialLoad, setHasCompletedInitialLoad, setIsLoaded]);

  // ── Context bag ──────────────────────────────────────────────────────────
  const canManageClasses = hasPermission('canManageClasses');
  const pageShowContext = useMemo(
    () => (showId ? { ...(show?.organization ? { org: show.organization } : {}) } : null),
    [showId, show]
  );

  return (
    <RingsideProvider value={contextValue}>
      {/* `.ringside-root` scopes the ported myK9Q visual layer (@myk9/ringside
          styles) to this subtree only — no bleed into the rest of myK9Show. */}
      <div className="ringside-root">
        <EntryListPage
          classId={classId}
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
        drag={{ sensors, handleDragStart, handleDragEnd, isDraggingRef }}
        dialogs={atShowDialogSlots}
        layout={atShowLayoutSlots}
        context={{
          role: ringsideRole,
          showContext: pageShowContext,
          hasPermission,
          // INTENT (spike): hide org-rule max-time + class-settings options
          // for anyone who can't manage classes. A faithful org-rule pass
          // (mirroring myK9Q's hasRuleDefinedMaxTimes) lands in the UI sprint.
          hideMaxTimeOption: !canManageClasses,
          hideSettingsOption: !canManageClasses,
        }}
        />
      </div>
    </RingsideProvider>
  );
};

export default AtShowEntryListPage;
