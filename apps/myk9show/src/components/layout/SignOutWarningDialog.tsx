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
import {
  unsentPhrase,
  unsentTotal,
  type SignOutWarningContext,
} from '@/components/layout/signOutGuard';

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

  const { mode, unsent } = context;
  const isOffline = mode === 'offline';
  const unsentLabel = unsent !== null && unsentTotal(unsent) > 0 ? unsentPhrase(unsent) : null;
  const title = unsentLabel
    ? unsentLabel
    : isOffline
      ? "You're offline"
      : mode === 'staff-online'
        ? 'Sign out before a show?'
        : 'Sign out?';
  // MYK9-2013: unsent work is named first, for every account and every passcode.
  const lines = [
    unsentLabel
      ? 'Anything not sent is saved on this phone only. Stay signed in and keep this phone on and connected until it is sent.'
      : null,
    unsent === null ? 'This phone could not be checked for scores that have not been sent.' : null,
    isOffline
      ? 'If you sign out now, you cannot sign back in until you have internet again.'
      : mode === 'staff-online'
        ? 'If you lose internet at the show site, you cannot sign back in until it returns. Stay signed in unless this is a shared device.'
        : null,
  ].filter((line): line is string => line !== null);

  return (
    <AlertDialog open onOpenChange={open => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{lines.join(' ')}</AlertDialogDescription>
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
