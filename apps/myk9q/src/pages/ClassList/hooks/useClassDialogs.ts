/**
 * useClassDialogs Hook
 *
 * Manages all dialog states for ClassList page.
 * Handles status, requirements, max time, and settings dialogs plus popup menu positioning.
 *
 * Extracted from ClassList.tsx
 */

import { useState, useCallback } from 'react';
import type { ClassEntry } from './useClassListData';

/**
 * Popup position for menu positioning
 */
export interface PopupPosition {
  top: number;
  left: number;
}

/**
 * Hook return type
 */
export interface UseClassDialogsReturn {
  // Popup Menu State
  activePopup: number | null;
  popupPosition: PopupPosition | null;
  setActivePopup: (classId: number | null) => void;
  setPopupPosition: (position: PopupPosition | null) => void;

  // Status Dialog State (Note: managed by useClassStatus, included here for completeness)
  statusDialogOpen: boolean;
  selectedClassForStatus: ClassEntry | null;
  setStatusDialogOpen: (open: boolean) => void;
  setSelectedClassForStatus: (classEntry: ClassEntry | null) => void;

  // Requirements Dialog State
  requirementsDialogOpen: boolean;
  selectedClassForRequirements: ClassEntry | null;
  setRequirementsDialogOpen: (open: boolean) => void;
  setSelectedClassForRequirements: (classEntry: ClassEntry | null) => void;
  openRequirementsDialog: (classEntry: ClassEntry) => void;
  closeRequirementsDialog: () => void;

  // Max Time Dialog State
  maxTimeDialogOpen: boolean;
  selectedClassForMaxTime: ClassEntry | null;
  setMaxTimeDialogOpen: (open: boolean) => void;
  setSelectedClassForMaxTime: (classEntry: ClassEntry | null) => void;
  openMaxTimeDialog: (classEntry: ClassEntry) => void;
  closeMaxTimeDialog: () => void;

  // Settings Dialog State
  settingsDialogOpen: boolean;
  selectedClassForSettings: ClassEntry | null;
  setSettingsDialogOpen: (open: boolean) => void;
  setSelectedClassForSettings: (classEntry: ClassEntry | null) => void;
  openSettingsDialog: (classEntry: ClassEntry) => void;
  closeSettingsDialog: () => void;

  // Utility methods
  closeAllDialogs: () => void;
  closePopup: () => void;
}

/**
 * Custom hook for managing class dialog states
 *
 * Provides state and methods for:
 * - **Popup Menu**: Positioning and visibility for class action menu
 * - **Status Dialog**: Change class status (managed separately by useClassStatus)
 * - **Requirements Dialog**: View/edit class requirements
 * - **Max Time Dialog**: Set maximum time for class
 * - **Settings Dialog**: Configure class-specific settings
 *
 * **Dialog Pattern**: Each dialog has:
 * - Open/close state boolean
 * - Selected class reference
 * - Open/close helper methods
 *
 * **Popup Menu**: Special handling for positioning relative to trigger button
 *
 * @returns Dialog states and control methods
 *
 * @example
 * ```tsx
 * function ClassList() {
 *   const {
 *     requirementsDialogOpen,
 *     selectedClassForRequirements,
 *     openRequirementsDialog,
 *     closeRequirementsDialog,
 *     activePopup,
 *     closePopup
 *   } = useClassDialogs();
 *
 *   return (
 *     <>
 *       <button onClick={() => openRequirementsDialog(classEntry)}>
 *         View Requirements
 *       </button>
 *
 *       <RequirementsDialog
 *         open={requirementsDialogOpen}
 *         classEntry={selectedClassForRequirements}
 *         onClose={closeRequirementsDialog}
 *       />
 *
 *       {activePopup && (
 *         <PopupMenu classId={activePopup} onClose={closePopup} />
 *       )}
 *     </>
 *   );
 * }
 * ```
 */
