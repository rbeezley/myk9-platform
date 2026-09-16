/**
 * Entry Edit Dialog
 *
 * Allows exhibitors to modify their entries before the show's entry deadline.
 * Supports: pulling from a class, handler change, jump height change.
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, X, Save, Dog, Trophy } from 'lucide-react';
import { withdrawEntry, canModifyEntry } from '@/services/database/entries';
import { withdrawErrorMessage } from '@/services/database/entries/withdrawEligibility';
import { useWithdrawEligibility } from './useWithdrawEligibility';
import { PullConfirmDialog } from './PullConfirmDialog';
import { saveEntryEdits } from './saveEntryEdits';
import { logger } from '@/services/LoggingService';
import { disciplineUsesJumpHeight } from '@/types/template.types';
import { useEditingPresence } from '@/features/show-presence/useEditingPresence';
import { EditingBadge } from '@/features/show-presence/EditingBadge';
import { EntryStatusHistory } from './EntryStatusHistory';

interface EntryClass {
  id: string;
  name: string;
  number: string;
  fee: number;
  jumpHeight?: string;
  /** Trial discipline; gates the jump-height field (scent work has no jump height). */
  trialType?: string;
  handlerId?: string | null;
  handler?: string;
  runOrder?: number;
  status: 'entered' | 'scratched' | 'moved' | 'absent';
}

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
}

const JUMP_HEIGHTS = ['4"', '8"', '12"', '16"', '20"', '24"', '26"'];

export function EntryEditDialog({
  open,
  onOpenChange,
  entry,
  onUpdate,
  ignoreModificationDeadline = false,
  asShowManager = false,
}: EntryEditDialogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canModify, setCanModify] = useState(false);
  const [modifyReason, setModifyReason] = useState<string | undefined>();

  // Local state for edits
  const [classEdits, setClassEdits] = useState<
    Record<string, { handler?: string; jumpHeight?: string; status?: string }>
  >({});

  // MYK9-535: the Pull affordance is DISABLED with the reason when the server
  // would refuse, so the exhibitor is told up front instead of seeing an
  // optimistic "withdrawn" the RPC later rejects. See ./useWithdrawEligibility.
  const withdrawEligibility = useWithdrawEligibility(
    open,
    asShowManager,
    entry.classes.map(classEntry => classEntry.id)
  );

  // Confirm pull dialog
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
  // entries.id). The READ side is per-row (see EditingBadge below) and so covers
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

  const handleConfirmPull = async () => {
    if (!pullDialog.classId) return;

    setIsSaving(true);
    setError(null);

    try {
      const { error } = await withdrawEntry(pullDialog.classId, { asShowManager });

      if (error) {
        // Map the CODE to a sentence a person can act on. A server refusal
        // arrives as raw Postgres text carrying the row UUID ("Entry 22eb47a9-…
        // is paid; request a refund instead of withdrawing") — right for the
        // log, wrong for the dialog. `withdrawErrorMessage` owns both code
        // spaces: our own pre-check refusals (which already carry a sentence)
        // and the SQLSTATEs the RPC raises.
        setError(withdrawErrorMessage(error));
        logger.error('Failed to withdraw class entry:', 'entries', {}, error as Error);
      } else {
        // Mark as pulled locally.
        setClassEdits(prev => ({
          ...prev,
          [pullDialog.classId!]: { ...prev[pullDialog.classId!], status: 'withdrawn' },
        }));
        onUpdate();
      }
    } catch (err) {
      setError('An unexpected error occurred.');
      logger.error('Error withdrawing class entry:', 'entries', {}, err as Error);
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
        clearHandlerId: ignoreModificationDeadline,
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

  const getClassStatus = (classEntry: EntryClass) => {
    const edit = classEdits[classEntry.id];
    if (edit?.status === 'withdrawn') return 'scratched';
    return classEntry.status;
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

                  {entry.classes.map(classEntry => {
                    const status = getClassStatus(classEntry);
                    const isPulled = status === 'scratched';
                    const currentJumpHeight =
                      classEdits[classEntry.id]?.jumpHeight || classEntry.jumpHeight;
                    const currentHandler =
                      classEdits[classEntry.id]?.handler ??
                      classEntry.handler ??
                      entry.handler ??
                      '';

                    return (
                      <div
                        key={classEntry.id}
                        className={`p-3 rounded-lg border ${
                          isPulled ? 'bg-muted/50 border-muted' : 'bg-card border-border'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div
                              className={`font-medium ${
                                isPulled ? 'line-through text-muted-foreground' : ''
                              }`}
                            >
                              {classEntry.name}
                              {classEntry.number && ` #${classEntry.number}`}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              ${classEntry.fee.toFixed(2)}
                            </div>
                          </div>
                          {isPulled ? (
                            <Badge variant="secondary">Pulled</Badge>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePullRequest(classEntry.id, classEntry.name)}
                              disabled={withdrawEligibility[classEntry.id]?.allowed === false}
                              title={withdrawEligibility[classEntry.id]?.reason}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Pull
                            </Button>
                          )}
                        </div>

                        {!isPulled && withdrawEligibility[classEntry.id]?.allowed === false && (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {withdrawEligibility[classEntry.id]?.reason}
                          </p>
                        )}

                        {/* Advisory heads-up if a secretary already has THIS class
                          row's entry open on ClassDetailsPage. Keyed on the per-class
                          entries.id (not the grouped card id) so it matches the
                          secretary's surface exactly, for every class in the group. */}
                        <EditingBadge
                          entityType="entry"
                          entityId={classEntry.id}
                          className="mt-2"
                        />

                        <div className="mt-3 space-y-1.5">
                          <Label htmlFor={`handler-${classEntry.id}`} className="text-sm">
                            Handler
                          </Label>
                          <Input
                            id={`handler-${classEntry.id}`}
                            aria-label={`Handler for ${classEntry.name}`}
                            value={currentHandler}
                            onChange={e => handleHandlerChange(classEntry.id, e.target.value)}
                            placeholder="Enter handler name"
                            disabled={isPulled}
                          />
                        </div>

                        {/* Jump height only applies to jumping disciplines
                          (agility, obedience, rally). Scent work has none, so
                          hide the field rather than show an irrelevant select. */}
                        {!isPulled && disciplineUsesJumpHeight(classEntry.trialType) && (
                          <div className="mt-3 flex items-center gap-2">
                            <Label
                              htmlFor={`jump-height-${classEntry.id}`}
                              className="text-sm whitespace-nowrap"
                            >
                              Jump Height:
                            </Label>
                            <Select
                              value={currentJumpHeight || ''}
                              onValueChange={value => handleJumpHeightChange(classEntry.id, value)}
                            >
                              <SelectTrigger id={`jump-height-${classEntry.id}`} className="w-24">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JUMP_HEIGHTS.map(height => (
                                  <SelectItem key={height} value={height}>
                                    {height}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    );
                  })}
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

      <PullConfirmDialog
        open={pullDialog.open}
        className={pullDialog.className}
        isSaving={isSaving}
        onOpenChange={open =>
          !open && setPullDialog({ open: false, classId: null, className: null })
        }
        onConfirm={handleConfirmPull}
      />
    </>
  );
}
