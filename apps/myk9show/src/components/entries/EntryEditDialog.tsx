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
import { Button } from '@/components/ui/button';
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
import {
  updateEntryDetails,
  updateEntryHandler,
  withdrawEntry,
  canModifyEntry,
} from '@/services/database/entries';
import { logger } from '@/services/LoggingService';
import { disciplineUsesJumpHeight } from '@/types/template.types';

interface EntryClass {
  id: string;
  name: string;
  number: string;
  fee: number;
  jumpHeight?: string;
  /** Trial discipline; gates the jump-height field (scent work has no jump height). */
  trialType?: string;
  handler?: string;
  runOrder?: number;
  status: 'entered' | 'scratched' | 'moved' | 'absent';
}

interface EntryData {
  id: string;
  showId: string;
  showName: string;
  dogName: string;
  handler?: string;
  classes: EntryClass[];
}

interface EntryEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: EntryData;
  onUpdate: () => void;
}

const JUMP_HEIGHTS = ['4"', '8"', '12"', '16"', '20"', '24"', '26"'];

export function EntryEditDialog({ open, onOpenChange, entry, onUpdate }: EntryEditDialogProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canModify, setCanModify] = useState(false);
  const [modifyReason, setModifyReason] = useState<string | undefined>();

  // Local state for edits
  const [classEdits, setClassEdits] = useState<
    Record<string, { handler?: string; jumpHeight?: string; status?: string }>
  >({});

  // Confirm pull dialog
  const [pullDialog, setPullDialog] = useState<{
    open: boolean;
    classId: string | null;
    className: string | null;
  }>({ open: false, classId: null, className: null });

  // Check if modifications are allowed when dialog opens
  useEffect(() => {
    const checkModifications = async () => {
      setIsLoading(true);
      setError(null);

      const result = await canModifyEntry(entry.showId);
      setCanModify(result.canModify);
      setModifyReason(result.reason);
      setIsLoading(false);
    };

    if (open && entry.showId) {
      checkModifications();
    }
  }, [open, entry.showId]);

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
      const { error } = await withdrawEntry(pullDialog.classId);

      if (error) {
        setError('Failed to withdraw from class. Please try again.');
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
      // Save handler changes per class row. A grouped dog card can contain
      // multiple entry rows, and each row may need a different handler.
      for (const classEntry of entry.classes) {
        const editedHandler = classEdits[classEntry.id]?.handler;
        const originalHandler = classEntry.handler ?? entry.handler ?? '';
        if (editedHandler !== undefined && editedHandler !== originalHandler) {
          const { error } = await updateEntryHandler({
            entryId: classEntry.id,
            handler: editedHandler,
          });
          if (error) {
            setError('Failed to update handler. Please try again.');
            setIsSaving(false);
            return;
          }
        }
      }

      // Save class entry changes (jump height)
      for (const [classId, edits] of Object.entries(classEdits)) {
        if (edits.jumpHeight && edits.status !== 'withdrawn') {
          const { error } = await updateEntryDetails({
            entryId: classId,
            updates: { jump_height: edits.jumpHeight },
          });
          if (error) {
            setError(`Failed to update jump height for class. Please try again.`);
            setIsSaving(false);
            return;
          }
        }
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
            <SheetDescription>Modify your entry for {entry.showName}</SheetDescription>
          </SheetHeader>

          <SheetBody>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Pull
                            </Button>
                          )}
                        </div>

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

      {/* Pull Confirmation Dialog */}
      <AlertDialog
        open={pullDialog.open}
        onOpenChange={open =>
          !open && setPullDialog({ open: false, classId: null, className: null })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pull from class?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to withdraw from <strong>{pullDialog.className}</strong>? This
              action cannot be undone and the entry fee will not be refunded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPull}
              disabled={isSaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Pulling...
                </>
              ) : (
                'Pull Entry'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