export function useClassDialogs(): UseClassDialogsReturn {
  // Popup Menu State
  const [activePopup, setActivePopup] = useState<number | null>(null);
  const [popupPosition, setPopupPosition] = useState<PopupPosition | null>(null);

  // Status Dialog State (Note: typically managed by useClassStatus)
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedClassForStatus, setSelectedClassForStatus] = useState<ClassEntry | null>(null);

  // Requirements Dialog State
  const [requirementsDialogOpen, setRequirementsDialogOpen] = useState(false);
  const [selectedClassForRequirements, setSelectedClassForRequirements] = useState<ClassEntry | null>(null);

  // Max Time Dialog State
  const [maxTimeDialogOpen, setMaxTimeDialogOpen] = useState(false);
  const [selectedClassForMaxTime, setSelectedClassForMaxTime] = useState<ClassEntry | null>(null);

  // Settings Dialog State
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [selectedClassForSettings, setSelectedClassForSettings] = useState<ClassEntry | null>(null);

  /**
   * Open requirements dialog with selected class
   */
  const openRequirementsDialog = useCallback((classEntry: ClassEntry) => {
    setSelectedClassForRequirements(classEntry);
    setRequirementsDialogOpen(true);
  }, []);

  /**
   * Close requirements dialog
   */
  const closeRequirementsDialog = useCallback(() => {
    setRequirementsDialogOpen(false);
    setSelectedClassForRequirements(null);
  }, []);

  /**
   * Open max time dialog with selected class
   */
  const openMaxTimeDialog = useCallback((classEntry: ClassEntry) => {
    setSelectedClassForMaxTime(classEntry);
    setMaxTimeDialogOpen(true);
  }, []);

  /**
   * Close max time dialog
   */
  const closeMaxTimeDialog = useCallback(() => {
    setMaxTimeDialogOpen(false);
    setSelectedClassForMaxTime(null);
  }, []);

  /**
   * Open settings dialog with selected class
   */
  const openSettingsDialog = useCallback((classEntry: ClassEntry) => {
    setSelectedClassForSettings(classEntry);
    setSettingsDialogOpen(true);
  }, []);

  /**
   * Close settings dialog
   */
  const closeSettingsDialog = useCallback(() => {
    setSettingsDialogOpen(false);
    setSelectedClassForSettings(null);
  }, []);

  /**
   * Close all dialogs at once
   */
  const closeAllDialogs = useCallback(() => {
    setStatusDialogOpen(false);
    setSelectedClassForStatus(null);
    setRequirementsDialogOpen(false);
    setSelectedClassForRequirements(null);
    setMaxTimeDialogOpen(false);
    setSelectedClassForMaxTime(null);
    setSettingsDialogOpen(false);
    setSelectedClassForSettings(null);
    setActivePopup(null);
    setPopupPosition(null);
  }, []);

  /**
   * Close popup menu
   */
  const closePopup = useCallback(() => {
    setActivePopup(null);
    setPopupPosition(null);
  }, []);

  return {
    // Popup Menu State
    activePopup,
    popupPosition,
    setActivePopup,
    setPopupPosition,

    // Status Dialog State
    statusDialogOpen,
    selectedClassForStatus,
    setStatusDialogOpen,
    setSelectedClassForStatus,

    // Requirements Dialog State
    requirementsDialogOpen,
    selectedClassForRequirements,
    setRequirementsDialogOpen,
    setSelectedClassForRequirements,
    openRequirementsDialog,
    closeRequirementsDialog,

    // Max Time Dialog State
    maxTimeDialogOpen,
    selectedClassForMaxTime,
    setMaxTimeDialogOpen,
    setSelectedClassForMaxTime,
    openMaxTimeDialog,
    closeMaxTimeDialog,

    // Settings Dialog State
    settingsDialogOpen,
    selectedClassForSettings,
    setSettingsDialogOpen,
    setSelectedClassForSettings,
    openSettingsDialog,
    closeSettingsDialog,

    // Utility methods
    closeAllDialogs,
    closePopup,
  };
}
