/**
 * Leaving a class from the My Shows card, in one step (MYK9-631 AC3).
 *
 * Before this, withdrawing meant: Edit entry → an order picker labelled with an
 * 8-hex fragment of a UUID → a per-class button inside the sheet. Richard, who
 * knows the product, could not find it. Now the class row itself carries a
 * "Leave class…" control and this component is what it opens.
 *
 * Nothing here is new UX. It RE-WIRES what MYK9-632 shipped:
 * `RemoveFromClassDialog` is the chooser and confirm, `useShowRegistryId`
 * supplies the rulebook, `useWithdrawEligibility` supplies both verdicts, and
 * `withdrawEntry` is the one write — the same offline-durable path
 * `EntryEditDialog` uses, never a second one.
 *
 * Scoped to ONE class on purpose: the eligibility lookup and the registry read
 * are keyed on the open target, so closing the dialog ends them, and a second
 * class opens its own.
 *
 * @module MyEntriesPage/modules/LeaveClassDialog
 */

import React from 'react';
import { toast } from 'sonner';
import { RemoveFromClassDialog } from '@/components/entries/RemoveFromClassDialog';
import { useShowRegistryId } from '@/components/entries/useShowRegistryId';
import { useWithdrawEligibility } from '@/components/entries/useWithdrawEligibility';
import { withdrawEntry } from '@/services/database/entries';
import { withdrawErrorMessage } from '@/services/database/entries/withdrawEligibility';
import { logger } from '@/services/LoggingService';
import type { RemoveFromClassKind, WithdrawalReasonCode } from '@/features/registries';
import type { LeaveClassDialogState } from './my-entries-types';

export interface LeaveClassDialogProps {
  dialog: LeaveClassDialogState;
  onClose: () => void;
  /** Re-read the entries after a successful write, exactly as the sheet does. */
  onUpdate: () => void;
}

export const LeaveClassDialog: React.FC<LeaveClassDialogProps> = ({
  dialog,
  onClose,
  onUpdate,
}) => {
  const [isSaving, setIsSaving] = React.useState(false);
  const target = dialog.target;
  const open = dialog.open && target != null;

  // Both hooks are gated on `open`, so a closed dialog issues no reads. The
  // class-id array is rebuilt each render; the hook keys on the joined ids.
  const registry = useShowRegistryId(target?.showId, open);
  const eligibility = useWithdrawEligibility(open, false, target ? [target.classId] : []);
  const rowEligibility = target ? eligibility[target.classId] : undefined;

  const confirm = async (choice: {
    kind: RemoveFromClassKind;
    reason: WithdrawalReasonCode | null;
  }) => {
    if (!target) return;
    setIsSaving(true);
    try {
      const { error } = await withdrawEntry(target.classId, {
        kind: choice.kind,
        reason: choice.reason,
      });
      if (error) {
        // The card has no Alert slot of its own, so the refusal surfaces as a
        // toast — but it is the SAME mapped sentence the sheet shows, never the
        // raw Postgres text that carries the row UUID.
        toast.error(withdrawErrorMessage(error, choice.kind));
        logger.error(
          `Failed to ${choice.kind === 'pull' ? 'pull' : 'withdraw'} class entry from the card:`,
          'entries',
          {},
          error as Error
        );
        return;
      }
      toast.success(
        choice.kind === 'pull'
          ? `${target.dogName} is pulled from ${target.className}.`
          : `${target.dogName} is withdrawn from ${target.className}.`
      );
      onUpdate();
    } catch (err) {
      toast.error('An unexpected error occurred.');
      logger.error('Error leaving class from the card:', 'entries', {}, err as Error);
    } finally {
      setIsSaving(false);
      onClose();
    }
  };

  return (
    <RemoveFromClassDialog
      open={open}
      classId={target?.classId ?? null}
      className={target?.className ?? null}
      registry={registry}
      isSaving={isSaving}
      withdrawDisabledReason={rowEligibility?.withdraw.reason ?? null}
      pullDisabledReason={rowEligibility?.pull.reason ?? null}
      onOpenChange={next => !next && onClose()}
      onConfirm={choice => void confirm(choice)}
    />
  );
};
