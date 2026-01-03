import { useState, useCallback } from 'react';
import { Entry } from '../../../stores/entryStore';
import { logger } from '@/utils/logger';

interface UseResetScoreOptions {
  /** Setter for local entries state */
  setLocalEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  /** Setter for active tab state */
  setActiveTab: (tab: 'pending' | 'completed') => void;
  /** Reset score action from useEntryListActions */
  handleResetScoreHook: (entryId: number) => Promise<void>;
}

interface ResetConfirmState {
  show: boolean;
  entry: Entry | null;
}

/**
 * Shared hook for managing reset score state and dialogs.
 * Used by both EntryList and CombinedEntryList.
 */
export const useResetScore = ({
  setLocalEntries,
  setActiveTab,
  handleResetScoreHook,
}: UseResetScoreOptions) => {
  // Reset menu popup state
  const [activeResetMenu, setActiveResetMenu] = useState<number | null>(null);
  const [resetMenuPosition, setResetMenuPosition] = useState<{ top: number; left: number } | null>(null);

  // Reset confirmation dialog state
  const [resetConfirmDialog, setResetConfirmDialog] = useState<ResetConfirmState>({ show: false, entry: null });

  /**
   * Handle clicking the reset menu button on a scored entry
   */
  const handleResetMenuClick = useCallback((e: React.MouseEvent, entryId: number) => {
    e.preventDefault();
    e.stopPropagation();

    const button = e.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();

    setResetMenuPosition({
      top: rect.bottom + 4,
      left: rect.left
    });
    setActiveResetMenu(entryId);
  }, []);

  /**
   * Close the reset menu popup
   */
  const closeResetMenu = useCallback(() => {
    setActiveResetMenu(null);
    setResetMenuPosition(null);
  }, []);

  /**
   * Handle selecting reset score from the menu (shows confirmation dialog)
   */
  const handleResetScore = useCallback((entry: Entry) => {
    setActiveResetMenu(null);
    setResetMenuPosition(null);
    setResetConfirmDialog({ show: true, entry });
  }, []);

  /**
   * Confirm the reset score action
   */
  const confirmResetScore = useCallback(async () => {
    if (!resetConfirmDialog.entry) return;

    const entryId = resetConfirmDialog.entry.id;

    // Update local state IMMEDIATELY (optimistic update - works offline)
    setLocalEntries(prev => prev.map(entry =>
      entry.id === entryId
        ? {
            ...entry,
            isScored: false,
            status: 'no-status',
            checkinStatus: 'no-status',
            checkedIn: false,
            resultText: '',
            searchTime: '',
            faultCount: 0,
            placement: undefined,
            inRing: false
          }
        : entry
    ));

    // Switch to pending tab to show the reset entry
    setActiveTab('pending');

    // Close dialog immediately for better UX
    setResetConfirmDialog({ show: false, entry: null });

    // Sync with server in background (silently fails if offline)
    try {
      await handleResetScoreHook(entryId);
      // Real-time subscription will trigger automatic refresh
    } catch (error) {
      logger.error('Failed to reset score in background:', error);
      // Don't show error to user - offline-first means this is transparent
      // The optimistic update already happened, sync will retry when online
    }
  }, [resetConfirmDialog.entry, setLocalEntries, setActiveTab, handleResetScoreHook]);

  /**
   * Cancel the reset score dialog
   */
  const cancelResetScore = useCallback(() => {
    setResetConfirmDialog({ show: false, entry: null });
  }, []);

  return {
    // Reset menu state
    activeResetMenu,
    resetMenuPosition,
    handleResetMenuClick,
    closeResetMenu,

    // Reset confirmation dialog state
    resetConfirmDialog,
    handleResetScore,
    confirmResetScore,
    cancelResetScore,
  };
};
