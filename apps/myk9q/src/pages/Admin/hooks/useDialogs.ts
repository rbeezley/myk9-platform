/**
 * useDialogs Hook
 *
 * Manages all dialog states for CompetitionAdmin page.
 * Handles confirmation dialog, success dialog, and admin name dialog.
 *
 * Extracted from CompetitionAdmin.tsx
 */

import { useState, useCallback } from 'react';

/**
 * Confirmation dialog type
 */
export type ConfirmDialogAction = 'release' | 'enable_checkin' | 'disable_checkin' | null;
export type ConfirmDialogType = 'success' | 'warning' | 'danger';

/**
 * Confirmation dialog state
 */
export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  type: ConfirmDialogType;
  action: ConfirmDialogAction;
  details: string[];
}

/**
 * Success dialog state
 */
export interface SuccessDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  details: string[];
}

/**
 * Admin name dialog state
 */
export interface AdminNameDialogState {
  isOpen: boolean;
  pendingAction: (() => void) | null;
}

/**
 * Hook return type
 */
export interface UseDialogsReturn {
  // Confirm Dialog State
  confirmDialog: ConfirmDialogState;
  setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogState>>;
  handleConfirmAction: (action: () => void) => void;
  handleCancelAction: () => void;

  // Success Dialog State
  successDialog: SuccessDialogState;
  setSuccessDialog: React.Dispatch<React.SetStateAction<SuccessDialogState>>;
  closeSuccessDialog: () => void;

  // Admin Name Dialog State
  adminNameDialog: AdminNameDialogState;
  setAdminNameDialog: React.Dispatch<React.SetStateAction<AdminNameDialogState>>;
  tempAdminName: string;
  setTempAdminName: React.Dispatch<React.SetStateAction<string>>;
  openAdminNameDialog: (adminName: string, action: () => void) => void;
  handleAdminNameSubmit: (adminName: string, setAdminName: (name: string) => void) => void;
  handleAdminNameCancel: () => void;
}

/**
 * Custom hook for managing CompetitionAdmin dialog states
 *
 * Provides state and methods for:
 * - **Confirmation Dialog**: Get user confirmation for actions like releasing results
 * - **Success Dialog**: Show success/error messages with details
 * - **Admin Name Dialog**: Prompt for admin name before critical actions
 *
 * **Confirmation Dialog**: Used for destructive or important actions
 * **Success Dialog**: Used for operation results and error messages
 * **Admin Name Dialog**: Collects admin name before executing pending action
 *
 * @returns Dialog states and control methods
 *
 * @example
 * ```tsx
 * function CompetitionAdmin() {
 *   const {
 *     confirmDialog,
 *     setConfirmDialog,
 *     handleConfirmAction,
 *     handleCancelAction,
 *     successDialog,
 *     closeSuccessDialog,
 *     openAdminNameDialog,
 *     handleAdminNameSubmit
 *   } = useDialogs();
 *
 *   const showReleaseConfirmation = () => {
 *     setConfirmDialog({
 *       isOpen: true,
 *       title: 'Release Results',
 *       message: 'Are you sure?',
 *       type: 'warning',
 *       action: 'release',
 *       details: ['Class 1', 'Class 2']
 *     });
 *   };
 *
 *   return (
 *     <>
 *       <button onClick={showReleaseConfirmation}>Release Results</button>
 *       <ConfirmationDialog
 *         {...confirmDialog}
 *         onConfirm={() => handleConfirmAction(releaseResults)}
 *         onCancel={handleCancelAction}
 *       />
 *       <SuccessDialog
 *         {...successDialog}
 *         onClose={closeSuccessDialog}
 *       />
 *     </>
 *   );
 * }
 * ```
 */
export function useDialogs(): UseDialogsReturn {
  // Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    action: null,
    details: []
  });

  // Success Dialog State
  const [successDialog, setSuccessDialog] = useState<SuccessDialogState>({
    isOpen: false,
    title: '',
    message: '',
    details: []
  });

  // Admin Name Dialog State
  const [adminNameDialog, setAdminNameDialog] = useState<AdminNameDialogState>({
    isOpen: false,
    pendingAction: null
  });

  // Temporary admin name for the dialog
  const [tempAdminName, setTempAdminName] = useState<string>('');

  /**
   * Handle confirmation dialog action
   * Closes dialog and executes the provided action
   */
  const handleConfirmAction = useCallback((action: () => void) => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
    action();
  }, []);

  /**
   * Handle confirmation dialog cancellation
   * Just closes the dialog
   */
  const handleCancelAction = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
  }, []);

  /**
   * Close success dialog
   */
  const closeSuccessDialog = useCallback(() => {
    setSuccessDialog(prev => ({ ...prev, isOpen: false }));
  }, []);

  /**
   * Open admin name dialog with pending action
   * Pre-fills dialog with current admin name
   */
  const openAdminNameDialog = useCallback((adminName: string, action: () => void) => {
    setTempAdminName(adminName); // Pre-fill with current value if any
    setAdminNameDialog({
      isOpen: true,
      pendingAction: action
    });
  }, []);

  /**
   * Handle admin name dialog submission
   * Saves admin name and executes pending action
   */
  const handleAdminNameSubmit = useCallback((adminName: string, setAdminName: (name: string) => void) => {
    // Save the admin name
    setAdminName(adminName.trim());

    // Get and close the dialog
    const pendingAction = adminNameDialog.pendingAction;
    setAdminNameDialog({
      isOpen: false,
      pendingAction: null
    });

    // Execute the pending action if it exists
    if (pendingAction) {
      pendingAction();
    }
  }, [adminNameDialog.pendingAction]);

  /**
   * Handle admin name dialog cancellation
   * Just closes the dialog without executing action
   */
  const handleAdminNameCancel = useCallback(() => {
    setAdminNameDialog({
      isOpen: false,
      pendingAction: null
    });
  }, []);

  return {
    // Confirm Dialog
    confirmDialog,
    setConfirmDialog,
    handleConfirmAction,
    handleCancelAction,

    // Success Dialog
    successDialog,
    setSuccessDialog,
    closeSuccessDialog,

    // Admin Name Dialog
    adminNameDialog,
    setAdminNameDialog,
    tempAdminName,
    setTempAdminName,
    openAdminNameDialog,
    handleAdminNameSubmit,
    handleAdminNameCancel,
  };
}
