/**
 * CombinedEntryListDialogs — dialog cluster for the combined-class
 * EntryList page (`/class/:classIdA/:classIdB/entries/combined`).
 *
 * Moved into @myk9/ringside in PR E2d-2b. Host coupling reduced to:
 *  - 4 dialog/panel components are now required slot props:
 *    CheckinStatusDialog, RunOrderDialog, ScoresheetPrintDialog,
 *    FilterPanel.
 *  - 5 leaf components (ResetMenuPopup, ResetConfirmDialog,
 *    SelfCheckinDisabledDialog, SuccessToast, FloatingDoneButton) are
 *    direct sibling imports — already in ringside since PR E2d-2a.
 *  - `PRINT_DIALOG_TITLES` is imported from sibling
 *    `combinedEntryListHelpers` (already in ringside).
 *  - `Entry`, `RunOrderScope`, `RenumberMode`, `RunOrderPreset`,
 *    `PrintSortOrder`, `PrintDialogState`, `ResetConfirmState`,
 *    `SortOrder`, `FilterPanelSortOption` all come from ringside.
 *
 * The combined view is a *subset* of the single-class flows — no
 * class-options cascade, no max-time/requirements/settings dialogs,
 * no area-count, no status dialog. Hence only 4 dialog slots vs 9.
 */

import React from 'react';
import type { ComponentType } from 'react';
import type { Entry } from '../../stores/entryStore';
import type {
  CheckinStatusDialogProps,
  RunOrderDialogProps,
  ScoresheetPrintDialogProps,
  RunOrderPreset,
  RunOrderScope,
  RenumberMode,
  PrintSortOrder,
} from './dialogSlots';
import type {
  FilterPanelProps,
  FilterPanelSortOption,
} from './pageProps';
import {
  ResetConfirmDialog,
  ResetMenuPopup,
  SelfCheckinDisabledDialog,
  SuccessToast,
  FloatingDoneButton,
} from './components';
import { PRINT_DIALOG_TITLES } from './combinedEntryListHelpers';
import type { PrintDialogState, ResetConfirmState, SortOrder } from './types';

export interface CombinedEntryListDialogsProps {
  // ── Filter panel ──────────────────────────────────────────────────
  isFilterPanelOpen: boolean;
  onFilterClose: () => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  sortOptions: FilterPanelSortOption[];
  sortOrder: SortOrder;
  onSortChange: (order: SortOrder) => void;
  resultsLabel: string;

  // ── Checkin status dialog ─────────────────────────────────────────
  activeStatusPopup: number | null;
  onStatusPopupClose: () => void;
  onStatusChange: (
    entryId: number,
    status:
      | 'no-status'
      | 'checked-in'
      | 'conflict'
      | 'pulled'
      | 'at-gate'
      | 'come-to-gate'
      | 'in-ring'
      | 'completed'
  ) => void;
  localEntries: Entry[];
  hasCanScorePermission: boolean;

  // ── Run order dialog ──────────────────────────────────────────────
  runOrderDialogOpen: boolean;
  onRunOrderClose: () => void;
  onApplyRunOrder: (
    preset: RunOrderPreset,
    scope?: RunOrderScope,
    renumberMode?: RenumberMode
  ) => Promise<void>;
  onOpenDragMode: () => void;

  // ── Reset menu/dialog ─────────────────────────────────────────────
  activeResetMenu: number | null;
  resetMenuPosition: { top: number; left: number } | null;
  onResetScore: (entry: Entry) => void;
  onResetMenuClose: () => void;
  resetConfirmDialog: ResetConfirmState;
  onConfirmReset: () => void;
  onCancelReset: () => void;

  // ── Self checkin disabled dialog ──────────────────────────────────
  selfCheckinDisabledDialog: boolean;
  onSelfCheckinDisabledClose: () => void;

  // ── Print dialog ──────────────────────────────────────────────────
  printDialogState: PrintDialogState;
  onPrintDialogClose: () => void;
  onPrintSortOrder: (sortOrder: PrintSortOrder) => void;

  // ── Success toast & floating done ─────────────────────────────────
  showSuccessMessage: boolean;
  isDragMode: boolean;
  onDoneClick: () => void;

