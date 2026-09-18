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
  /**
   * The same fact as `isSaving`, readable SYNCHRONOUSLY.
   *
   * `AlertDialogAction` closes the dialog itself on click, so `onOpenChange`
   * fires in the same tick as the confirm handler — before the write has
   * resolved and before a `setIsSaving(true)` has been committed. A state read
   * there sees the pre-click value and lets the close through, which is how the
   * chooser used to vanish on a refusal. The ref is written before the `await`,
   * so the close request can be refused for exactly as long as a write is in
   * flight; the dialog is then dismissed deliberately, on success only.
   */
  const savingRef = React.useRef(false);
  const target = dialog.target;
  const open = dialog.open && target != null;

  // Both hooks are gated on `open`, so a closed dialog issues no reads. The
  // class-id array is rebuilt each render; the hook keys on the joined ids.
  const registry = useShowRegistryId(target?.showId, open);
  const eligibility = useWithdrawEligibility(open, false, target ? [target.classId] : []);
  const rowEligibility = target ? eligibility[target.classId] : undefined;

  /**
   * Where focus goes once the row that owned this dialog disappears.
   *
   * On success the entry is withdrawn, the list re-renders, and the row's
   * "Leave class…" button unmounts — correctly, the row is settled now. The
   * AlertDialog's own focus restore then targets a removed node and focus falls
   * to `<body>`, so a keyboard or screen-reader user loses their place on the
   * page immediately after the one destructive act. The base path did not have
   * this problem: it happened inside the Edit sheet, which stayed open.
   */
  const restoreFocus = React.useCallback((dogId: string) => {
    // After the refresh has painted, not before — the node exists throughout,
    // but focusing it while the old row is still mounted lets the dialog's own
    // restore run afterwards and win.
    requestAnimationFrame(() => {
      document.getElementById(`my-show-dog-${dogId}`)?.focus();
    });
  }, []);

  const confirm = async (choice: {
    kind: RemoveFromClassKind;
    reason: WithdrawalReasonCode | null;
  }) => {
    if (!target) return;
    savingRef.current = true;
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
        //
        // The dialog STAYS OPEN on a refusal (round 1, lens K): closing it made
        // the exhibitor re-find the row and re-walk choose → reason → confirm
        // for a failure that is usually transient. The sheet it replaces keeps
        // its Alert and stays put; this keeps the chooser and its toast.
        toast.error(withdrawErrorMessage(error, choice.kind));
        logger.error(
          `Failed to ${choice.kind === 'pull' ? 'pull' : 'withdraw'} class entry from the card:`,
          'entries',
          {},
          error as Error
        );
        savingRef.current = false;
        setIsSaving(false);
        return;
      }
      const where = target.classWhen
        ? `${target.className} · ${target.classWhen}`
        : target.className;
      toast.success(
        choice.kind === 'pull'
          ? `${target.dogName} is pulled from ${where}.`
          : `${target.dogName} is withdrawn from ${where}.`
      );
      savingRef.current = false;
      setIsSaving(false);
      onClose();
      restoreFocus(target.dogId);
      onUpdate();
    } catch (err) {
      // Same reasoning as the refusal branch: an unexpected throw is the case
      // where a retry is most likely to help, so the chooser stays open.
      toast.error('An unexpected error occurred.');
      logger.error('Error leaving class from the card:', 'entries', {}, err as Error);
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <RemoveFromClassDialog
      open={open}
      classId={target?.classId ?? null}
      className={target?.className ?? null}
      classWhen={target?.classWhen ?? null}
      registry={registry}
      isSaving={isSaving}
      withdrawDisabledReason={rowEligibility?.withdraw.reason ?? null}
      pullDisabledReason={rowEligibility?.pull.reason ?? null}
      // A close while a write is in flight is the primitive's own, fired by
      // AlertDialogAction; it is refused so a refusal can keep the chooser (and
      // the exhibitor's half-made choice) on screen. Every other close — Escape,
      // the overlay, "Keep my entry" — passes through untouched.
      onOpenChange={next => {
        if (!next && !savingRef.current) onClose();
      }}
      onConfirm={choice => void confirm(choice)}
    />
  );
};
