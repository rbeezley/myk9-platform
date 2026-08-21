/**
 * Dialog wrappers for the My Shows page (check-in, edit, receipt).
 * Extracted from `index.tsx` (task 4.7) to keep the page shell under the
 * 500-line ratchet; behavior is unchanged from the original inline
 * sub-components.
 *
 * @module MyEntriesPage/modules/MyEntriesDialogs
 */

import React from 'react';
import { CheckInStatus } from '@/types/check-in-types';
import { CheckInStatusDialog } from '@/components/common/CheckInStatusDialog';
import { EntryEditDialog } from '@/components/entries/EntryEditDialog';
import { EntryReceipt } from '@/components/entries/EntryReceipt';
import { ShowPresenceProvider } from '@/features/show-presence/ShowPresenceProvider';
import { PaymentStatus } from '@/types/show-registration-types';
import { AddDogPanel } from '@/components/panels/edit';
import { ResultRevealDialog, type ResultCardModel } from '@/features/result-card';
import type { CheckInDialogState, EditDialogState, ReceiptDialogState } from './my-entries-types';

interface CheckInDialogProps {
  dialog: CheckInDialogState;
  user: { email?: string; id?: string; user_metadata?: Record<string, string> } | null;
  onClose: () => void;
  onUpdateStatus: (status: CheckInStatus, notes?: string) => Promise<void>;
}

export const CheckInDialog: React.FC<CheckInDialogProps> = ({
  dialog,
  user,
  onClose,
  onUpdateStatus,
}) => {
  if (!dialog.entry || !dialog.classEntry) return null;

  return (
    <CheckInStatusDialog
      open={dialog.open}
      onOpenChange={open => !open && onClose()}
      currentStatus={dialog.classEntry.checkInStatus || 'no-status'}
      entryInfo={{
        armband: dialog.entry.armband,
        confirmationNumber: dialog.entry.confirmationNumber,
        dogName: dialog.entry.dogName,
        // Was `user?.email` — the dialog put a raw email address where a
        // person's name belongs, which reads as leaked plumbing rather than
        // "your dog, your class". Same derivation the receipt dialog already
        // uses below, so the exhibitor sees one identity across both.
        handlerName: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Handler',
        className: dialog.classEntry.name,
        classNumber: dialog.classEntry.number,
      }}
      onUpdateStatus={onUpdateStatus}
      readOnly={false}
      userRole="exhibitor"
    />
  );
};

interface EditEntryDialogProps {
  dialog: EditDialogState;
  onClose: () => void;
  onUpdate: () => void;
}

export const EditEntryDialog: React.FC<EditEntryDialogProps> = ({ dialog, onClose, onUpdate }) => {
  if (!dialog.entry) return null;

  // Map classes to match EntryEditDialog's expected type
  const mappedClasses = dialog.entry.classes.map(c => ({
    id: c.id,
    name: c.name,
    number: c.number,
    fee: c.fee,
    status: c.status,
    ...(c.jumpHeight !== undefined && { jumpHeight: c.jumpHeight }),
    ...(c.trialType !== undefined && { trialType: c.trialType }),
    ...(c.handler !== undefined && { handler: c.handler }),
    ...(c.runOrder !== undefined && { runOrder: c.runOrder }),
  }));

  // MyEntriesPage is cross-show (/my-entries spans many shows), so it can't take a
  // single page-level presence boundary. Instead wrap just the open dialog in a
  // per-show ShowPresenceProvider keyed on this entry's show — that makes the
  // exhibitor a presence producer for the relevant show while editing, so the
  // Phase 3 edit-awareness hook/badge inside the dialog have a roster to ride.
  return (
    <ShowPresenceProvider showId={dialog.entry.showId}>
      <EntryEditDialog
        open={dialog.open}
        onOpenChange={open => !open && onClose()}
        entry={{
          id: dialog.entry.id,
          showId: dialog.entry.showId,
          showName: dialog.entry.showName,
          dogName: dialog.entry.dogName,
          classes: mappedClasses,
        }}
        onUpdate={onUpdate}
      />
    </ShowPresenceProvider>
  );
};

interface ReceiptEntryDialogProps {
  dialog: ReceiptDialogState;
  user: { email?: string; user_metadata?: Record<string, string> } | null;
  onClose: () => void;
}