  // ── Host-injected primitives ──────────────────────────────────────
  CheckinStatusDialog: ComponentType<CheckinStatusDialogProps>;
  RunOrderDialog: ComponentType<RunOrderDialogProps>;
  ScoresheetPrintDialog: ComponentType<ScoresheetPrintDialogProps>;
  FilterPanel: ComponentType<FilterPanelProps>;
}

export const CombinedEntryListDialogs: React.FC<CombinedEntryListDialogsProps> = ({
  isFilterPanelOpen,
  onFilterClose,
  searchTerm,
  onSearchChange,
  sortOptions,
  sortOrder,
  onSortChange,
  resultsLabel,
  activeStatusPopup,
  onStatusPopupClose,
  onStatusChange,
  localEntries,
  hasCanScorePermission,
  runOrderDialogOpen,
  onRunOrderClose,
  onApplyRunOrder,
  onOpenDragMode,
  activeResetMenu,
  resetMenuPosition,
  onResetScore,
  onResetMenuClose,
  resetConfirmDialog,
  onConfirmReset,
  onCancelReset,
  selfCheckinDisabledDialog,
  onSelfCheckinDisabledClose,
  printDialogState,
  onPrintDialogClose,
  onPrintSortOrder,
  showSuccessMessage,
  isDragMode,
  onDoneClick,
  CheckinStatusDialog,
  RunOrderDialog,
  ScoresheetPrintDialog,
  FilterPanel,
}) => (
  <>
    <FilterPanel
      isOpen={isFilterPanelOpen}
      onClose={onFilterClose}
      searchTerm={searchTerm}
      onSearchChange={onSearchChange}
      searchPlaceholder="Search dog, handler, breed, armband..."
      sortOptions={sortOptions}
      sortOrder={sortOrder}
      onSortChange={order => onSortChange(order as SortOrder)}
      resultsLabel={resultsLabel}
    />

    <CheckinStatusDialog
      isOpen={activeStatusPopup !== null}
      onClose={onStatusPopupClose}
      onStatusChange={status => {
        if (activeStatusPopup !== null) {
          onStatusChange(activeStatusPopup, status);
        }
      }}
      dogInfo={{
        armband: localEntries.find(e => e.id === activeStatusPopup)?.armband || 0,
        callName: localEntries.find(e => e.id === activeStatusPopup)?.callName || '',
        handler: localEntries.find(e => e.id === activeStatusPopup)?.handler || '',
      }}
      showDescriptions={true}
      showRingManagement={hasCanScorePermission}
    />

    <RunOrderDialog
      isOpen={runOrderDialogOpen}
      onClose={onRunOrderClose}
      entries={localEntries}
      onApplyOrder={onApplyRunOrder}
      onOpenDragMode={onOpenDragMode}
    />

    <ResetMenuPopup
      activeEntryId={activeResetMenu}
      position={resetMenuPosition}
      entries={localEntries}
      onResetScore={onResetScore}
      onClose={onResetMenuClose}
    />

    <ResetConfirmDialog
      isOpen={resetConfirmDialog.show}
      entry={resetConfirmDialog.entry}
      onConfirm={onConfirmReset}
      onCancel={onCancelReset}
    />

    <SelfCheckinDisabledDialog
      isOpen={selfCheckinDisabledDialog}
      onClose={onSelfCheckinDisabledClose}
    />

    <ScoresheetPrintDialog
      isOpen={printDialogState.type !== null}
      onClose={onPrintDialogClose}
      onPrint={onPrintSortOrder}
      title={
        (printDialogState.type && PRINT_DIALOG_TITLES[printDialogState.type]) || 'Print Report'
      }
      options={
        printDialogState.type === 'results-a' || printDialogState.type === 'results-b'
          ? {
              primary: { label: 'Placement', sortOrder: 'placement' },
              secondary: { label: 'Armband Number', sortOrder: 'armband' },
            }
          : undefined
      }
    />

    <SuccessToast isVisible={showSuccessMessage} message="Run order updated successfully" />

    <FloatingDoneButton isVisible={isDragMode} onClick={onDoneClick} />
  </>
);
