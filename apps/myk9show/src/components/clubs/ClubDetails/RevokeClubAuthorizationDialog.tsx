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

interface RevokeClubAuthorizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubName: string;
  onConfirm: () => void;
}

/**
 * P3-C: revoking immediately blocks the club from publishing any NEW show, so it asks first.
 * Opened from the header Actions menu's "Revoke Authorization" (CRUD standard decision 6).
 */
export const RevokeClubAuthorizationDialog: React.FC<RevokeClubAuthorizationDialogProps> = ({
  open,
  onOpenChange,
  clubName,
  onConfirm,
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Revoke this club&apos;s authorization?</AlertDialogTitle>
        <AlertDialogDescription>
          Stop {clubName} from publishing new shows. It stays visible wherever it already has a
          published show.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
          className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
        >
          Revoke Authorization
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