export const ReceiptEntryDialog: React.FC<ReceiptEntryDialogProps> = ({
  dialog,
  user,
  onClose,
}) => {
  if (!dialog.entry) return null;

  const entry = dialog.entry;
  const isPaid =
    entry.paymentStatus === PaymentStatus.PAID_ONLINE ||
    entry.paymentStatus === PaymentStatus.PAID_BY_CHECK ||
    entry.paymentStatus === PaymentStatus.PAID_BY_CASH;

  const exhibitorName = user?.user_metadata?.full_name || user?.email?.split('@')[0];
  const exhibitorEmail = user?.email;

  // KNOWN LIMITATION (pre-dates the receipt deep-link): this receipt is
  // CARD-scoped, not order-scoped. A card is one grouped registration, and a
  // registration can be paid by more than one Stripe order — a capacity split
  // sends the overflow to the wait list, and its later promotion pays
  // separately. In that case every class row and `entry.totalFee` below cover
  // BOTH orders, so a receipt reached from either payment overstates it. My
  // Payments' Receipt link reports `partial` rather than claiming an exact
  // match for exactly this reason (see entryScopeFilter), but the fix is an
  // order-aware receipt, which this dialog cannot express today.
  //
  // Map classes to match EntryReceipt's expected type
  const mappedClasses = entry.classes.map(c => ({
    id: c.id,
    name: c.name,
    number: c.number,
    fee: c.fee,
    status: c.status,
    ...(c.jumpHeight !== undefined && { jumpHeight: c.jumpHeight }),
    ...(c.runOrder !== undefined && { runOrder: c.runOrder }),
  }));

  return (
    <EntryReceipt
      open={dialog.open}
      onOpenChange={open => !open && onClose()}
      entry={{
        id: entry.id,
        confirmationNumber: entry.confirmationNumber ?? entry.id.slice(0, 8).toUpperCase(),
        showName: entry.showName,
        showDate: entry.showDate,
        location: entry.location,
        dogName: entry.dogName,
        classes: mappedClasses,
        totalFee: entry.totalFee,
        submittedAt: entry.submittedAt,
        paymentStatus: isPaid ? 'Paid' : 'Pending',
      }}
      {...(exhibitorName && { exhibitorName })}
      {...(exhibitorEmail && { exhibitorEmail })}
    />
  );
};

interface MyEntriesDialogGroupProps {
  user: { email?: string; id?: string; user_metadata?: Record<string, string> } | null;
  checkInDialog: CheckInDialogState;
  onCloseCheckIn: () => void;
  onUpdateCheckInStatus: (status: CheckInStatus, notes?: string) => Promise<void>;
  editDialog: EditDialogState;
  onCloseEdit: () => void;
  onEntryUpdated: () => void;
  receiptDialog: ReceiptDialogState;
  onCloseReceipt: () => void;
  resultRevealModel: ResultCardModel | null;
  onCloseResultReveal: () => void;
  /** Receives the model's release key so the "already seen" marker is per-release. */
  onResultRevealSeen: (releaseKey: string) => void;
  addDogOpen: boolean;
  onCloseAddDog: () => void;
  currentUserPersonId: string | undefined;
}

/**
 * INTENT: every dialog the My Shows page can open, as one unit rendered
 * OUTSIDE the page body.
 *
 * The page swaps its body between loading, error, and loaded trees.
 * `isInitialEntriesSyncing` flips on replication sync ticks the exhibitor
 * never triggered, so if these dialogs lived inside the body an ordinary
 * background sync would unmount an Add Dog wizard mid-edit and silently
 * reset it to its first tab with an empty form.
 *
 * Grouping them here is what lets `index.tsx` render one stable child at a
 * fixed position — merely duplicating the dialogs into each branch would
 * still remount them, because differently shaped trees reconcile as
 * different elements. Keep this rendered unconditionally by the page.
 */
export const MyEntriesDialogGroup: React.FC<MyEntriesDialogGroupProps> = ({
  user,
  checkInDialog,
  onCloseCheckIn,
  onUpdateCheckInStatus,
  editDialog,
  onCloseEdit,
  onEntryUpdated,
  receiptDialog,
  onCloseReceipt,
  resultRevealModel,
  onCloseResultReveal,
  onResultRevealSeen,
  addDogOpen,
  onCloseAddDog,
  currentUserPersonId,
}) => (
  <>
    <CheckInDialog
      dialog={checkInDialog}
      user={user}
      onClose={onCloseCheckIn}
      onUpdateStatus={onUpdateCheckInStatus}
    />

    <EditEntryDialog dialog={editDialog} onClose={onCloseEdit} onUpdate={onEntryUpdated} />

    <ReceiptEntryDialog dialog={receiptDialog} user={user} onClose={onCloseReceipt} />

    <ResultRevealDialog
      open={resultRevealModel != null}
      onOpenChange={open => {
        if (!open) onCloseResultReveal();
      }}
      model={resultRevealModel}
      onSeen={onResultRevealSeen}
    />

    <AddDogPanel
      open={addDogOpen}
      onClose={onCloseAddDog}
      onDogCreated={onCloseAddDog}
      currentUserPersonId={currentUserPersonId}
    />
  </>
);
