/**
 * The orders list stage a My Shows dialog opens on when one show carries more
 * than one order (design D9).
 *
 * Shared by the receipt dialog and the edit dialog, because "which of my
 * orders?" is the same question in both places and answering it twice is how
 * the two start disagreeing about what an order is called. `mode` controls the
 * money column alone: editing an entry is not a money act, so the edit picker
 * states date, confirmation and dogs and nothing about what was paid.
 *
 * No payment chip renders here, on purpose — this page states money in words
 * (exhibitor-money-on-exception).
 *
 * Lives in its own file rather than inside `MyEntriesDialogs.tsx`, which is
 * within a few lines of the 500-line limit.
 *
 * @module MyEntriesPage/modules/OrdersReceiptsList
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { EntryReceiptOrder } from '@/features/payments/entryReceiptOrder';
import { formatPaymentCents } from '@/features/payments/moneyPresentation';
import { formatShortCalendarDate } from '@/lib/format/dates';
import { PaymentStatus } from '@/types/show-registration-types';
import { getOrderOnlinePrompt } from './myEntryOrderBalance';
import type { MyEntry } from './my-entries-types';

/**
 * The amount a Stripe order charged, for the per-payment chooser below.
 */
function formatOrderAmount(order: EntryReceiptOrder): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: order.currency.toUpperCase(),
    }).format(order.amountCents / 100);
  } catch {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      order.amountCents / 100
    );
  }
}

export type OrdersPickerMode = 'receipt' | 'edit';

/** Every dog the order covers, in card order. */
function orderDogNames(order: MyEntry): string[] {
  return order.dogs.length > 0 ? order.dogs.map(dog => dog.dogName) : [order.dogName];
}

/**
 * What this order's money did, in words.
 *
 * The amount owed is read from the same balance the cart quotes — never
 * re-summed from class fees, which is how My Shows and My Payments start
 * stating two different numbers (exhibitor-money-clarity).
 */
function describeOrderMoney(order: MyEntry): string {
  const dueCents =
    getOrderOnlinePrompt(order).kind === 'finish-online'
      ? (order.balance?.onlineDueCents ?? Math.round(order.totalFee * 100))
      : 0;
  if (dueCents > 0) return `${formatPaymentCents(dueCents, 'USD')} due`;
  if (order.paymentStatus === PaymentStatus.REFUNDED) return 'Refunded';
  return 'Paid';
}

/** The refund note for an order that carries one, else null. */
function describeOrderRefund(order: MyEntry): string | null {
  const amount = order.refundAmount ?? 0;
  if (amount <= 0 || !order.refundedAt) return null;
  const money = formatPaymentCents(Math.round(amount * 100), 'USD');
  const on = formatShortCalendarDate(order.refundedAt);
  return order.paymentStatus === PaymentStatus.PARTIAL_REFUND
    ? `Partial refund of ${money} on ${on}`
    : `Refunded ${money} on ${on}`;
}

/** The confirmation number the exhibitor was given, or the id's stand-in. */
function confirmationOf(order: MyEntry): string {
  return order.confirmationNumber ?? order.id.slice(0, 8).toUpperCase();
}

export interface OrdersReceiptsListProps {
  orders: MyEntry[];
  mode: OrdersPickerMode;
  onSelect: (order: MyEntry) => void;
}

export const OrdersReceiptsList: React.FC<OrdersReceiptsListProps> = ({
  orders,
  mode,
  onSelect,
}) => (
  <ul className="space-y-2">
    {orders.map(order => {
      const dogs = orderDogNames(order).join(', ');
      const confirmation = confirmationOf(order);
      const submitted = formatShortCalendarDate(order.submittedAt);
      const money = mode === 'receipt' ? describeOrderMoney(order) : null;
      const amount = formatPaymentCents(Math.round(order.totalFee * 100), 'USD');
      const refund = mode === 'receipt' ? describeOrderRefund(order) : null;
      return (
        <li key={order.id}>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full justify-between gap-3 text-left"
            aria-label={
              mode === 'receipt'
                ? `Receipt for order ${confirmation} — ${dogs}, ${money}`
                : `Edit order ${confirmation} — ${dogs}`
            }
            onClick={() => onSelect(order)}
          >
            <span className="min-w-0 truncate">
              {submitted} · {confirmation} · {dogs}
            </span>
            {money && (
              <span className="shrink-0 text-right">
                <span className="block font-medium">{amount}</span>
                <span className="block text-xs font-normal text-muted-foreground">{money}</span>
              </span>
            )}
          </Button>
          {refund && <p className="px-3 pt-1 text-sm text-muted-foreground">{refund}</p>}
        </li>
      );
    })}
  </ul>
);

export interface OrdersPickerDialogProps {
  open: boolean;
  mode: OrdersPickerMode;
  orders: MyEntry[];
  onSelect: (order: MyEntry) => void;
  onClose: () => void;
}

/** The list stage as a standalone dialog, for a picker that opens on its own. */
export const OrdersPickerDialog: React.FC<OrdersPickerDialogProps> = ({
  open,
  mode,
  orders,
  onSelect,
  onClose,
}) => (
  <Dialog open={open} onOpenChange={next => !next && onClose()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {mode === 'receipt' ? 'Orders and receipts' : 'Choose an entry to edit'}
        </DialogTitle>
        <DialogDescription>
          {mode === 'receipt'
            ? 'You placed more than one order for this show. Choose the one you need.'
            : 'You placed more than one order for this show. Choose the one you want to change.'}
        </DialogDescription>
      </DialogHeader>
      <OrdersReceiptsList orders={orders} mode={mode} onSelect={onSelect} />
      <div className="flex justify-end">
        <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
          Close
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export interface StripeOrderChooserDialogProps {
  open: boolean;
  orders: EntryReceiptOrder[];
  onSelect: (orderId: string) => void;
  onClose: () => void;
}

/**
 * The SECOND picker the receipt path can need: one registration paid by more
 * than one Stripe order (a capacity split, or a wait-list promotion paid
 * later). Distinct from `OrdersReceiptsList`, which chooses between the
 * exhibitor's ORDER CARDS; this one chooses between payments against one card.
 *
 * Moved here from `MyEntriesDialogs.tsx` unchanged, so that file stays under
 * the 500-line limit once the card-level list stage lands beside it.
 */
export const StripeOrderChooserDialog: React.FC<StripeOrderChooserDialogProps> = ({
  open,
  orders,
  onSelect,
  onClose,
}) => (
  <Dialog open={open} onOpenChange={next => !next && onClose()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Choose a receipt</DialogTitle>
        <DialogDescription>
          This registration was paid in more than one order. Choose the payment receipt you need.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        {orders.map(order => {
          // Date and amount, because a raw UUID tells the exhibitor nothing
          // about which of their two payments this is.
          // `paidOn`, not `createdAt`: capture can lag creation, and this
          // chooser sits one click from the My Payments row that shows
          // `paid_at ?? created_at`.
          const paidOn = order.paidOn
            ? new Date(order.paidOn).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : 'Date unavailable';
          const amount = formatOrderAmount(order);
          return (
            <Button
              key={order.id}
              variant="outline"
              className="min-h-11 w-full justify-between gap-3"
              aria-label={`Receipt for the ${amount} payment on ${paidOn}`}
              onClick={() => onSelect(order.id)}
            >
              <span className="truncate">{paidOn}</span>
              <span className="shrink-0 font-mono text-sm">{amount}</span>
            </Button>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);
