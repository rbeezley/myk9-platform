/**
 * Confirmation for the two bulk account actions whose effect reaches people
 * outside this screen: Suspend (they lose sign-in) and Send invitation (they get
 * an email). Names who is affected and who was left out, before anything runs.
 */

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import { nameOf } from './bulkAccountTargets';

interface BulkAccountConfirmDialogProps {
  action: 'suspend' | 'invite' | null;
  targets: SelectedUser[];
  /** How many selected people the action leaves out. */
  leftOut: number;
  selfSkipped: boolean;
  isBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function people(count: number): string {
  return count === 1 ? '1 person' : `${count} people`;
}

const COPY = {
  suspend: {
    title: (n: number) => `Suspend ${n === 1 ? '1 account' : `${n} accounts`}?`,
    body: 'They will not be able to sign in until an admin reinstates them. Nothing else about their accounts changes.',
    leftOut: (n: number) =>
      `${people(n)} already suspended or removed ${n === 1 ? 'is' : 'are'} left out.`,
    confirm: 'Suspend',
  },
  invite: {
    title: (n: number) => `Send sign-in invitations to ${people(n)}?`,
    body: 'Each gets an email with a link to set up their account.',
    leftOut: (n: number) =>
      `${people(n)} who ${n === 1 ? 'has' : 'have'} signed in before, ${n === 1 ? 'has' : 'have'} no email, or ${n === 1 ? 'is' : 'are'} removed ${n === 1 ? 'is' : 'are'} left out.`,
    confirm: 'Send invitations',
  },
} as const;

export function BulkAccountConfirmDialog({
  action,
  targets,
  leftOut,
  selfSkipped,
  isBusy,
  onConfirm,
  onCancel,
}: BulkAccountConfirmDialogProps) {
  const copy = action ? COPY[action] : null;
  const names = targets.slice(0, 5).map(nameOf).join(', ');
  const more = targets.length > 5 ? ` and ${targets.length - 5} more` : '';
  // Your own account is counted in `leftOut` but gets its own sentence.
  const othersLeftOut = leftOut - (action === 'suspend' && selfSkipped ? 1 : 0);

  return (
    <Dialog open={!!copy} onOpenChange={open => !open && !isBusy && onCancel()}>
      {copy && (
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{copy.title(targets.length)}</DialogTitle>
            <DialogDescription>{copy.body}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 text-sm">
            <p>
              <span className="font-medium">Includes:</span> {names}
              {more}
            </p>
            {othersLeftOut > 0 && (
              <p className="text-muted-foreground">{copy.leftOut(othersLeftOut)}</p>
            )}
            {action === 'suspend' && selfSkipped && (
              <p className="text-muted-foreground">Your own account is left out.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onCancel} disabled={isBusy}>
              Cancel
            </Button>
            <Button
              variant={action === 'suspend' ? 'destructive' : 'default'}
              onClick={onConfirm}
              disabled={isBusy}
            >
              {isBusy ? 'Working…' : copy.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
