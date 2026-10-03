// "Resolve without refund" for one queued refund (Codex round 6 on #2689).
//
// INTENT: when a charge was honored another way (entries fulfilled by hand),
// the request must be retired explicitly, or someone can still approve a full
// refund later. It is a deliberate, confirmed, written decision: the note is
// required and says how the charge was honored.

import { useId, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useResolveRefundRequest } from '@/features/admin-system-health/useRefundRequests';

export function ResolveWithoutRefundButton({
  requestId,
  amount,
}: {
  requestId: string;
  amount: string;
}) {
  const { mutateAsync, isPending } = useResolveRefundRequest();
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState('');
  const noteId = useId();
  const hasNote = note.trim().length > 0;

  async function resolve() {
    try {
      await mutateAsync({ requestId, note: note.trim() });
      toast.success(`Resolved without refund. The ${amount} will not be refunded.`);
      setIsOpen(false);
      setNote('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The request was not resolved.');
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" disabled={isPending}>
          Resolve without refund
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Resolve without refunding {amount}?</AlertDialogTitle>
          <AlertDialogDescription>
            Use this when the charge was honored another way, for example the entries were marked
            paid by hand. The request leaves the queue and can never be approved for a refund.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={noteId}>How was the charge honored? (required)</Label>
          <Textarea
            id={noteId}
            value={note}
            onChange={event => setNote(event.target.value)}
            disabled={isPending}
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          {/* A plain button, not AlertDialogAction (which always closes): a
              refused resolution keeps the dialog and the note open. */}
          <Button onClick={() => void resolve()} disabled={isPending || !hasNote}>
            Resolve without refund
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
