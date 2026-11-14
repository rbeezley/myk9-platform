/**
 * Phase 1a — shim-owned UI state for the ringside EntryList page.
 *
 * ringside's EntryListPage is a controlled render that owns NO state: the host
 * shim holds every `useState` and threads both the snapshot (`EntryListUiState`)
 * and the setters (`EntryListUiActions`) in. This hook centralizes most of those
 * ~25 fields so `AtShowEntryListPage` stays under the 500-line rule.
 *
 * Ownership split (why `localEntries` is NOT owned here):
 * ---------------------------------------------------------------------
 * `useEntryListFilters` must be fed `localEntries` to compute `derived`, and
 * its setters (`setActiveTab` / `setSortOrder` / `setSearchTerm`) must flow
 * back into this hook's `uiActions` bag. If this hook owned `localEntries`,
 * the shim would have to call filters (needs `localEntries`) *and* this hook
 * (needs the filter setters) in an order that satisfies both — impossible,
 * because each consumes the other's output. Hoisting the `localEntries`
 * state up to the shim breaks the cycle and mirrors myK9Q's EntryList shim
 * exactly (it owns that `useState` slot directly).
 */

import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Entry, EntryListUiState, EntryListUiActions } from '@myk9/ringside';

type ResetConfirm = { show: boolean; entry: Entry | null };
type AreaCountReq = { min: number; max: number; maxTotalSeconds: number } | null;

export interface UseAtShowEntryListUiStateDeps {
  /** Entry mirror state, owned by the shim (see ownership note above). */
  localEntries: Entry[];
  setLocalEntries: Dispatch<SetStateAction<Entry[]>>;

  /** Filter setters owned by `useEntryListFilters`, folded into `uiActions`. */
  setActiveTab: EntryListUiActions['setActiveTab'];
  setSortOrder: EntryListUiActions['setSortOrder'];
  setSearchTerm: EntryListUiActions['setSearchTerm'];
}

export interface UseAtShowEntryListUiStateResult {
  uiState: EntryListUiState;
  uiActions: EntryListUiActions;
}

export function useAtShowEntryListUiState(
  deps: UseAtShowEntryListUiStateDeps
): UseAtShowEntryListUiStateResult {
  const { localEntries, setLocalEntries, setActiveTab, setSortOrder, setSearchTerm } = deps;

  const [activeStatusPopup, setActiveStatusPopup] = useState<string | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
  const [isDragMode, setIsDragMode] = useState(false);
  const [runOrderDialogOpen, setRunOrderDialogOpen] = useState(false);
  const [classOptionsDialogOpen, setClassOptionsDialogOpen] = useState(false);
  const [requirementsDialogOpen, setRequirementsDialogOpen] = useState(false);
  const [maxTimeDialogOpen, setMaxTimeDialogOpen] = useState(false);
  const [maxTimeRequiredWarning, setMaxTimeRequiredWarning] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selfCheckinDisabledDialog, setSelfCheckinDisabledDialog] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [areaCountDialogOpen, setAreaCountDialogOpen] = useState(false);
  const [areaCountRequirements, setAreaCountRequirements] = useState<AreaCountReq>(null);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [activeResetMenu, setActiveResetMenu] = useState<string | null>(null);
  const [resetMenuPosition, setResetMenuPosition] = useState<{ top: number; left: number } | null>(
    null
  );
  const [resetConfirmDialog, setResetConfirmDialog] = useState<ResetConfirm>({
    show: false,
    entry: null,
  });

  const uiState: EntryListUiState = {
    localEntries,
    activeStatusPopup,
    isManualRefreshing,
    isLoaded,
    hasCompletedInitialLoad,
    isDragMode,
    runOrderDialogOpen,
    classOptionsDialogOpen,
    requirementsDialogOpen,
    maxTimeDialogOpen,
    maxTimeRequiredWarning,
    settingsDialogOpen,
    statusDialogOpen,
    selfCheckinDisabledDialog,
    showSuccessMessage,
    areaCountDialogOpen,
    areaCountRequirements,
    isFilterPanelOpen,
    activeResetMenu,
    resetMenuPosition,
    resetConfirmDialog,
  };

  // useState setters are referentially stable, so only the shim-owned and
  // filter setters need to gate the memo.
  const uiActions = useMemo<EntryListUiActions>(
    () => ({
      setLocalEntries,
      setActiveStatusPopup,
      setIsManualRefreshing,
      setIsLoaded,
      setHasCompletedInitialLoad,
      setIsDragMode,
      setRunOrderDialogOpen,
      setClassOptionsDialogOpen,
      setRequirementsDialogOpen,
      setMaxTimeDialogOpen,
      setMaxTimeRequiredWarning,
      setSettingsDialogOpen,
      setStatusDialogOpen,
      setSelfCheckinDisabledDialog,
      setShowSuccessMessage,
      setAreaCountDialogOpen,
      setAreaCountRequirements,
      setIsFilterPanelOpen,
      setActiveResetMenu,
      setResetMenuPosition,
      setResetConfirmDialog,
      setActiveTab,
      setSortOrder,
      setSearchTerm,
    }),
    [setLocalEntries, setActiveTab, setSortOrder, setSearchTerm]
  );

  return { uiState, uiActions };
}
