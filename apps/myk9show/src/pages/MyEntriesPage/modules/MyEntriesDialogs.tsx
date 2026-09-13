/**
 * Dialog wrappers for the My Shows page (check-in, edit, receipt).
 * Extracted from `index.tsx` (task 4.7) to keep the page shell under the
 * 500-line ratchet; behavior is unchanged from the original inline
 * sub-components.
 *
 * @module MyEntriesPage/modules/MyEntriesDialogs
 */

import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckInStatus } from '@/types/check-in-types';
import { CheckInStatusDialog } from '@/components/common/CheckInStatusDialog';
import { EntryEditDialog } from '@/components/entries/EntryEditDialog';
import { EntryReceipt } from '@/components/entries/EntryReceipt';
import { ShowPresenceProvider } from '@/features/show-presence/ShowPresenceProvider';
import { AddDogPanel } from '@/components/panels/edit';
import { ResultRevealDialog, type ResultCardModel } from '@/features/result-card';
import { useEntryReceiptOrders } from '@/features/payments/entryReceiptOrder';
import { orderRefundStatusLabel } from '@/features/payments/orderRefundReconciliation';
import { ENTRY_SCOPE_ORDER_PARAM } from '@/features/payments/entryScopeParams';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import type { CheckInDialogState, EditDialogState, ReceiptDialogState } from './my-entries-types';
import { CardDerivedReceipt } from './CardDerivedReceipt';
import { buildOrderScopedReceipt } from './orderScopedReceipt';
import { OrdersPickerDialog, StripeOrderChooserDialog } from './OrdersReceiptsList';

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
  // Which of a multi-order show's editable orders the exhibitor picked. Held
  // here rather than in the hook so the hook's `openEdit` stays per order and
  // the picker is purely a stage of this dialog (design D9).
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const candidates = dialog.orders ?? [];
  // A list of one is just that one — the hook already unwraps it, and honouring
  // it here too means neither caller can produce an empty-looking dialog.
  const entry =
    dialog.entry ??
    candidates.find(order => order.id === pickedId) ??
    (candidates.length === 1 ? candidates[0] : null);
  const close = () => {
    setPickedId(null);
    onClose();
  };

  if (!entry) {
    if (candidates.length < 2) return null;
    return (
      <OrdersPickerDialog
        open={dialog.open}
        mode="edit"
        orders={candidates}
        onSelect={order => setPickedId(order.id)}
        onClose={close}
      />
    );
  }

  // Map classes to match EntryEditDialog's expected type
  const mappedClasses = entry.classes.map(c => ({
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
    <ShowPresenceProvider showId={entry.showId}>
      <EntryEditDialog
        open={dialog.open}
        onOpenChange={open => !open && close()}
        entry={{
          id: entry.id,
          showId: entry.showId,
          showName: entry.showName,
          dogName: entry.dogName,
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
  // This dialog reads its own deep-link param rather than having the page pass
  // it down. The receipt is the only consumer of `orderId`, and a prop threaded
  // through the page put the one line that connects URL to dialog outside the
  // reach of any test — a mutation to `null` there left every suite green while
  // silently disabling the whole deep-linked path.
  const [searchParams] = useSearchParams();
  const receiptOrderId = searchParams.get(ENTRY_SCOPE_ORDER_PARAM)?.trim() || null;
  const [selectedOrderId, setSelectedOrderId] = React.useState<string | null>(null);
  // Which ORDER CARD the exhibitor picked out of a multi-order show's list
  // stage (design D9). Distinct from `selectedOrderId`, which picks a Stripe
  // payment inside one card.
  const [pickedCardId, setPickedCardId] = React.useState<string | null>(null);
  const candidates = dialog.orders ?? (dialog.entry ? [dialog.entry] : []);
  const pickedCard = candidates.find(order => order.id === pickedCardId) ?? null;
  const chosen = dialog.entry ?? pickedCard ?? (candidates.length === 1 ? candidates[0] : null);
  // With a card in hand the query is scoped to that card's rows, exactly as
  // before. With none — the list stage — it runs only for a deep-linked
  // `?orderId=`, over every candidate's rows, so the named order can be traced
  // back to the card that paid for it and opened directly (spec: the deep link
  // is unchanged). Without that param the query stays disabled and the list
  // renders immediately.
  const receiptOrders = useEntryReceiptOrders({
    requestedOrderId: receiptOrderId,
    viewerId: (user as { id?: string } | null)?.id ?? null,
    entryIds: (chosen ? [chosen] : candidates).flatMap(order =>
      order.classes.map(classEntry => classEntry.id)
    ),
    enabled: dialog.open && candidates.length > 0 && (Boolean(chosen) || Boolean(receiptOrderId)),
  });
  const closeReceipt = () => {
    setSelectedOrderId(null);
    setPickedCardId(null);
    onClose();
  };

  // `isPending` alone is true forever for a DISABLED query, which would park
  // the dialog on a spinner with nothing loading. Require an in-flight fetch.
  if (receiptOrders.isPending && receiptOrders.fetchStatus !== 'idle') {
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

  const allOrders = receiptOrders.data ?? [];
  // The deep link wins over the list stage: a `?orderId=` that resolves to one
  // of these cards opens that card's receipt directly, however many were passed.
  const deepLinked = receiptOrderId
    ? (candidates.find(order => {
        const rows = new Set(order.classes.map(classEntry => classEntry.id));
        return allOrders.some(
          paid => paid.id === receiptOrderId && paid.entryIds.some(id => rows.has(id))
        );
      }) ?? null)
    : null;
  const cardEntry = chosen ?? deepLinked;

  if (!cardEntry) {
    if (candidates.length < 2) return null;
    return (
      <OrdersPickerDialog
        open={dialog.open}
        mode="receipt"
        orders={candidates}
        onSelect={order => setPickedCardId(order.id)}
        onClose={closeReceipt}
      />
    );
  }
  // Back to the list, but only for an exhibitor who came through it.
  const onBack = pickedCard
    ? () => {
        setSelectedOrderId(null);
        setPickedCardId(null);
      }
    : undefined;

  const cardEntryIds = new Set(cardEntry.classes.map(classEntry => classEntry.id));
  // A deep-linked ?orderId= sticks in the URL after the dialog closes. If the
  // named entry rows had not replicated, the list fell back to SHOW scope and
  // several cards are on screen — so the next Receipt click would resolve a
  // perfectly valid order that has nothing to do with the card clicked, and
  // buildOrderScopedReceipt would refuse it. Only honour the requested order
  // for the card it actually paid for.
  const orders = allOrders.filter(order => order.entryIds.some(id => cardEntryIds.has(id)));

  if (receiptOrders.isError) {
    // Unavailable is not the same as absent. Print what the card knows — that
    // is what a receipt has always been offline — and say plainly that we could
    // not confirm it against the payment. The figure is labelled as entry fees,
    // never as an amount charged, so nothing here asserts what Stripe took.
    return (
      <CardDerivedReceipt
        dialog={dialog}
        entry={cardEntry}
        user={user}
        onClose={closeReceipt}
        onBack={onBack}
        notice="We could not reach the payment record, so this shows your entry fees rather than the exact amount charged."
        onRetry={() => void receiptOrders.refetch()}
      />
    );
  }

  if (orders.length === 0) {
    // No Stripe order for this registration. Normal and common: cash, check and
    // secretary-recorded entries never have one, and a payment-link order is
    // not readable by the exhibitor. The card receipt is the correct document
    // here, not an error with a Try again that could never succeed.
    return (
      <CardDerivedReceipt
        dialog={dialog}
        entry={cardEntry}
        user={user}
        onClose={closeReceipt}
        onBack={onBack}
      />
    );
  }

  if (orders.length > 1 && !selectedOrderId) {
    return (
      <StripeOrderChooserDialog
        open={dialog.open}
        orders={orders}
        onSelect={setSelectedOrderId}
        onClose={closeReceipt}
      />
    );
  }

  const selectedOrder =
    orders.find(order => order.id === selectedOrderId) ?? (orders.length === 1 ? orders[0] : null);
  const entry = buildOrderScopedReceipt(cardEntry, selectedOrder);
  if (!entry || !selectedOrder) {
    // The order is real but its rows have not all replicated (or one is still
    // an unresolved placeholder). Fall back rather than dead-end: the card
    // receipt is complete and honest, and Retry can upgrade it.
    return (
      <CardDerivedReceipt
        dialog={dialog}
        entry={cardEntry}
        user={user}
        onClose={closeReceipt}
        onBack={onBack}
        notice="Some class details for this payment are still syncing, so this shows your entry fees rather than the exact amount charged."
        onRetry={() => void receiptOrders.refetch()}
      />
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
        charge: {
          entrySubtotal: entry.entrySubtotal,
          platformFee: entry.platformFee,
          overflowCharged: entry.overflowCharged,
          amountCharged: entry.amountCharged,
          refunded: entry.refunded,
          netPaid: entry.netPaid,
        },
        currency: entry.currency,
        paymentReference: entry.paymentReference,
        orderId: entry.orderId,
        submittedAt: entry.submittedAt,
        paymentStatus: orderRefundStatusLabel(selectedOrder),
      }}
      {...(onBack && { onBack })}
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
