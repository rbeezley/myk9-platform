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
import type { SignOutWarningContext } from '@/components/layout/signOutGuard';

interface SignOutWarningDialogProps {
  /** Null renders nothing — the dialog only exists while a guarded sign-out is pending. */
  context: SignOutWarningContext | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Consequence warning for guarded sign-outs (MYK9-202). Hosted by AccountMenu
 * as a sibling of the dropdown — like AboutDialog — so the menu closes
 * normally and can never stack above the modal.
 */
export function SignOutWarningDialog({ context, onCancel, onConfirm }: SignOutWarningDialogProps) {
  if (!context) return null;

  const isOffline = context.mode === 'offline';

  return (
    <AlertDialog open onOpenChange={open => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isOffline ? "You're offline" : 'Sign out before a show?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isOffline
              ? 'If you sign out now, you cannot sign back in until you have internet again.'
              : 'If you lose internet at the show site, you cannot sign back in until it returns. Stay signed in unless this is a shared device.'}
            {isOffline && context.hasUnsyncedChanges
              ? " You also have changes on this device that haven't synced yet."
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Stay signed in</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Sign out anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
