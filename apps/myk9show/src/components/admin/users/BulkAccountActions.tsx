/**
 * The account half of the roster's floating bar: Suspend, Reinstate, Send
 * invitation and Restore — each shown only when some selected person it applies
 * to — plus a More menu holding Copy emails and Export.
 *
 * A count appears on an action only when it reaches fewer than the whole
 * selection ("Suspend 3"), so the admin sees at a glance who is left out.
 */

import { ChevronUp, Copy, Download, Mail, RotateCcw, UserCheck, UserX } from 'lucide-react';
import { BulkBarButton } from '@/components/list-toolkit';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { exportUsersCSV } from '@/pages/admin/UserManagementPage.helpers';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import { BulkAccountConfirmDialog } from './BulkAccountConfirmDialog';
import { useBulkAccountActions } from './useBulkAccountActions';

interface BulkAccountActionsProps {
  selectedUsers: SelectedUser[];
  onClearSelection: () => void;
}

const ICON = 'h-4 w-4';

export function BulkAccountActions({ selectedUsers, onClearSelection }: BulkAccountActionsProps) {
  const { targets, canChangeStatus, confirming, setConfirming, run, copyEmails, isBusy } =
    useBulkAccountActions({ selectedUsers, onClearSelection });
  const total = selectedUsers.length;
  const label = (verb: string, count: number) => (count < total ? `${verb} ${count}` : verb);
  const confirmTargets =
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            More
            <ChevronUp className={ICON} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuItem className="min-h-11" onClick={() => void copyEmails()}>
            <Copy className={`${ICON} mr-2`} aria-hidden="true" />
            Copy emails
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-11"
            onClick={() => exportUsersCSV(selectedUsers.map(item => item.user))}
          >
            <Download className={`${ICON} mr-2`} aria-hidden="true" />
            Export CSV
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <BulkAccountConfirmDialog
        action={confirming === 'suspend' || confirming === 'invite' ? confirming : null}
        targets={confirmTargets}
        leftOut={total - confirmTargets.length}
        selfSkipped={targets.selfSkipped}
        isBusy={isBusy}
        onConfirm={() => confirming && void run(confirming)}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}
