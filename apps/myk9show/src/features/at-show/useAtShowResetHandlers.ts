/**
 * The reset-score menu and confirmation handlers of the at-show entry list, split out of
 * `useAtShowEntryListHandlers` to keep that file under its size budget.
 *
 * MYK9-1847: a score is not reset while its class is cancelled; the steward's Change Status
 * path is how the class comes back.
 */
import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction, MouseEvent as ReactMouseEvent } from 'react';
import type { Entry, EntryListActions, EntryListHandlers } from '@myk9/ringside';
import { toast } from 'sonner';
import { logger } from '@/utils/logger';
import { CANCELLED_CLASS_MESSAGE } from './cancelledClassGuard';

export type ResetConfirmState = { show: boolean; entry: Entry | null };

export interface UseAtShowResetHandlersDeps {
  actions: EntryListActions;
  isClassCancelled: (classId: string) => boolean;
  refresh: (forceSync?: boolean) => Promise<void>;
  setActiveResetMenu: Dispatch<SetStateAction<string | null>>;
  setResetMenuPosition: Dispatch<SetStateAction<{ top: number; left: number } | null>>;
  setResetConfirmDialog: Dispatch<SetStateAction<ResetConfirmState>>;
  setActiveTab: (tab: 'pending' | 'completed') => void;
}

type ResetHandlerNames =
  | 'handleResetMenuClick'
  | 'handleResetScore'
  | 'confirmResetScore'
  | 'cancelResetScore'
  | 'closeResetMenu';

export function useAtShowResetHandlers({
  actions,
  isClassCancelled,
  refresh,
  setActiveResetMenu,
  setResetMenuPosition,
  setResetConfirmDialog,
  setActiveTab,
}: UseAtShowResetHandlersDeps): Pick<EntryListHandlers, ResetHandlerNames> {
  // The entry whose reset is awaiting confirmation. Captured when the reset menu
  // opens the dialog so confirmResetScore (which takes no args) knows the target.
  const resetEntryRef = useRef<Entry | null>(null);

  const handleResetMenuClick = useCallback<EntryListHandlers['handleResetMenuClick']>(
    (e: ReactMouseEvent, entryId) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setResetMenuPosition({ top: rect.bottom + 4, left: rect.right });
      setActiveResetMenu(entryId);
    },
    [setResetMenuPosition, setActiveResetMenu]
  );

  const handleResetScore = useCallback<EntryListHandlers['handleResetScore']>(
    entry => {
      setActiveResetMenu(null);
      setResetMenuPosition(null);
      if (isClassCancelled(entry.classId)) {
        toast.info(CANCELLED_CLASS_MESSAGE);
        return;
      }
      resetEntryRef.current = entry;
      setResetConfirmDialog({ show: true, entry });
    },
    [isClassCancelled, setActiveResetMenu, setResetMenuPosition, setResetConfirmDialog]
  );

  const confirmResetScore = useCallback<EntryListHandlers['confirmResetScore']>(async () => {
    const entry = resetEntryRef.current;
    // Close the dialog and move the row to the pending tab immediately for a
    // responsive feel; the persisted clear + refresh runs underneath.
    setResetConfirmDialog({ show: false, entry: null });
    // The class can be cancelled while the confirmation is open.
    if (entry && isClassCancelled(entry.classId)) {
      resetEntryRef.current = null;
      toast.info(CANCELLED_CLASS_MESSAGE);
      return;
    }
    setActiveTab('pending');
    if (!entry) return;
    try {
      await actions.handleResetScore(entry.id);
      await refresh();
    } catch (error) {
      logger.error('[at-show] reset score failed', 'at-show', { error: String(error) });
    } finally {
      resetEntryRef.current = null;
    }
  }, [actions, isClassCancelled, refresh, setActiveTab, setResetConfirmDialog]);

  const cancelResetScore = useCallback<EntryListHandlers['cancelResetScore']>(() => {
    setResetConfirmDialog({ show: false, entry: null });
  }, [setResetConfirmDialog]);

  const closeResetMenu = useCallback<EntryListHandlers['closeResetMenu']>(() => {
    setActiveResetMenu(null);
    setResetMenuPosition(null);
  }, [setActiveResetMenu, setResetMenuPosition]);

  return {
    handleResetMenuClick,
    handleResetScore,
    confirmResetScore,
    cancelResetScore,
    closeResetMenu,
  };
}
