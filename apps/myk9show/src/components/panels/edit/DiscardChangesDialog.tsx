import { useCallback, useState } from 'react';
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
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
 * For surfaces that own their form state instead of using `EditPanelWrapper`:
 * route every close through `requestClose`, render `discardDialog`, and a close
 * with unsaved changes asks first. A close the surface makes on its own behalf
 * (after a save) calls `close` directly.
 */
export function useDiscardPrompt({ isDirty, close }: { isDirty: boolean; close: () => void }) {
  const [promptOpen, setPromptOpen] = useState(false);

  const requestClose = useCallback(() => {
    if (isDirty) {
      setPromptOpen(true);
      return;
    }
    close();
  }, [isDirty, close]);

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
