import { useCallback, useState, type ComponentProps, type MutableRefObject } from 'react';
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
 * Asked when someone closes a panel whose save has not come back yet
 * (MYK9-1125). Leaving does not cancel the save; its result is toasted later.
 */
export function StillSavingDialog({
  open,
  onOpenChange,
  onLeave,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeave: () => void;
  finalFocus?: ComponentProps<typeof AlertDialogContent>['finalFocus'];
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent {...(finalFocus !== undefined && { finalFocus })}>
        <AlertDialogHeader>
          <AlertDialogTitle>Still saving</AlertDialogTitle>
          <AlertDialogDescription>
            Your changes haven&apos;t finished saving. If you leave, the save keeps going in the
            background and you&apos;ll see a message when it finishes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep waiting</AlertDialogCancel>
          <AlertDialogAction onClick={onLeave}>Leave anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type PromptState = readonly [open: boolean, setOpen: (open: boolean) => void];

/** EditPanelWrapper's two close prompts: "Discard changes?" and "Still saving". */
export function EditPanelClosePrompts({
  discard: [discardOpen, setDiscardOpen],
  stillSaving: [stillSavingOpen, setStillSavingOpen],
  inline,
  confirmedCloseRef,
  onLeaveWhileSaving,
  close,
}: {
  discard: PromptState;
  stillSaving: PromptState;
  inline: boolean;
  /** Set once a prompt confirmed the close, so the shell's own close does not re-ask. */
  confirmedCloseRef: MutableRefObject<boolean>;
  onLeaveWhileSaving: () => void;
  close: () => void;
}) {
  // Inline: confirming unmounts this form and the prompt with it, and the
  // dialog's default return-focus then falls back to some EARLIER popup's
  // trigger behind the host's modal. The host places focus itself.
  const focus = inline ? { finalFocus: () => !confirmedCloseRef.current } : {};
  return (
    <>
      <DiscardChangesDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        {...focus}
        onDiscard={() => {
          confirmedCloseRef.current = true;
          setDiscardOpen(false);
          close();
        }}
      />
      <StillSavingDialog
        open={stillSavingOpen}
        onOpenChange={setStillSavingOpen}
        {...focus}
        onLeave={() => {
          confirmedCloseRef.current = true;
          onLeaveWhileSaving();
          close();
        }}
      />
    </>
  );
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
