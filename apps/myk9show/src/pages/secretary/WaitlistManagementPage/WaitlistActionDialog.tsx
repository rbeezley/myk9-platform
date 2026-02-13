/**
 * Action Confirmation Dialog for WaitlistManagementPage
 */

import React from 'react';
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
import type { ActionDialogState, ClassWithWaitlistCount } from './types';

interface WaitlistActionDialogProps {
  actionDialog: ActionDialogState;
  selectedClass: ClassWithWaitlistCount | undefined;
  isProcessing: boolean;
  onClose: () => void;
  onOfferSpot: () => void;
  onRemove: () => void;
}

export const WaitlistActionDialog: React.FC<WaitlistActionDialogProps> = ({
  actionDialog,
  selectedClass,
  isProcessing,
  onClose,
  onOfferSpot,
  onRemove,
}) => {
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  const handleAction = () => {
    if (actionDialog.action === 'offer') {
      onOfferSpot();
    } else {
      onRemove();
    }
  };

  return (
    <AlertDialog open={actionDialog.open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {actionDialog.action === 'offer' ? 'Offer Spot?' : 'Remove from Waitlist?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {actionDialog.action === 'offer' ? (
              <>
                Are you sure you want to offer a spot to{' '}
                <strong>{actionDialog.entry?.dog?.name}</strong> in{' '}
                <strong>{selectedClass?.name}</strong>? This will move them from the waitlist
                to accepted entries. The exhibitor will be notified.
              </>
            ) : (
              <>
                Are you sure you want to remove{' '}
                <strong>{actionDialog.entry?.dog?.name}</strong> from the waitlist for{' '}
                <strong>{selectedClass?.name}</strong>? This action cannot be undone.
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
              actionDialog.action === 'remove'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : ''
            }
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : actionDialog.action === 'offer' ? (
              'Offer Spot'
            ) : (
              'Remove'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
