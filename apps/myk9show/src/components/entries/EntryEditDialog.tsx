/**
 * Entry Edit Dialog
 *
 * Allows exhibitors to modify their entries before the show's entry deadline.
 * Supports: leaving a class (MYK9-632 — Withdraw with a recognised reason, or
 * Pull for anything else), handler change, jump height change.
 */

import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from '@myk9/ui';
import { Button } from '@/components/ui/button';
import { FormSkeleton } from '@/components/common/SkeletonLoaders';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, Save, Dog, Trophy } from 'lucide-react';
import { withdrawEntry, canModifyEntry } from '@/services/database/entries';
import { withdrawErrorMessage } from '@/services/database/entries/withdrawEligibility';
import { useWithdrawEligibility } from './useWithdrawEligibility';
import { RemoveFromClassDialog } from './RemoveFromClassDialog';
import { EntryEditClassRow, type EntryClass } from './EntryEditClassRow';
import { useShowRegistryId } from './useShowRegistryId';
import type { RemoveFromClassKind, WithdrawalReasonCode } from '@/features/registries';
import { saveEntryEdits } from './saveEntryEdits';
import { logger } from '@/services/LoggingService';
import { useEditingPresence } from '@/features/show-presence/useEditingPresence';
import { EntryStatusHistory } from './EntryStatusHistory';

interface EntryData {
  id: string;
  showId: string;
  showName: string;
  dogName: string;
  currentStatus?: string | null;
  createdAt?: string | null;
  handler?: string;
  classes: EntryClass[];
}

interface EntryEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: EntryData;
  onUpdate: () => void;
  ignoreModificationDeadline?: boolean;
  /**
   * MYK9-535: the secretary surface passes this. A show manager is admitted by
   * the `entries_update` RLS policy, so their Pull keeps the existing lifecycle
   * transition and is not bound by the exhibitor-only withdraw guards.
   */
  asShowManager?: boolean;
  /**
   * MYK9-631 Q4: My Shows passes `false`. Leaving a class is now a control on
   * the show card's class row, so the sheet is handler and jump height only —
   * which is also what its menu item is called. Every other caller keeps the
   * per-row chooser.
   */
  allowLeaveClass?: boolean;
}

