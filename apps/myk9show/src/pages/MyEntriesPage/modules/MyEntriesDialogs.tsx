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
import { AddDogPanel } from '@/components/panels/edit';
import { ResultRevealDialog, type ResultCardModel } from '@/features/result-card';
import { useEntryReceiptOrders } from '@/features/payments/entryReceiptOrder';
import { paymentStatusLabel } from '@/features/payments/moneyPresentation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { CheckInDialogState, EditDialogState, ReceiptDialogState } from './my-entries-types';
import { buildOrderScopedReceipt } from './orderScopedReceipt';

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
  receiptOrderId: string | null;
  user: { email?: string; user_metadata?: Record<string, string> } | null;
  onClose: () => void;
}

export const ReceiptEntryDialog: React.FC<ReceiptEntryDialogProps> = ({
  dialog,
  receiptOrderId,
  user,
  onClose,
}) => {
  const [selectedOrderId, setSelectedOrderId] = React.useState<string | null>(null);
  const receiptOrders = useEntryReceiptOrders({
    requestedOrderId: receiptOrderId,
    entryIds: dialog.entry?.classes.map(classEntry => classEntry.id) ?? [],
    enabled: dialog.open && Boolean(dialog.entry),
  });
  const closeReceipt = () => {
    setSelectedOrderId(null);
    onClose();
  };
  if (!dialog.entry) return null;

  if (receiptOrders.isPending) {
    return (
      <Dialog open={dialog.open} onOpenChange={open => !open && closeReceipt()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preparing receipt</DialogTitle>
            <DialogDescription>
              Loading the exact payment details for this receipt.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-24 items-center justify-center" role="status">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            <span className="sr-only">Loading receipt</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const orders = receiptOrders.data ?? [];
  if (receiptOrders.isError || orders.length === 0) {
    return (
      <Dialog open={dialog.open} onOpenChange={open => !open && closeReceipt()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receipt unavailable</DialogTitle>
            <DialogDescription>
              We couldn't load the payment details. Try again so the receipt shows the exact amount
              charged.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeReceipt}>
              Close
            </Button>
            <Button onClick={() => void receiptOrders.refetch()}>Try again</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!receiptOrderId && orders.length > 1 && !selectedOrderId) {
    return (
      <Dialog open={dialog.open} onOpenChange={open => !open && closeReceipt()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose a receipt</DialogTitle>
            <DialogDescription>
              This registration was paid in more than one order. Choose the payment receipt you
              need.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {orders.map(order => (
              <Button
                key={order.id}
                variant="outline"
                className="min-h-11 w-full justify-between gap-3"
                aria-label={`Receipt for order ${order.id}`}
                onClick={() => setSelectedOrderId(order.id)}
              >
                <span className="truncate font-mono text-sm">{order.id}</span>
                {order.reference && (
                  <span className="shrink-0 truncate text-xs text-muted-foreground">
                    {order.reference}
                  </span>
                )}
              </Button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={closeReceipt}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const selectedOrder =
    orders.find(order => order.id === (receiptOrderId ?? selectedOrderId)) ??
    (!receiptOrderId && !selectedOrderId && orders.length === 1 ? orders[0] : null);
  const entry = buildOrderScopedReceipt(dialog.entry, selectedOrder);
  if (!entry || !selectedOrder) {
    return (
      <Dialog open={dialog.open} onOpenChange={open => !open && closeReceipt()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receipt entries still loading</DialogTitle>
            <DialogDescription>
              This payment is available, but its class details have not finished loading. Close this
              receipt and try again shortly.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeReceipt}>
              Close
            </Button>
            <Button onClick={() => void receiptOrders.refetch()}>Try again</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const exhibitorName = user?.user_metadata?.full_name || user?.email?.split('@')[0];
  const exhibitorEmail = user?.email;

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
      onOpenChange={open => !open && closeReceipt()}
      entry={{
        id: entry.id,
        confirmationNumber: entry.confirmationNumber ?? entry.id.slice(0, 8).toUpperCase(),
        showName: entry.showName,
        showDate: entry.showDate,
        location: entry.location,
        dogName: entry.dogName,
        classes: mappedClasses,
        totalFee: entry.totalFee,
        amountCharged: entry.totalFee,
        currency: entry.currency,
        paymentReference: entry.paymentReference,
        orderId: entry.orderId,
        submittedAt: entry.submittedAt,
        paymentStatus: paymentStatusLabel(selectedOrder.status),
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
  receiptOrderId: string | null;
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
  receiptOrderId,
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

    <ReceiptEntryDialog
      dialog={receiptDialog}
      receiptOrderId={receiptOrderId}
      user={user}
      onClose={onCloseReceipt}
    />

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
