/**
 * The dialog cluster My Shows can open: check-in, edit, receipt, and the Add
 * Dog wizard — their state and the transitions that close them.
 *
 * Extracted from `index.tsx` (MYK9-217). This hook owns state only; where the
 * dialogs are RENDERED is a separate constraint the page still carries (they
 * must stay siblings of the page body — see `MyEntriesDialogGroup`).
 *
 * @module MyEntriesPage/modules/useMyEntriesDialogs
 */

import { useCallback, useState } from 'react';

import type { CheckInStatus } from '@/types/check-in-types';

import type {
  CheckInDialogState,
  EditDialogState,
  EntryClass,
  MyEntry,
  ReceiptDialogState,
} from './my-entries-types';

const CLOSED_CHECK_IN: CheckInDialogState = { open: false, entry: null, classEntry: null };
const CLOSED_EDIT: EditDialogState = { open: false, entry: null };
const CLOSED_RECEIPT: ReceiptDialogState = { open: false, entry: null };

export interface UseMyEntriesDialogsOptions {
  updateEntryCheckIn: (
    entryId: string,
    classId: string,
    status: CheckInStatus,
    notes?: string
  ) => Promise<void>;
  refreshEntries: () => Promise<void>;
}

export interface UseMyEntriesDialogsResult {
  checkInDialog: CheckInDialogState;
  editDialog: EditDialogState;
  receiptDialog: ReceiptDialogState;
  addDogOpen: boolean;
  /** Card handlers — stable identities, so the memoized card list does not
   *  re-render every card when an unrelated dialog opens. */
  openCheckIn: (entry: MyEntry, classEntry: EntryClass) => void;
  openEdit: (entry: MyEntry) => void;
  openReceipt: (entry: MyEntry) => void;
  openAddDog: () => void;
  closeCheckIn: () => void;
  closeEdit: () => void;
  closeReceipt: () => void;
  closeAddDog: () => void;
  submitCheckInStatus: (status: CheckInStatus, notes?: string) => Promise<void>;
  entryUpdated: () => Promise<void>;
}

export function useMyEntriesDialogs({
  updateEntryCheckIn,
  refreshEntries,
}: UseMyEntriesDialogsOptions): UseMyEntriesDialogsResult {
  const [checkInDialog, setCheckInDialog] = useState<CheckInDialogState>(CLOSED_CHECK_IN);
  const [editDialog, setEditDialog] = useState<EditDialogState>(CLOSED_EDIT);
  const [receiptDialog, setReceiptDialog] = useState<ReceiptDialogState>(CLOSED_RECEIPT);
  const [addDogOpen, setAddDogOpen] = useState(false);

  const openCheckIn = useCallback((entry: MyEntry, classEntry: EntryClass) => {
    setCheckInDialog({ open: true, entry, classEntry });
  }, []);
  const openEdit = useCallback((entry: MyEntry) => setEditDialog({ open: true, entry }), []);
  const openReceipt = useCallback((entry: MyEntry) => setReceiptDialog({ open: true, entry }), []);
  const openAddDog = useCallback(() => setAddDogOpen(true), []);

  const closeCheckIn = useCallback(() => setCheckInDialog(CLOSED_CHECK_IN), []);
  const closeEdit = useCallback(() => setEditDialog(CLOSED_EDIT), []);
  const closeReceipt = useCallback(() => setReceiptDialog(CLOSED_RECEIPT), []);
  const closeAddDog = useCallback(() => setAddDogOpen(false), []);

  // INTENT: a rejection here must reach CheckInStatusDialog. The dialog awaits
  // this handler and treats "resolved" as "saved" — it closes itself and only
  // renders its error Alert when the promise rejects. Swallowing the throw made
  // a failed check-in indistinguishable from a successful one: the dialog shut
  // cleanly while `updateEntryCheckIn` reverted the optimistic status, so an
  // exhibitor walked away believing their dog was checked in. Do not reintroduce
  // a catch here; the hook logs and rethrows precisely so this caller can let
  // the failure surface where the exhibitor took the action.
  const submitCheckInStatus = useCallback(
    async (status: CheckInStatus, notes?: string) => {
      if (!checkInDialog.entry || !checkInDialog.classEntry) return;

      await updateEntryCheckIn(checkInDialog.entry.id, checkInDialog.classEntry.id, status, notes);
      setCheckInDialog(CLOSED_CHECK_IN);
    },
    [checkInDialog.entry, checkInDialog.classEntry, updateEntryCheckIn]
  );

  const entryUpdated = useCallback(async () => {
    await refreshEntries();
    setEditDialog(CLOSED_EDIT);
  }, [refreshEntries]);

  return {
    checkInDialog,
    editDialog,
    receiptDialog,
    addDogOpen,
    openCheckIn,
    openEdit,
    openReceipt,
    openAddDog,
    closeCheckIn,
    closeEdit,
    closeReceipt,
    closeAddDog,
    submitCheckInStatus,
    entryUpdated,
  };
}
