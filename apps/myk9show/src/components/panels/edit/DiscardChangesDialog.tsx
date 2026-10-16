import { useCallback, useState, type ComponentProps } from 'react';
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

/** The one "Discard changes?" prompt, shared by every editing surface (H15). */
export function DiscardChangesDialog({
  open,
  onOpenChange,
  onDiscard,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  /** Base UI's return-focus rule for this dialog; omit for the default. */
  finalFocus?: ComponentProps<typeof AlertDialogContent>['finalFocus'];
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent {...(finalFocus !== undefined && { finalFocus })}>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. They will be lost if you close without saving.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onDiscard}
          >
            Discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Explains why a panel will not close while its save is in flight (MYK9-1125):
 * the save may still fail back to the form, so the panel holds still, but it
 * never ignores the person silently. `ask` opens it; it closes itself once the
 * save settles, and Keep waiting is its only answer.
 */
export function useStillSavingPrompt(saving: boolean) {
  const [open, setOpen] = useState(false);
  // Reset during render when the save ends (React's "adjust state on a prop
  // change" pattern), so a later save never reopens a stale prompt.
  const [wasSaving, setWasSaving] = useState(saving);
  if (saving !== wasSaving) {
    setWasSaving(saving);
    if (!saving) setOpen(false);
  }
  const ask = useCallback(() => setOpen(true), []);

  const dialog = (
    <AlertDialog open={open && saving} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Still saving</AlertDialogTitle>
          <AlertDialogDescription>
            Waiting for the server to answer. This panel will close or show an error as soon as it
            does.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep waiting</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { open: open && saving, ask, dialog };
}

/**
 * For surfaces that own their form state instead of using `EditPanelWrapper`:
 * route every close through `requestClose`, render `discardDialog`, and a close
 * with unsaved changes asks first. A close the surface makes on its own behalf
 * (after a save) calls `close` directly.
 */
export function useDiscardPrompt({
  isDirty,
  close,
  blocked = false,
}: {
  isDirty: boolean;
  close: () => void;
  /** True while a save is in flight: every dismissal is ignored, as the save may still fail. */
  blocked?: boolean;
}) {
  const [promptOpen, setPromptOpen] = useState(false);

  const requestClose = useCallback(() => {
    if (blocked) return;
    if (isDirty) {
      setPromptOpen(true);
      return;
    }
    close();
  }, [blocked, isDirty, close]);

  const discardDialog = (
    <DiscardChangesDialog
      open={promptOpen}
      onOpenChange={setPromptOpen}
      onDiscard={() => {
        setPromptOpen(false);
        close();
      }}
    />
  );

  return { requestClose, discardDialog };
}
