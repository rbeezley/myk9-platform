/**
 * Action Confirmation Dialog for WaitlistManagementPage: offer a spot, remove
 * a dog from the wait list, or withdraw an open offer (MYK9-1001). Each says
 * what really happens, including who is and is not told (MYK9-1002).
 */

import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { formatOfferDeadline, formatOfferWindow } from '@/lib/format/offerDeadline';
import type { ActionDialogState } from './types';

/** The window an offer made now gets, and the zone its deadline reads in. */
export interface OfferWindow {
  /** shows.waitlist_payment_deadline_hours as the server applies it; null while unknown. */
  hours: number | null;
  /** The offered class's trial zone (New York when unknown). */
  timezone: string | null;
}

interface WaitlistActionDialogProps {
  actionDialog: ActionDialogState;
  isProcessing: boolean;
  offerWindow: OfferWindow;
  onClose: () => void;
  onOfferSpot: () => void;
  onRemove: () => void;
  onWithdraw: () => void;
}

const TITLES = {
  offer: 'Offer Spot?',
  remove: 'Remove from Waitlist?',
  withdraw: 'Withdraw Offer?',
} as const;

const CONFIRM_LABELS = {
  offer: 'Offer Spot',
  remove: 'Remove',
  withdraw: 'Withdraw offer',
} as const;

/** "They have 48 hours to pay (until Wed, Jul 15, 2:00 PM EDT)." Mounted when the dialog opens. */
function OfferWindowSentence({ offerWindow }: { offerWindow: OfferWindow }) {
  const [openedAt] = useState(() => Date.now());
  if (offerWindow.hours === null) {
    return <>They have the offer window set in Wait list settings to pay.</>;
  }
  const until = formatOfferDeadline(
    new Date(openedAt + offerWindow.hours * 3_600_000),
    offerWindow.timezone
  );
  return (
    <>
      They have <strong>{formatOfferWindow(offerWindow.hours)}</strong> to pay
      {until ? <> (until {until})</> : null}.
    </>
  );
}

export const WaitlistActionDialog: React.FC<WaitlistActionDialogProps> = ({
  actionDialog,
  isProcessing,
  offerWindow,
  onClose,
  onOfferSpot,
  onRemove,
  onWithdraw,
}) => {
  const action = actionDialog.action ?? 'remove';
  const entry = actionDialog.entry;
  const dogName = <strong>{entry?.dog?.call_name ?? entry?.dog?.name}</strong>;
  const className = <strong>{entry?.class?.name}</strong>;

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  const handleAction = () => {
    if (action === 'offer') onOfferSpot();
    else if (action === 'withdraw') onWithdraw();
    else onRemove();
  };

  return (
    <AlertDialog open={actionDialog.open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{TITLES[action]}</AlertDialogTitle>
          <AlertDialogDescription>
            {action === 'offer' && (
              <>
                Offer a spot to {dogName} in {className}? This creates an entry waiting for payment
                and tells the exhibitor.{' '}
                <OfferWindowSentence key={entry?.id} offerWindow={offerWindow} /> If they don&apos;t
                pay in time, the offer ends and the spot opens again.
                {entry?.joined_via === 'mail_in' &&
                  ' This dog was entered by mail, so no payment link is sent: collect payment directly.'}
              </>
            )}
            {action === 'remove' && (
              <>
                Remove {dogName} from the waitlist for {className}? The exhibitor is not notified,
                so let them know. This cannot be undone.
              </>
            )}
            {action === 'withdraw' && (
              <>
                Withdraw the offer to {dogName} in {className}? Their payment link stops working,
                the entry waiting for payment is cancelled, and the dog leaves the wait list. The
                exhibitor is not notified, so let them know.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleAction}
            disabled={isProcessing}
            className={
              action === 'offer'
                ? ''
                : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            }
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              CONFIRM_LABELS[action]
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
