/**
 * Phase 1a — shim-owned UI state for the ringside EntryList page.
 *
 * ringside's EntryListPage is a controlled render that owns NO state: the host
 * shim holds every `useState` and threads both the snapshot (`EntryListUiState`)
 * and the setters (`EntryListUiActions`) in. This hook centralizes those ~25
 * fields so `AtShowEntryListPage` stays under the 500-line rule.
 */

import { useMemo, useState } from 'react';
import type { Entry, EntryListUiState, EntryListUiActions } from '@myk9/ringside';

type ResetConfirm = { show: boolean; entry: Entry | null };
type AreaCountReq = { min: number; max: number; maxTotalSeconds: number } | null;
type PrintDialogType = 'check-in' | 'results' | 'scoresheet' | null;

export interface UseAtShowEntryListUiStateResult {
  uiState: EntryListUiState;
  uiActions: EntryListUiActions;
  /** Filter setters the data/filter hooks own but the shim must expose. */
  setActiveTab: (tab: 'pending' | 'completed') => void;
}

export function useAtShowEntryListUiState(filterSetters: {
  setActiveTab: EntryListUiActions['setActiveTab'];
  setSortOrder: EntryListUiActions['setSortOrder'];
  setSearchTerm: EntryListUiActions['setSearchTerm'];
}): UseAtShowEntryListUiStateResult {
  const [localEntries, setLocalEntries] = useState<Entry[]>([]);
  const [manualOrder, setManualOrder] = useState<Entry[]>([]);
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
  const [noStatsDialogOpen, setNoStatsDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selfCheckinDisabledDialog, setSelfCheckinDisabledDialog] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [areaCountDialogOpen, setAreaCountDialogOpen] = useState(false);
  const [areaCountRequirements, setAreaCountRequirements] = useState<AreaCountReq>(null);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isRecalculatingPlacements, setIsRecalculatingPlacements] = useState(false);
  const [printDialogType, setPrintDialogType] = useState<PrintDialogType>(null);
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
    manualOrder,
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
    noStatsDialogOpen,
    statusDialogOpen,
    selfCheckinDisabledDialog,
    showSuccessMessage,
    areaCountDialogOpen,
    areaCountRequirements,
    isFilterPanelOpen,
    isRecalculatingPlacements,
    printDialogType,
    activeResetMenu,
    resetMenuPosition,
    resetConfirmDialog,
  };

  const uiActions: EntryListUiActions = useMemo(
    () => ({
      setLocalEntries,
      setManualOrder,
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
      setNoStatsDialogOpen,
      setStatusDialogOpen,
      setSelfCheckinDisabledDialog,
      setShowSuccessMessage,
      setAreaCountDialogOpen,
      setAreaCountRequirements,
      setIsFilterPanelOpen,
      setIsRecalculatingPlacements,
      setPrintDialogType,
      setActiveResetMenu,
      setResetMenuPosition,
      setResetConfirmDialog,
      setActiveTab: filterSetters.setActiveTab,
      setSortOrder: filterSetters.setSortOrder,
      setSearchTerm: filterSetters.setSearchTerm,
    }),
    [filterSetters.setActiveTab, filterSetters.setSortOrder, filterSetters.setSearchTerm]
  ) as EntryListUiActions;

  return {
    uiState,
    uiActions,
    setActiveTab: filterSetters.setActiveTab,
  };
}
