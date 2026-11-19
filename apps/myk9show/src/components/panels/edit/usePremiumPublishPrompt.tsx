import { useCallback, useRef, useState } from 'react';
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

export type PremiumPublishChoice = 'publish' | 'discard' | 'cancel';

/**
 * MYK9-2201: Save with premium edits and "Generate exhibitor documents on save" unticked asks
 * what to do with them instead of dropping them silently. `ask` resolves with the answer;
 * closing the dialog any other way (Escape, outside click) is `cancel`, which saves nothing.
 */
export function usePremiumPublishPrompt() {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((choice: PremiumPublishChoice) => void) | null>(null);

  const answer = useCallback((choice: PremiumPublishChoice) => {
    setOpen(false);
    resolver.current?.(choice);
    resolver.current = null;
  }, []);

  const ask = useCallback(
    () =>
      new Promise<PremiumPublishChoice>(resolve => {
        resolver.current = resolve;
        setOpen(true);
      }),
    []
  );

  const dialog = (
    <AlertDialog
      open={open}
      onOpenChange={next => {
        if (!next) answer('cancel');
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publish these premium changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You edited the premium narratives or details. Publish them to exhibitors, or save the
            rest of the show without them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* A visible way back that saves nothing: Base UI's AlertDialog ignores outside taps,
              so without it only a keyboard's Escape could keep editing. */}
          <AlertDialogCancel onClick={() => answer('cancel')}>Keep editing</AlertDialogCancel>
          <AlertDialogCancel onClick={() => answer('discard')}>
            Discard premium changes
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => answer('publish')}>Publish</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { ask, dialog };
}