export function EntryEditDialog({
  open,
  onOpenChange,
  entry,
  onUpdate,
  ignoreModificationDeadline = false,
  asShowManager = false,
  allowLeaveClass = true,
}: EntryEditDialogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canModify, setCanModify] = useState(false);
  const [modifyReason, setModifyReason] = useState<string | undefined>();

  // Local state for edits
  const [classEdits, setClassEdits] = useState<
    Record<
      string,
      { handler?: string; jumpHeight?: string; status?: string; reasonCode?: string | null }
    >
  >({});

  // MYK9-535: the affordance is DISABLED with the reason when the server would
  // refuse, so the exhibitor is told up front instead of seeing an optimistic
  // state the RPC later rejects. MYK9-632: the map now carries BOTH verdicts —
  // a paid entry may be pulled but not withdrawn. See ./useWithdrawEligibility.
  // Skipped entirely when this surface does not offer the control: the lookup
  // exists to decide whether to grey a button out, and there is no button.
  const withdrawEligibility = useWithdrawEligibility(
    open && allowLeaveClass,
    asShowManager,
    entry.classes.map(classEntry => classEntry.id)
  );

  // Which rulebook's withdrawal reasons this show offers, or the fact that we do
  // not know yet (MYK9-632). No default: "still looking" must never render as
  // "this is an AKC show".
  const registry = useShowRegistryId(entry.showId, open && allowLeaveClass);

  // Leave-this-class dialog (Withdraw vs Pull).
  const [pullDialog, setPullDialog] = useState<{
    open: boolean;
    classId: string | null;
    className: string | null;
  }>({ open: false, classId: null, className: null });

  // Phase 3 soft edit-awareness (docs/plan-show-presence.md §6): advertise that
  // this exhibitor has this entry open so a secretary editing the SAME row on
  // ClassDetailsPage sees the "X is editing this" heads-up. The presence payload
  // carries a single `editing` slot, but this card groups MULTIPLE class rows
  // (each EntryClass.id is its own entries.id). We can only broadcast one, so we
  // advertise the group's primary id (entry.id === classes[0].id, a real
  // entries.id). The READ side is per-row (see EditingBadge in EntryEditClassRow) and covers
  // every class exactly; only this WRITE side is limited to the primary class for
  // multi-class groups — a graceful, advisory-only gap (never a wrong-entity
  // badge). No-op unless mounted under a ShowPresenceProvider (MyEntriesPage wraps
  // the open dialog) and the edit-awareness flag is live.
  useEditingPresence('entry', open && entry.id ? entry.id : undefined);

  // Check if modifications are allowed when dialog opens
  useEffect(() => {
    const checkModifications = async () => {
      setIsLoading(true);
      setError(null);

      if (ignoreModificationDeadline) {
        setCanModify(true);
        setModifyReason(undefined);
        setIsLoading(false);
        return;
      }

      try {
        const result = await canModifyEntry(entry.showId);
        setCanModify(result.canModify);
        setModifyReason(result.reason);
      } catch (err) {
        logger.error(
          'Failed to check entry modification eligibility:',
          'entries',
          {},
          err as Error
        );
        setCanModify(false);
        setModifyReason("We couldn't check whether this entry can be modified. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    if (open && entry.showId) {
      checkModifications();
    }
  }, [open, entry.showId, ignoreModificationDeadline]);

  const handleJumpHeightChange = (classId: string, jumpHeight: string) => {
    setClassEdits(prev => ({
      ...prev,
      [classId]: { ...prev[classId], jumpHeight },
    }));
  };

  const handleHandlerChange = (classId: string, handler: string) => {
    setClassEdits(prev => ({
      ...prev,
      [classId]: { ...prev[classId], handler },
    }));
  };

  const handlePullRequest = (classId: string, className: string) => {
    setPullDialog({ open: true, classId, className });
  };

  const handleConfirmPull = async (choice: {
    kind: RemoveFromClassKind;
    reason: WithdrawalReasonCode | null;
  }) => {
    if (!pullDialog.classId) return;

    setIsSaving(true);
    setError(null);

    try {
      const { error } = await withdrawEntry(pullDialog.classId, {
        asShowManager,
        kind: choice.kind,
        reason: choice.reason,
      });

      if (error) {
        // Map the CODE to a sentence a person can act on. A server refusal
        // arrives as raw Postgres text carrying the row UUID ("Entry 22eb47a9-…
        // is paid; request a refund instead of withdrawing") — right for the
        // log, wrong for the dialog. `withdrawErrorMessage` owns both code
        // spaces: our own pre-check refusals (which already carry a sentence)
        // and the SQLSTATEs the RPC raises.
        setError(withdrawErrorMessage(error, choice.kind));
        logger.error(
          `Failed to ${choice.kind === 'pull' ? 'pull' : 'withdraw'} class entry:`,
          'entries',
          {},
          error as Error
        );
      } else {
        // Mark locally with the status the server just committed — a pull is
        // 'scratched', a withdrawal is 'withdrawn'. Collapsing the two here is
        // exactly the bug MYK9-632 is about.
        setClassEdits(prev => ({
          ...prev,
          [pullDialog.classId!]: {
            ...prev[pullDialog.classId!],
            status: choice.kind === 'pull' ? 'scratched' : 'withdrawn',
            // A pull NULLs the reason code server-side, so mirror that here
            // rather than leaving a previous row's reason standing.
            reasonCode: choice.kind === 'pull' ? null : choice.reason,
          },
        }));
        onUpdate();
      }
    } catch (err) {
      setError('An unexpected error occurred.');
      logger.error('Error leaving class:', 'entries', {}, err as Error);
    } finally {
      setIsSaving(false);
      setPullDialog({ open: false, classId: null, className: null });
    }
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const { error } = await saveEntryEdits({
        classes: entry.classes,
        classEdits,
        fallbackHandler: entry.handler,
      });
      if (error) {
        setError(error);
        setIsSaving(false);
        return;
      }

      onUpdate();
      onOpenChange(false);
    } catch (err) {
      setError('An unexpected error occurred while saving changes.');
      logger.error('Error saving entry edits:', 'entries', {}, err as Error);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = () => {
    for (const [classId, edits] of Object.entries(classEdits)) {
      const originalClass = entry.classes.find(c => c.id === classId);
      if (
        edits.handler !== undefined &&
        edits.handler !== (originalClass?.handler ?? entry.handler ?? '')
      ) {
        return true;
      }
      if (edits.jumpHeight && edits.jumpHeight !== originalClass?.jumpHeight) return true;
    }
    return false;
  };

  const getClassStatus = (classEntry: EntryClass): EntryClass['status'] => {
    const edit = classEdits[classEntry.id];
    // MYK9-632: 'withdrawn' no longer collapses to 'scratched'. The two acts are
    // different, and the badge below says which one happened — on a fresh load
    // (`classEntry.status`, straight from `mapClassEntryStatus`) exactly as in
    // the session that performed it.
    if (edit?.status === 'withdrawn' || edit?.status === 'scratched') {
      return edit.status;
    }
    return classEntry.status;
  };

  /**
   * The reason to show beside a Withdrawn badge: this session's choice when the
   * exhibitor just made one, otherwise the code that came down on the row.
   * `undefined` means "we have no reason to show", which is also what a pull
   * renders — and what every row reads as until migration 20260918041700 puts
   * the column on the view.
   */
  const getClassReasonCode = (classEntry: EntryClass): string | null | undefined => {
    const edit = classEdits[classEntry.id];
    if (edit?.reasonCode !== undefined) return edit.reasonCode;
    return classEntry.withdrawalReasonCode;
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent size="md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Dog className="h-5 w-5" />
              Edit Entry
            </SheetTitle>
            <SheetDescription>Modify this entry for {entry.showName}</SheetDescription>
          </SheetHeader>

          <SheetBody>
            {isLoading ? (
              <div role="status" aria-label="Loading entry edit form" className="py-4">
                <FormSkeleton />
              </div>
            ) : !canModify ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {modifyReason || 'This entry cannot be modified.'}
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-6">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Entry Info */}
                <div className="space-y-1">
                  <div className="text-sm font-medium">Dog</div>
                  <div className="text-lg">{entry.dogName}</div>
                </div>

                {/* Classes */}
                <div className="space-y-4">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <Trophy className="h-4 w-4" />
                    Classes Entered
                  </div>

                  {entry.classes.map(classEntry => (
                    <EntryEditClassRow
                      key={classEntry.id}
                      classEntry={classEntry}
                      status={getClassStatus(classEntry)}
                      reasonCode={getClassReasonCode(classEntry)}
                      rowEligibility={withdrawEligibility[classEntry.id]}
                      canOfferLeaveClass={allowLeaveClass}
                      currentHandler={
                        classEdits[classEntry.id]?.handler ??
                        classEntry.handler ??
                        entry.handler ??
                        ''
                      }
                      currentJumpHeight={
                        classEdits[classEntry.id]?.jumpHeight || classEntry.jumpHeight
                      }
                      onLeaveClass={handlePullRequest}
                      onHandlerChange={handleHandlerChange}
                      onJumpHeightChange={handleJumpHeightChange}
                    />
                  ))}
                </div>

                <EntryStatusHistory
                  entryId={entry.id}
                  currentStatus={entry.currentStatus}
                  createdAt={entry.createdAt}
                />
              </div>
            )}
          </SheetBody>

          <SheetFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {canModify && !isLoading && (
              <Button onClick={handleSaveChanges} disabled={!hasChanges() || isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <RemoveFromClassDialog
        open={allowLeaveClass && pullDialog.open}
        classId={pullDialog.classId}
        className={pullDialog.className}
        registry={registry}
        isSaving={isSaving}
        withdrawDisabledReason={
          pullDialog.classId
            ? (withdrawEligibility[pullDialog.classId]?.withdraw.reason ?? null)
            : null
        }
        pullDisabledReason={
          pullDialog.classId ? (withdrawEligibility[pullDialog.classId]?.pull.reason ?? null) : null
        }
        onOpenChange={open =>
          !open && setPullDialog({ open: false, classId: null, className: null })
        }
        onConfirm={handleConfirmPull}
      />
    </>
  );
}
