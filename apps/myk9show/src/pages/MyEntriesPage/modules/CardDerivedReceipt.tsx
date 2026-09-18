/**
 * The offline-honest receipt: everything the replicated card knows, and no
 * claim about what Stripe charged.
 *
 * Split out of `MyEntriesDialogs.tsx` so that file stays under the 500-line
 * limit once the orders list stage lands (design D9/D10); the component itself
 * is unchanged apart from the optional `onBack` the list stage needs.
 *
 * @module MyEntriesPage/modules/CardDerivedReceipt
 */

import React from 'react';
import { EntryReceipt } from '@/components/entries/EntryReceipt';
import { PaymentStatus } from '@/types/show-registration-types';
import type { MyEntry, ReceiptDialogState } from './my-entries-types';

/**
 * A receipt built from the replicated card alone. This is the document that
 * cash, check and secretary-recorded registrations have always printed, and
 * the one that still works with no signal on an offline-first surface. It
 * states entry fees and makes no claim about what Stripe charged.
 */
export interface CardDerivedReceiptProps {
  dialog: ReceiptDialogState;
  entry: MyEntry;
  user: { email?: string; user_metadata?: Record<string, string> } | null;
  onClose: () => void;
  /** Returns to the orders list stage; absent unless the exhibitor came via it. */
  onBack?: (() => void) | undefined;
  notice?: string;
  onRetry?: () => void;
}

export const CardDerivedReceipt: React.FC<CardDerivedReceiptProps> = ({
  dialog,
  entry,
  user,
  onClose,
  onBack,
  notice,
  onRetry,
}) => {
  const isPaid =
    entry.paymentStatus === PaymentStatus.PAID_ONLINE ||
    entry.paymentStatus === PaymentStatus.PAID_BY_CHECK ||
    entry.paymentStatus === PaymentStatus.PAID_BY_CASH;
  const exhibitorName = user?.user_metadata?.full_name || user?.email?.split('@')[0];
  const exhibitorEmail = user?.email;

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
        classes: entry.classes.map(c => ({
          id: c.id,
          name: c.name,
          number: c.number,
          fee: c.fee,
          status: c.status,
          ...(c.jumpHeight !== undefined && { jumpHeight: c.jumpHeight }),
          ...(c.runOrder !== undefined && { runOrder: c.runOrder }),
        })),
        totalFee: entry.totalFee,
        submittedAt: entry.submittedAt,
        paymentStatus: isPaid ? 'Paid' : 'Pending',
      }}
      {...(onBack && { onBack })}
      {...(notice && { notice })}
      {...(onRetry && { onRetry })}
      {...(exhibitorName && { exhibitorName })}
      {...(exhibitorEmail && { exhibitorEmail })}
    />
  );
};
