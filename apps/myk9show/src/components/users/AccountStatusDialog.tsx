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

export type AccountStatus = 'active' | 'suspended';

interface AccountStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  status: AccountStatus;
  onConfirm: () => void | Promise<void>;
  isUpdating?: boolean;
}

/** Confirmation surface for the account lifecycle action used by roster and record pages. */
export const AccountStatusDialog: React.FC<AccountStatusDialogProps> = ({
  open,
  onOpenChange,
  userName,
  status,
  onConfirm,
  isUpdating = false,
}) => {
  const isSuspending = status === 'active';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isSuspending ? 'Suspend account?' : 'Reinstate account?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isSuspending
              ? `This will immediately block ${userName} from logging in. Continue?`
              : `This will restore ${userName}'s ability to sign in. Continue?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isUpdating}>
            {isUpdating ? 'Saving...' : isSuspending ? 'Suspend account' : 'Reinstate account'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default AccountStatusDialog;
