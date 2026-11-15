import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { notifications } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { friendlyDbError } from '@/utils/friendlyDbError';

interface JudgeNewCodeButtonProps {
  showId: string;
  personId: string;
  judgeName: string;
  /** Called after the server replaced this judge's code, so the card re-reads its rows. */
  onReplaced: () => void;
  /** Called with a plain-language message when the code could not be replaced. */
  onError: (message: string) => void;
}

/**
 * "New code" for ONE judge row (MYK9-1951): confirms, then calls regenerate_judge_passcode for
 * that judge only. The other codes and the regenerate-all action are untouched.
 */
export function JudgeNewCodeButton({
  showId,
  personId,
  judgeName,
  onReplaced,
  onError,
}: JudgeNewCodeButtonProps) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  async function replaceCode() {
    if (working) return;
    setWorking(true);
    const failureMessage = `Could not generate a new code for ${judgeName}. Please try again.`;
    try {
      const { error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ data: string | null; error: { message: string } | null }>
      )('regenerate_judge_passcode', { p_show_id: showId, p_person_id: personId });

      if (error) {
        const message = friendlyDbError(error, failureMessage);
        onError(message);
        notifications.error(message);
        return;
      }
      onReplaced();
      notifications.success(`New code generated for ${judgeName}.`);
    } catch (caught) {
      const message = friendlyDbError(caught, failureMessage);
      onError(message);
      notifications.error(message);
    } finally {
      setWorking(false);
      setOpen(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="touch"
        className="gap-1.5 text-xs"
        aria-label={`New code for ${judgeName}`}
        onClick={() => setOpen(true)}
      >
        <KeyRound className="h-3 w-3" />
        New code
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>New code for {judgeName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their old code stops working. Give {judgeName} the new code. Every other code stays
              the same. {judgeName} will be asked for the new code. Scores already on their phone
              are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={replaceCode} disabled={working}>
              {working ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                'Generate'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
