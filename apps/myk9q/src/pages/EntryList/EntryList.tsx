/**
 * EntryList host shim.
 *
 * The page orchestrator moved into `@myk9/ringside` as `EntryListPage`
 * in PR E2d-2b. This shim is now the only host-coupled layer:
 *  - Reads `useParams`, `useAuth`, `usePermission`
 *  - Owns 19 `useState` slots (mirrors `EntryListUiState`)
 *  - Owns the `isDraggingRef` shared between data + drag hooks
 *  - Calls the four host hooks (data, actions, handlers, effects)
 *  - Calls the two pure ringside hooks (filters, drag) so their
 *    setters are available to `useEntryListHandlers` as deps
 *  - Precomputes the org/role-derived `hideMaxTimeOption` /
 *    `hideSettingsOption` booleans
 *  - Assembles the 10 dialog slots + 10 layout slots from host
 *    primitives
 *  - Renders `<EntryListPage {...all-the-bags} />`
 *
 * Anything that doesn't fit one of those concerns should NOT live
 * here — push it into ringside (controlled-render concern) or into a
 * dedicated host hook (host-coupling concern).
 */

import { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { EntryListPage } from '@myk9/ringside';
import type { Entry } from '../../stores/entryStore';
import type { AreaCountRequirements } from '../../components/dialogs/AreaCountSelectionDialog';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '../../hooks/usePermission';
import {
  useEntryListData,
  useEntryListActions,
  useEntryListFilters,
  useDragAndDropEntries,
  useEntryListHandlers,
  useEntryListEffects,
} from './hooks';
import {
  hasRuleDefinedMaxTimes,
  parseOrganizationData,
} from '../../utils/organizationUtils';

// Dialog slot implementations (10 dialogs).
import { CheckinStatusDialog } from '../../components/dialogs/CheckinStatusDialog';
import { ClassOptionsDialog } from '../../components/dialogs/ClassOptionsDialog';
import { ClassStatusDialog } from '../../components/dialogs/ClassStatusDialog';
import { ClassRequirementsDialog } from '../../components/dialogs/ClassRequirementsDialog';
import { ClassSettingsDialog } from '../../components/dialogs/ClassSettingsDialog';
import { MaxTimeDialog } from '../../components/dialogs/MaxTimeDialog';
import { RunOrderDialog } from '../../components/dialogs/RunOrderDialog';
import { ScoresheetPrintDialog } from '../../components/dialogs/ScoresheetPrintDialog';
import { NoStatsDialog } from '../../components/dialogs/NoStatsDialog';
import { AreaCountSelectionDialog } from '../../components/dialogs/AreaCountSelectionDialog';

// Layout slot implementations (10 primitives).
import {
  HamburgerMenu,
  CompactOfflineIndicator,
  SyncIndicator,
  RefreshIndicator,
  FilterTriggerButton,
  ErrorState,
  PullToRefresh,
  FilterPanel,
} from '../../components/ui';
import { DogCard } from '../../components/DogCard';
import { ClassDetailsPopover } from '../../components/dialogs/ClassDetailsPopover';

export const EntryList: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const { showContext, role } = useAuth();
  const { hasPermission, hasRole } = usePermission();

  // Shared drag ref — passed to data, effects, AND drag hooks so all
  // three coordinate on a single boolean signal.
  const isDraggingRef = useRef<boolean>(false);

  // Data + actions
  const { entries, classInfo, isRefreshing, fetchError, refresh } = useEntryListData({
    classId,
    isDraggingRef,
  });
  const actions = useEntryListActions(refresh);

  // 19 useState slots — mirrors `EntryListUiState` exactly.
  const [localEntries, setLocalEntries] = useState<Entry[]>([]);
  const [manualOrder, setManualOrder] = useState<Entry[]>([]);
  const [activeStatusPopup, setActiveStatusPopup] = useState<string | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [selfCheckinDisabledDialog, setSelfCheckinDisabledDialog] = useState<boolean>(false);
  const [isDragMode, setIsDragMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
  const [runOrderDialogOpen, setRunOrderDialogOpen] = useState(false);
  const [classOptionsDialogOpen, setClassOptionsDialogOpen] = useState(false);
  const [requirementsDialogOpen, setRequirementsDialogOpen] = useState(false);
  const [maxTimeDialogOpen, setMaxTimeDialogOpen] = useState(false);
  const [maxTimeRequiredWarning, setMaxTimeRequiredWarning] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [noStatsDialogOpen, setNoStatsDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isRecalculatingPlacements, setIsRecalculatingPlacements] = useState(false);
  const [areaCountDialogOpen, setAreaCountDialogOpen] = useState(false);
  const [areaCountRequirements, setAreaCountRequirements] = useState<AreaCountRequirements | null>(
    null
  );
  const [printDialogType, setPrintDialogType] = useState<
    'check-in' | 'results' | 'scoresheet' | null
  >(null);
  const [activeResetMenu, setActiveResetMenu] = useState<string | null>(null);
  const [resetMenuPosition, setResetMenuPosition] = useState<{ top: number; left: number } | null>(
    null
  );
  const [resetConfirmDialog, setResetConfirmDialog] = useState<{
    show: boolean;
    entry: Entry | null;
  }>({ show: false, entry: null });

  // Pure ringside filter hook — called shim-side (Path A) so the
  // resulting setters are available to `useEntryListHandlers` deps.
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

  // Pure ringside drag hook — same Path A rationale.
  const { sensors, handleDragStart, handleDragEnd } = useDragAndDropEntries({
    localEntries,
    setLocalEntries,
    currentEntries,
    isDraggingRef,
    setManualOrder,
  });

  // Host effects (no return value — fires for its side effects).
  useEntryListEffects({
    classId,
    classInfo,
    entries,
    setLocalEntries,
    isDraggingRef,
    isRefreshing,
    hasCompletedInitialLoad,
    setHasCompletedInitialLoad,
    setIsLoaded,
    setMaxTimeDialogOpen,
    setMaxTimeRequiredWarning,
    setAreaCountDialogOpen,
    setAreaCountRequirements,
    refresh,
  });

  // Host handlers — 30+ deps. Return shape satisfies
  // `EntryListHandlers` (locked by contractAssertions.test.ts).
  const handlers = useEntryListHandlers({
    classId,
    classInfo,
    localEntries,
    setLocalEntries,
    pendingEntries,
    completedEntries,
    currentEntries,
    refresh,
    isRefreshing,
    isManualRefreshing,
    setIsManualRefreshing,
    setActiveStatusPopup,
    setActiveResetMenu,
    setResetMenuPosition,
    setResetConfirmDialog,
    resetConfirmDialog,
    setRunOrderDialogOpen,
    setMaxTimeDialogOpen,
    setMaxTimeRequiredWarning,
    setNoStatsDialogOpen,
    setStatusDialogOpen,
    setShowSuccessMessage,
    setSelfCheckinDisabledDialog,
    setIsDragMode,
    setIsRecalculatingPlacements,
    setManualOrder,
    setActiveTab,
    setSortOrder,
    handleStatusChangeHook: actions.handleStatusChange,
    handleResetScoreHook: actions.handleResetScore,
    handleMarkInRing: actions.handleMarkInRing,
    handleMarkCompleted: actions.handleMarkCompleted,
  });

  // Precompute the two org/role-derived booleans the dialog cluster
  // reads. Done here so ringside doesn't need to import
  // organizationUtils / hasRole.
  const canModifyClassSettings = hasRole(['admin', 'judge']);
  const orgData = parseOrganizationData(showContext?.org || '');
  const hideMaxTimeOption = hasRuleDefinedMaxTimes(orgData) || !canModifyClassSettings;
  const hideSettingsOption = !canModifyClassSettings;

  return (
    <EntryListPage
      classId={classId}
      data={{ entries, classInfo }}
      dataStatus={{ isRefreshing, fetchError, refresh }}
      handlers={handlers}
      actions={actions}
      uiState={{
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
      }}
      uiActions={{
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
        setActiveTab,
        setSortOrder,
        setSearchTerm,
      }}
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
      dialogs={{
        CheckinStatusDialog,
        ClassOptionsDialog,
        ClassStatusDialog,
        ClassRequirementsDialog,
        ClassSettingsDialog,
        MaxTimeDialog,
        RunOrderDialog,
        ScoresheetPrintDialog,
        NoStatsDialog,
        AreaCountSelectionDialog,
      }}
      layout={{
        HamburgerMenu,
        CompactOfflineIndicator,
        SyncIndicator,
        RefreshIndicator,
        FilterTriggerButton,
        FilterPanel,
        DogCard,
        PullToRefresh,
        ErrorState,
        ClassDetailsPopover,
      }}
      context={{
        role,
        showContext,
        hasPermission,
        hideMaxTimeOption,
        hideSettingsOption,
      }}
    />
  );
};

export default EntryList;
