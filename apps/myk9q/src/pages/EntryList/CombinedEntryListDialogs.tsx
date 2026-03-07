import React from 'react';
import { CheckinStatusDialog } from '../../components/dialogs/CheckinStatusDialog';
import { RunOrderDialog, RunOrderPreset } from '../../components/dialogs/RunOrderDialog';
import {
  ScoresheetPrintDialog,
  type PrintSortOrder,
} from '../../components/dialogs/ScoresheetPrintDialog';
import { Entry } from '../../stores/entryStore';
import type { RunOrderScope, RenumberMode } from '../../services/runOrderService';
import {
  ResetConfirmDialog,
  SelfCheckinDisabledDialog,
  SuccessToast,
  FloatingDoneButton,
  ResetMenuPopup,
} from './components';
import { PRINT_DIALOG_TITLES } from './CombinedEntryList.helpers';
import type { PrintDialogState, ResetConfirmState, SortOrder } from './CombinedEntryList.types';
import { FilterPanel, SortOption } from '../../components/ui';

export interface CombinedEntryListDialogsProps {
  // Filter panel
  isFilterPanelOpen: boolean;
  onFilterClose: () => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  sortOptions: SortOption[];
  sortOrder: SortOrder;
  onSortChange: (order: SortOrder) => void;
  resultsLabel: string;

  // Checkin status dialog
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

  // Run order dialog
  runOrderDialogOpen: boolean;
  onRunOrderClose: () => void;
  onApplyRunOrder: (
    preset: RunOrderPreset,
    scope?: RunOrderScope,
    renumberMode?: RenumberMode
  ) => Promise<void>;
  onOpenDragMode: () => void;

  // Reset menu/dialog
  activeResetMenu: number | null;
  resetMenuPosition: { top: number; left: number } | null;
  onResetScore: (entry: Entry) => void;
  onResetMenuClose: () => void;
  resetConfirmDialog: ResetConfirmState;
  onConfirmReset: () => void;
  onCancelReset: () => void;

  // Self checkin disabled dialog
  selfCheckinDisabledDialog: boolean;
  onSelfCheckinDisabledClose: () => void;

  // Print dialog
  printDialogState: PrintDialogState;
  onPrintDialogClose: () => void;
  onPrintSortOrder: (sortOrder: PrintSortOrder) => void;

  // Success toast & floating done
  showSuccessMessage: boolean;
  isDragMode: boolean;
  onDoneClick: () => void;
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
