/**
 * The account half of the roster's floating bar: Suspend, Reinstate, Send
 * invitation and Restore — each shown only when some selected person it applies
 * to. Copy emails / Export live in the outer `BulkActionsBar`'s More menu.
 *
 * A count appears on an action only when it reaches fewer than the whole
 * selection ("Suspend 3"), so the admin sees at a glance who is left out.
 *
 * `selectedIds` and `usersById` are the live roster (MYK9-835) — targets and
 * eligibility are resolved fresh every render, and a retry re-resolves them
 * again from the same source (see useBulkAccountActions).
 */

import { Mail, RotateCcw, UserCheck, UserX } from 'lucide-react';
import { BulkBarButton } from '@/components/list-toolkit';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import { BulkAccountConfirmDialog } from './BulkAccountConfirmDialog';
import { useBulkAccountActions } from './useBulkAccountActions';

interface BulkAccountActionsProps {
  selectedIds: string[];
  usersById: ReadonlyMap<string, AdminUser>;
  onClearSelection: () => void;
}

const ICON = 'h-4 w-4';

export function BulkAccountActions({
  selectedIds,
  usersById,
  onClearSelection,
}: BulkAccountActionsProps) {
  const { targets, canChangeStatus, confirming, setConfirming, run, isBusy } =
    useBulkAccountActions({ selectedIds, usersById, onClearSelection });
  const total = selectedIds.length;
  const label = (verb: string, count: number) => (count < total ? `${verb} ${count}` : verb);
  const confirmTargetIds =
    confirming === 'suspend' || confirming === 'invite' ? targets[confirming] : [];

  return (
    <>
      {canChangeStatus && targets.suspend.length > 0 && (
        <BulkBarButton
          onClick={() => setConfirming('suspend')}
          disabled={isBusy}
          icon={<UserX className={ICON} aria-hidden="true" />}
        >
          {label('Suspend', targets.suspend.length)}
        </BulkBarButton>
      )}
      {canChangeStatus && targets.reinstate.length > 0 && (
        <BulkBarButton
          onClick={() => void run('reinstate')}
          disabled={isBusy}
          icon={<UserCheck className={ICON} aria-hidden="true" />}
        >
          {label('Reinstate', targets.reinstate.length)}
        </BulkBarButton>
      )}
      {targets.invite.length > 0 && (
        <BulkBarButton
          onClick={() => setConfirming('invite')}
          disabled={isBusy}
          icon={<Mail className={ICON} aria-hidden="true" />}
        >
          {label('Send invitation', targets.invite.length)}
        </BulkBarButton>
      )}
      {targets.restore.length > 0 && (
        <BulkBarButton
          onClick={() => void run('restore')}
          disabled={isBusy}
          icon={<RotateCcw className={ICON} aria-hidden="true" />}
        >
          {label('Restore', targets.restore.length)}
        </BulkBarButton>
      )}

      <BulkAccountConfirmDialog
        action={confirming === 'suspend' || confirming === 'invite' ? confirming : null}
        targetIds={confirmTargetIds}
        usersById={usersById}
        leftOut={total - confirmTargetIds.length}
        selfSkipped={targets.selfSkipped}
        isBusy={isBusy}
        onConfirm={() => confirming && void run(confirming)}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}
