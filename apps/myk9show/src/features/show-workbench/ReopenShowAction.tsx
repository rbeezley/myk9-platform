import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowManageScope } from '@/hooks/useShowManageScope';
import { getAnnouncementAuthor } from '@/types/announcement-types';
import { ReopenNoteError, reopenShow } from './reopenShow';

const OFFLINE_MESSAGE =
  'Reopening needs a connection so your reason can be kept. Nothing was changed. Try again when you are online.';
const FAILED_MESSAGE =
  'Reopening the show did not finish. Check your connection and try again; nothing is lost.';

/**
 * MYK9-2428: "Reopen show", offered on a closed show to the show's own staff only (the same
 * scope that can write `show_close_notes`). A reason is required and is kept with the person and
 * the time.
 */
export function ReopenShowAction({ showId }: { showId: string }) {
  const canManage = useShowManageScope(showId).canManage;
  const { user, userWithRoles } = useAuthContext();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isReopening, setIsReopening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) return null;

  async function submit() {
    const author = getAnnouncementAuthor(user, userWithRoles, 'Secretary');
    setIsReopening(true);
    setError(null);
    try {
      await reopenShow({ showId, reason, person: author.name });
    } catch (caught) {
      setIsReopening(false);
      // The note is the online-only step and runs first: when it fails nothing was changed.
      const message = caught instanceof ReopenNoteError ? OFFLINE_MESSAGE : FAILED_MESSAGE;
      setError(message);
      toast.error('The show was not reopened.');
      return;
    }
    setIsReopening(false);
    setOpen(false);
    setReason('');
    toast.success('Show reopened. Trials and classes are back to how they were.');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="mt-3 w-full sm:w-auto">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reopen show
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen this show?</DialogTitle>
          <DialogDescription>
            Trials and classes go back to how they were before the show was closed. Your reason is
            kept with your name and the time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reopen-show-reason">Why are you reopening it?</Label>
          <Textarea
            id="reopen-show-reason"
            value={reason}
            onChange={event => setReason(event.target.value)}
            disabled={isReopening}
            rows={3}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isReopening}
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={isReopening || reason.trim() === ''}>
            {isReopening ? 'Reopening...' : 'Reopen show'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
