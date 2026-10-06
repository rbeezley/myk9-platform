/**
 * Registration-queue bulk bar (MYK9-795) — replaces `EntryRegistrationSelectionToolbar`
 * + `EntryBulkActionMenu` with the shared list-toolkit `FloatingBulkBar`.
 *
 * Shown only on the four registration-queue views; Waitlist/Pulls/Move-ups
 * keep their existing per-row actions and get no bulk bar ("Payment and
 * refund stay per-registration").
 *
 * Accept/Reject dispatch through the existing `entryActions` bulk catalog
 * (`getEntryBulkActions` → `handleEnrollmentBulkStatusChange`), unchanged —
 * that path already resolves targets fresh from current data at dispatch and
 * re-checks eligibility. Resend and Export are new; both resolve their
 * targets from the live `selectedEntries` prop at click time, never a
 * captured snapshot, so a stale selection (an entry that became ineligible or
 * left the current data between selecting and dispatching) is re-checked the
 * same way.
 */
import { useState } from 'react';
import { CheckCircle2, Download, Mail, XCircle } from 'lucide-react';
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
import { FloatingBulkBar, BulkBarButton } from '@/components/list-toolkit';
import { getEntryBulkActions } from './entryBulkActions';
import { getUniqueResendTargets } from './entryBulkResendTargets';
import type { BulkActionResult, EntryManagementEntry } from '@/types/entry-management-types';
import type { EntryStatus } from '@/types/show-registration-types';

const REGISTRATION_NOUN = ['form', 'forms'] as const;

interface EntryManagementBulkBarProps {
  /** Registrations selected — the count `FloatingBulkBar` announces. */
  registrations: number;
  selectedEntries: EntryManagementEntry[];
  onBulkStatusChange: (
    entryIds: string[],
    status: EntryStatus,
    onFullSuccess?: () => void
  ) => BulkActionResult | Promise<BulkActionResult>;
  onClear: () => void;
  busy?: boolean;
  isResendDisabled: (registrationId: string) => boolean;
  /** Sends to every target, then clears the selection — mirrors `runBulkAndClear`. */
  onBulkResend: (registrationIds: string[]) => Promise<void>;
  onExportSelected: (entries: EntryManagementEntry[]) => void;
}

export function EntryManagementBulkBar({
  registrations,
  selectedEntries,
  onBulkStatusChange,
  onClear,
  busy = false,
  isResendDisabled,
  onBulkResend,
  onExportSelected,
}: EntryManagementBulkBarProps) {
  const [resendConfirmOpen, setResendConfirmOpen] = useState(false);

  if (registrations === 0) return null;

  // Fresh every render off the live `selectedEntries` prop — never memoized
  // across a selection change, so a click always dispatches against what is
  // selected NOW.
  const statusActions = getEntryBulkActions(selectedEntries, onBulkStatusChange, onClear);
  const acceptAction = statusActions.find(action => action.id === 'accept');
  const rejectAction = statusActions.find(action => action.id === 'reject');
  const resendTargets = getUniqueResendTargets(selectedEntries, isResendDisabled);

  const handleConfirmResend = () => {
    setResendConfirmOpen(false);
    void onBulkResend(resendTargets);
  };

  return (
    <>
      <FloatingBulkBar count={registrations} noun={REGISTRATION_NOUN} onClear={onClear}>
        {acceptAction && (
          <BulkBarButton
            onClick={acceptAction.onSelect}
            disabled={busy || Boolean(acceptAction.disabled)}
            icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          >
            {acceptAction.label}
          </BulkBarButton>
        )}
        {rejectAction && (
          <BulkBarButton
            tone="destructive"
            onClick={rejectAction.onSelect}
            disabled={busy || Boolean(rejectAction.disabled)}
            icon={<XCircle className="h-4 w-4" aria-hidden="true" />}
          >
            {rejectAction.label}
          </BulkBarButton>
        )}
        <BulkBarButton
          onClick={() => setResendConfirmOpen(true)}
          disabled={busy || resendTargets.length === 0}
          icon={<Mail className="h-4 w-4" aria-hidden="true" />}
        >
          Resend confirmation
        </BulkBarButton>
        <BulkBarButton
          onClick={() => onExportSelected(selectedEntries)}
          disabled={busy}
          icon={<Download className="h-4 w-4" aria-hidden="true" />}
        >
          Export selected
        </BulkBarButton>
      </FloatingBulkBar>

      {/* Confirm — this emails people (CLAUDE.md/owner rule: confirm steps are
          required for anything that emails people or moves money). */}
      <AlertDialog open={resendConfirmOpen} onOpenChange={setResendConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resend confirmation email?</AlertDialogTitle>
            <AlertDialogDescription>
              {resendTargets.length === 1
                ? 'This resends the confirmation email for 1 form.'
                : `This resends the confirmation email for ${resendTargets.length} forms.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmResend}>Resend</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
